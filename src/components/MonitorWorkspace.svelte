<script lang="ts">
  export let initialMode: 'inventory' | 'create' | 'edit' = 'inventory';
  export let monitorId = '';
  import { can } from '../lib/client/permissions';
  import { onMount } from 'svelte';
  import MonitorInventory from './MonitorInventory.svelte';
  import MonitorFieldConfiguration from './MonitorFieldConfiguration.svelte';
  import MonitorTagManager from './MonitorTagManager.svelte';
  import MonitorCadenceConfiguration from './MonitorCadenceConfiguration.svelte';
  import MonitorDestinationConfiguration from './MonitorDestinationConfiguration.svelte';
  import type { Monitor, MonitorStatus } from '../lib/client/monitor-types';
  import { formatMonitorCadence } from '../lib/client/monitor-format';
  import { prepareMonitorSubmission } from '../lib/client/monitor-editor-validation';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import { createMutation } from '@tanstack/svelte-query';
  import { createMonitorQueryClient, fetchMonitorPage, fetchWorkspaceTags, fetchMonitorTags, fetchWorkspaceChannels, fetchMonitorDetail, fetchMonitorChannelIds, monitorQueryKeys, monitorResourceQueryKeys, type WorkspaceTag, type MonitorChannel } from '../lib/client/monitor-queries';
  import { createEmptyMonitorDraft, createMonitorDraft, serializeMonitorChannelSelection, type FieldPrimitive } from '../lib/client/monitor-editor-state';
  import { createMonitorMutationOptions, editMonitorMutationOptions, lifecycleMonitorMutationOptions, tagMonitorMutationOptions } from '../lib/client/monitor-mutations';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveWorkspaceId } from '../lib/client/workspace-preference';

  type MonitorConfigVersion = { version: number; cadence_seconds: number; config: { fields: Array<{ name: string; path: string; primitive: number; meta?: Record<string, unknown> }> } };
  type MonitorDetail = Monitor & { config_versions?: MonitorConfigVersion[] };
  const monitorQueryClient = createMonitorQueryClient();
  const createMonitorMutation = createMutation(() => createMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const editMonitorMutation = createMutation(() => editMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const tagMonitorMutation = createMutation(() => tagMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const lifecycleMonitorMutation = createMutation(() => lifecycleMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  type Channel = MonitorChannel;

  const primitiveValues: Record<FieldPrimitive, number> = {
    size: 0, count: 1, duration: 2, timestamp: 3, boolean: 4, categorical: 5, checksum: 6, text: 7,
  };

  let workspaces: WorkspaceContext[] = [];
  let selectedWorkspaceId = '';
  let monitors: Monitor[] = [];
  let search = '';
  let statusFilter: 'all' | MonitorStatus = 'all';
  let includeArchived = false;
  let sort = 'updated_at';
  let direction: 'asc' | 'desc' = 'desc';
  let nextCursor: string | null = null;
  let cursorStack: (string | null)[] = [null];
  let pageIndex = 0;
  let loadingWorkspaces = true;
  let loadingMonitors = false;
  let bootError = '';
  let listError = '';
  let actionError = '';
  let actionMessage = '';
  let busyMonitorId = '';
  let requestSequence = 0;
  let editorLoadSequence = 0;
  let disposed = false;
  let tagLoadSequence = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let createOpen = initialMode !== 'inventory';
  let fieldConfiguration: InstanceType<typeof MonitorFieldConfiguration>;
  let cadenceError = '';
  let cadencePreview = 'Every 5 minutes';
  let editingMonitor: MonitorDetail | null = null;
  let workspaceTags: WorkspaceTag[] = [];
  let tagFilter = '';
  let tagModalOpen = false;
  let taggingMonitor: Monitor | null = null;
  let monitorTagIds: string[] = [];
  let newTagNames: string[] = [];
  let tagInput = '';
  let tagBusy = false;
  let tagReady = false;
  let tagError = '';
  let tagRequestKey = '';
  let tagRequestBody = '';
  let createRequestKey = '';
  let createRequestBody = '';
  let editRequestKey = '';
  let editRequestBody = '';
  let creating = false;
  let createError = '';
  let createMessage = '';
  let editorDraft = createEmptyMonitorDraft();
  let fieldError = '';
  let channels: Channel[] = [];
  let channelsLoading = false;
  let channelsError = '';

  function resetEditorDraft() {
    editorDraft = createEmptyMonitorDraft();
    editorDraft.channelSelectionWorkspaceId = selectedWorkspaceId;
    fieldConfiguration?.reset();
    channelsLoading = false;
    cadenceError = '';
    cadencePreview = 'Every 5 minutes';
    fieldError = '';
    createRequestKey = '';
    createRequestBody = '';
    editRequestKey = '';
    editRequestBody = '';
  }

  function isCurrentWorkspace(workspaceId: string): boolean {
    return !disposed && Boolean(workspaceId) && selectedWorkspaceId === workspaceId;
  }

  function messageFor(status: number, code: string | null): string {
    if (status === 401) return 'Your session needs attention. Sign in again to continue.';
    if (status === 403) return 'You do not have permission to perform this action in this workspace.';
    if (status === 404) return 'This monitor or workspace is no longer available.';
    if (status === 409) {
      if (code === 'idempotency_key_reused') return 'This operation key was already used for a different request. Reload before trying again.';
      return 'The monitor changed before this action completed. Refresh the list and try again.';
    }
    if (status === 422) return 'The request was not accepted. Check the monitor state and try again.';
    if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
    if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
    return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
  }

  function secondsToCadence(seconds: number) {
    if (seconds % 3600 === 0) { editorDraft.cadenceValue = String(seconds / 3600); editorDraft.cadenceUnit = 'hours'; }
    else if (seconds % 60 === 0) { editorDraft.cadenceValue = String(seconds / 60); editorDraft.cadenceUnit = 'minutes'; }
    else { editorDraft.cadenceValue = String(seconds); editorDraft.cadenceUnit = 'seconds'; }
    editorDraft.cadenceMode = 'interval';
    cadencePreview = `Every ${formatMonitorCadence(seconds)}`;
  }




  $: selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  $: canManageChannels = can(selectedWorkspace, 'workspace.destinations.manage');

  async function loadWorkspaceTags(): Promise<boolean> {
    const workspaceId = selectedWorkspaceId;
    if (!workspaceId) {
      workspaceTags = [];
      return false;
    }
    try {
      const result = await monitorQueryClient.fetchQuery({
        queryKey: monitorResourceQueryKeys.workspaceTags(workspaceId),
        queryFn: ({ signal }) => fetchWorkspaceTags(workspaceId, signal),
        staleTime: 30_000,
        retry: false,
      });
      if (disposed || workspaceId !== selectedWorkspaceId) return false;
      if (!result.ok || !result.data) {
        await monitorQueryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceTags(workspaceId) });
        return false;
      }
      workspaceTags = result.data;
      return true;
    } catch {
      // Tags are an optional organization layer; do not block monitor inventory on their availability.
      return false;
    }
  }

  async function openTagManager(monitor: Monitor) {
    if (tagBusy || creating || busyMonitorId) return;
    const workspaceId = selectedWorkspaceId;
    const requestSequenceForTags = ++tagLoadSequence;
    taggingMonitor = monitor;
    monitorTagIds = [];
    newTagNames = [];
    tagInput = '';
    tagReady = false;
    tagError = '';
    tagRequestKey = '';
    tagRequestBody = '';
    tagModalOpen = true;
    tagBusy = true;
    try {
      const tagsLoaded = await loadWorkspaceTags();
      if (disposed || requestSequenceForTags !== tagLoadSequence || workspaceId !== selectedWorkspaceId) return;
      if (!tagsLoaded) {
        tagError = 'Workspace tags could not be loaded. Close this panel and try again; no changes have been made.';
        return;
      }
      const result = await monitorQueryClient.fetchQuery({
        queryKey: monitorResourceQueryKeys.monitorTags(workspaceId, monitor.id),
        queryFn: ({ signal }) => fetchMonitorTags(workspaceId, monitor.id, signal),
        staleTime: 0,
        retry: false,
      });
      if (disposed || requestSequenceForTags !== tagLoadSequence || workspaceId !== selectedWorkspaceId) return;
      if (!result.ok) {
        tagError = messageFor(result.status, result.code);
        await monitorQueryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorTags(workspaceId, monitor.id) });
        return;
      }
      monitorTagIds = result.data.map((tag) => tag.id);
      tagReady = true;
    } catch {
      if (requestSequenceForTags === tagLoadSequence) {
        tagError = messageFor(0, 'network_error');
        tagReady = false;
      }
    } finally {
      if (requestSequenceForTags === tagLoadSequence) tagBusy = false;
    }
  }

  function closeTagManager() {
    if (tagBusy) return;
    tagModalOpen = false;
    taggingMonitor = null;
  }

  function addTagDraft() {
    const name = tagInput.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (name.length > 40) {
      tagError = 'Tag names must be 40 characters or fewer.';
      return;
    }
    if (monitorTagIds.length + newTagNames.length >= 3) {
      tagError = 'A monitor can have at most three tags.';
      return;
    }
    const existing = workspaceTags.find((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      if (!monitorTagIds.includes(existing.id)) monitorTagIds = [...monitorTagIds, existing.id];
    } else if (!newTagNames.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      newTagNames = [...newTagNames, name];
    }
    tagInput = '';
    tagError = '';
  }

  function removeTagDraft(name: string) {
    newTagNames = newTagNames.filter((tag) => tag !== name);
  }

  async function saveMonitorTags(event: SubmitEvent) {
    event.preventDefault();
    if (!taggingMonitor || tagBusy) return;
    if (monitorTagIds.length + newTagNames.length > 3) {
      tagError = 'A monitor can have at most three tags.';
      return;
    }
    const workspaceId = selectedWorkspaceId;
    const monitorId = taggingMonitor.id;
    const taggedMonitorName = taggingMonitor.name;
    if (!workspaceId) return;
    tagBusy = true;
    tagError = '';
    const requestBody = JSON.stringify({ workspace_id: workspaceId, tag_ids: monitorTagIds, create_tags: newTagNames });
    if (!tagRequestKey || tagRequestBody !== requestBody) {
      tagRequestKey = crypto.randomUUID();
      tagRequestBody = requestBody;
    }
    try {
      const result = await tagMonitorMutation.mutateAsync({
        workspaceId,
        monitorId,
        requestBody,
        idempotencyKey: tagRequestKey,
      });
      if (!isCurrentWorkspace(workspaceId) || taggingMonitor?.id !== monitorId) return;
      if (!result.ok) {
        tagError = messageFor(result.status, result.code);
        return;
      }
      tagModalOpen = false;
      taggingMonitor = null;
      tagRequestKey = '';
      tagRequestBody = '';
      actionError = '';
      actionMessage = `Tags updated for “${taggedMonitorName}”.`;
      await Promise.all([loadWorkspaceTags(), loadMonitors(null)]);
    } catch {
      if (isCurrentWorkspace(workspaceId)) tagError = messageFor(0, 'network_error');
    } finally {
      if (!disposed) tagBusy = false;
    }
  }


  async function openCreate() {
    if (initialMode === 'inventory') { window.location.href = `/monitors/new?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
    ++editorLoadSequence;
    editingMonitor = null;
    resetEditorDraft();
    createOpen = true;
    createError = '';
    createMessage = '';
    channelsError = '';
    channels = [];
    if (!selectedWorkspaceId) return;
    const workspaceId = selectedWorkspaceId;
    const sequence = editorLoadSequence;
    channelsLoading = true;
    try {
      const result = await monitorQueryClient.fetchQuery({
        queryKey: monitorResourceQueryKeys.workspaceChannels(workspaceId),
        queryFn: ({ signal }) => fetchWorkspaceChannels(workspaceId, signal),
        staleTime: 30_000,
        retry: false,
      });
      if (sequence !== editorLoadSequence || workspaceId !== selectedWorkspaceId) return;
      if (!result.ok) {
        channelsError = messageFor(result.status, result.code);
        await monitorQueryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceChannels(workspaceId) });
        return;
      }
      channels = result.data;
    } catch {
      if (sequence === editorLoadSequence) channelsError = messageFor(0, 'network_error');
    } finally {
      if (sequence === editorLoadSequence) channelsLoading = false;
    }
  }

  function closeCreate() {
    if (creating) return;
    ++editorLoadSequence;
    if (initialMode !== 'inventory') { window.location.href = `/monitors?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
    createOpen = false;
    createError = '';
    editingMonitor = null;
    resetEditorDraft();
  }

  async function openEdit(monitor: Monitor) {
    if (initialMode === 'inventory') { window.location.href = `/monitors/${encodeURIComponent(monitor.id)}/edit?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
    if (busyMonitorId || creating) return;
    const workspaceId = selectedWorkspaceId;
    const sequence = ++editorLoadSequence;
    editingMonitor = monitor as MonitorDetail;
    resetEditorDraft();
    createError = '';
    createMessage = '';
    fieldError = '';
    channelsError = '';
    channels = [];
    createOpen = true;
    creating = true;
    try {
      const [detailResult, channelIdsResult, destinationsResult] = await Promise.all([
        monitorQueryClient.fetchQuery({
          queryKey: monitorResourceQueryKeys.monitorDetail(workspaceId, monitor.id),
          queryFn: ({ signal }) => fetchMonitorDetail<MonitorDetail>(workspaceId, monitor.id, signal),
          staleTime: 0,
          retry: false,
        }),
        monitorQueryClient.fetchQuery({
          queryKey: monitorResourceQueryKeys.monitorChannels(workspaceId, monitor.id),
          queryFn: ({ signal }) => fetchMonitorChannelIds(workspaceId, monitor.id, signal),
          staleTime: 0,
          retry: false,
        }),
        monitorQueryClient.fetchQuery({
          queryKey: monitorResourceQueryKeys.workspaceChannels(workspaceId),
          queryFn: ({ signal }) => fetchWorkspaceChannels(workspaceId, signal),
          staleTime: 30_000,
          retry: false,
        }),
      ]);
      if (sequence !== editorLoadSequence || workspaceId !== selectedWorkspaceId) return;
      if (!detailResult.ok || !detailResult.data) {
        createError = messageFor(detailResult.status, detailResult.code);
        await monitorQueryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorDetail(workspaceId, monitor.id) });
        return;
      }
      const detail = detailResult.data;
      const currentConfig = detail.config_versions?.find((version) => version.version === detail.current_config_version);
      if (!currentConfig || !Array.isArray(currentConfig.config?.fields) || currentConfig.config.fields.length === 0) {
        createError = 'The current monitor configuration could not be loaded safely. Nothing has been changed.';
        return;
      }
      if (!channelIdsResult.ok) {
        createError = messageFor(channelIdsResult.status, channelIdsResult.code);
        await monitorQueryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorChannels(workspaceId, monitor.id) });
        return;
      }
      if (!destinationsResult.ok) {
        createError = messageFor(destinationsResult.status, destinationsResult.code);
        await monitorQueryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceChannels(workspaceId) });
        return;
      }
      channels = destinationsResult.data;
      const channelSelection = channelIdsResult.data.flatMap((id) => {
        const channel = channels.find((item) => item.id === id);
        return channel ? [{ kind: 'existing' as const, channel_id: channel.id, label: channel.label }] : [];
      });
      const draftFields = currentConfig.config.fields.map((field) => ({
        name: field.name,
        path: field.path,
        primitive: (Object.entries(primitiveValues).find(([, value]) => value === field.primitive)?.[0] ?? 'text') as FieldPrimitive,
      }));
      editorDraft = createMonitorDraft({
        name: detail.name,
        description: detail.description,
        fields: draftFields,
        channelSelection,
        workspaceId,
      });
      secondsToCadence(currentConfig.cadence_seconds);
      editingMonitor = detail;
    } catch {
      if (sequence === editorLoadSequence) createError = messageFor(0, 'network_error');
    } finally {
      if (sequence === editorLoadSequence) creating = false;
    }
  }

  async function createMonitor(event: SubmitEvent) {
    event.preventDefault();
    if (creating || !selectedWorkspaceId) return;
    if (editingMonitor) {
      await saveMonitorEdits(event);
      return;
    }
    createError = '';
    createMessage = '';
    if (!fieldConfiguration?.applyPendingJson()) return;
    const validation = prepareMonitorSubmission(editorDraft);
    if (!validation.ok) {
      cadenceError = validation.field === 'cadence' ? validation.error : '';
      fieldError = validation.field === 'fields' ? validation.error : '';
      if (validation.field === 'identity') createError = validation.error;
      return;
    }
    cadenceError = '';
    fieldError = '';
    const { name, description, cadenceSeconds: resolvedCadence, cadencePreview: resolvedPreview, config } = validation;
    cadencePreview = resolvedPreview;

    const payloadChannels = serializeMonitorChannelSelection(editorDraft.channelSelection);
    const workspaceId = selectedWorkspaceId;
    const payload = {
      workspace_id: workspaceId,
      name,
      description,
      cadence_seconds: resolvedCadence,
      config,
      channels: payloadChannels,
    };
    const requestBody = JSON.stringify(payload);

    if (!createRequestKey || createRequestBody !== requestBody) {
      createRequestKey = crypto.randomUUID();
      createRequestBody = requestBody;
    }
    creating = true;
    try {
      const result = await createMonitorMutation.mutateAsync({
        workspaceId,
        requestBody,
        idempotencyKey: createRequestKey,
      });
      if (!isCurrentWorkspace(workspaceId)) return;
      if (!result.ok) {
        createError = result.status === 422 && result.code === 'invalid_monitor_config'
          ? 'TrueExit rejected this field configuration. Check field names, paths, and primitive choices.'
          : messageFor(result.status, result.code);
        return;
      }
      const created = result.body as Monitor;
      resetEditorDraft();
      if (initialMode !== 'inventory') { window.location.href = `/monitors?workspace_id=${encodeURIComponent(workspaceId)}`; return; }
      createOpen = false;
      search = '';
      statusFilter = 'all';
      includeArchived = false;
      sort = 'updated_at';
      direction = 'desc';
      resetPagination();
      actionError = '';
      actionMessage = `“${created.name || name}” was created.`;
      await loadMonitors(null);
    } catch {
      if (isCurrentWorkspace(workspaceId)) createError = messageFor(0, 'network_error');
    } finally {
      if (!disposed) creating = false;
    }
  }

  async function saveMonitorEdits(event: SubmitEvent) {
    event.preventDefault();
    const original = editingMonitor;
    const workspaceId = selectedWorkspaceId;
    if (!original || creating || !workspaceId) return;
    createError = '';
    createMessage = '';
    if (!fieldConfiguration?.applyPendingJson()) return;
    const validation = prepareMonitorSubmission(editorDraft);
    if (!validation.ok) {
      cadenceError = validation.field === 'cadence' ? validation.error : '';
      fieldError = validation.field === 'fields' ? validation.error : '';
      if (validation.field === 'identity') createError = validation.error;
      return;
    }
    cadenceError = '';
    fieldError = '';
    const { name, description, cadenceSeconds: resolvedCadence, cadencePreview: resolvedPreview, config } = validation;
    cadencePreview = resolvedPreview;
    const channelsPayload = serializeMonitorChannelSelection(editorDraft.channelSelection);
    const payload = {
      expected_updated_at: original.updated_at,
      name,
      description,
      cadence_seconds: resolvedCadence,
      config,
      channels: channelsPayload,
    };
    const requestBody = JSON.stringify(payload);
    if (!editRequestKey || editRequestBody !== requestBody) {
      editRequestKey = crypto.randomUUID();
      editRequestBody = requestBody;
    }
    creating = true;
    try {
      const result = await editMonitorMutation.mutateAsync({
        workspaceId,
        monitorId: original.id,
        requestBody,
        idempotencyKey: editRequestKey,
      });
      if (!isCurrentWorkspace(workspaceId) || editingMonitor?.id !== original.id) return;
      if (!result.ok) {
        createError = result.status === 409
          ? 'This monitor changed while you were editing it. Close this form, reopen Edit monitor, and review the latest version before saving again.'
          : result.status === 422 && result.code === 'invalid_monitor_config'
            ? 'TrueExit rejected this field configuration. Check field names, paths, and value types.'
            : messageFor(result.status, result.code);
        return;
      }
      if (initialMode !== 'inventory') { window.location.href = `/monitors?workspace_id=${encodeURIComponent(workspaceId)}`; return; }
      createOpen = false;
      editingMonitor = null;
      editRequestKey = '';
      editRequestBody = '';
        actionError = '';
      actionMessage = `“${name}” was updated.`;
      resetPagination();
      await loadMonitors(null);
    } catch {
      if (isCurrentWorkspace(workspaceId) && editingMonitor?.id === original.id) createError = messageFor(0, 'network_error');
    } finally {
      if (!disposed) creating = false;
    }
  }

  function resetPagination() {
    cursorStack = [null];
    pageIndex = 0;
    nextCursor = null;
  }

  async function loadMonitors(cursor: string | null = null) {
    const sequence = ++requestSequence;
    const workspaceId = selectedWorkspaceId;
    if (!workspaceId || disposed) {
      monitors = [];
      nextCursor = null;
      loadingMonitors = false;
      return;
    }

    loadingMonitors = true;
    listError = '';
    actionError = '';

    const query = {
      workspaceId,
      limit: 25,
      sort,
      direction,
      search: search.trim(),
      status: statusFilter,
      tagId: tagFilter,
      includeArchived,
      cursor,
    } as const;

    try {
      const result = await monitorQueryClient.fetchQuery({
        queryKey: monitorQueryKeys.list(query),
        queryFn: ({ signal }) => fetchMonitorPage<Monitor>(query, signal),
        staleTime: 0,
        retry: false,
      });
      if (sequence !== requestSequence || !isCurrentWorkspace(workspaceId)) return;
      if (!result.ok || !result.page) {
        listError = messageFor(result.status, result.code);
        return;
      }
      monitors = result.page.data;
      nextCursor = result.page.page.next_cursor;
    } catch {
      if (sequence === requestSequence && isCurrentWorkspace(workspaceId)) listError = messageFor(0, 'network_error');
    } finally {
      if (sequence === requestSequence && !disposed) loadingMonitors = false;
    }
  }

  function applyFilters() {
    actionError = '';
    actionMessage = '';
    resetPagination();
    void loadMonitors(null);
  }

  function handleSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 280);
  }

  async function bootstrap() {
    if (disposed) return;
    loadingWorkspaces = true;
    bootError = '';
    try {
      const result = await loadWorkspaceBootstrap();
      if (disposed) return;
      if (!result.workspaces.ok) {
        bootError = messageFor(result.workspaces.status, result.workspaces.code);
        loadingWorkspaces = false;
        return;
      }

      workspaces = result.workspaces.data.data;
      const personalId = result.me.ok ? result.me.data.personal_workspace_id : null;
      const requestedWorkspaceId = new URLSearchParams(window.location.search).get('workspace_id') ?? '';
      selectedWorkspaceId = resolveWorkspaceId(workspaces, [requestedWorkspaceId, readActiveWorkspaceId(), personalId]);
      writeActiveWorkspaceId(selectedWorkspaceId);
      loadingWorkspaces = false;
      if (selectedWorkspaceId) void loadWorkspaceTags();
      if (selectedWorkspaceId && initialMode === 'inventory') await loadMonitors(null);
      if (initialMode === 'create') { await openCreate(); }
      else if (initialMode === 'edit' && monitorId) { await openEdit({ id: monitorId, workspace_id: selectedWorkspaceId } as Monitor); }
    } catch {
      if (!disposed) {
        bootError = messageFor(0, 'network_error');
        loadingWorkspaces = false;
      }
    }
  }

  async function runLifecycleAction(monitor: Monitor, action: 'pause' | 'resume' | 'archive' | 'restore') {
    if (busyMonitorId) return;
    const labels = { pause: 'Pause', resume: 'Resume', archive: 'Archive', restore: 'Restore' };
    if (action === 'archive' && !window.confirm(`Archive “${monitor.name}”? Its evidence and health history will be retained, and it can be restored later.`)) return;

    const workspaceId = selectedWorkspaceId;
    if (!workspaceId) return;
    busyMonitorId = monitor.id;
    actionError = '';
    actionMessage = '';
    try {
      const result = await lifecycleMonitorMutation.mutateAsync({
        workspaceId,
        monitorId: monitor.id,
        action,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!isCurrentWorkspace(workspaceId)) return;
      if (!result.ok) {
        actionError = messageFor(result.status, result.code);
        return;
      }
      actionMessage = `${monitor.name}: ${labels[action].toLowerCase()} completed.`;
      resetPagination();
      await loadMonitors(null);
    } catch {
      if (isCurrentWorkspace(workspaceId)) actionError = messageFor(0, 'network_error');
    } finally {
      if (!disposed) busyMonitorId = '';
    }
  }

  function nextPage() {
    if (!nextCursor || loadingMonitors) return;
    cursorStack = [...cursorStack.slice(0, pageIndex + 1), nextCursor];
    pageIndex += 1;
    void loadMonitors(nextCursor);
  }

  function previousPage() {
    if (pageIndex === 0 || loadingMonitors) return;
    pageIndex -= 1;
    void loadMonitors(cursorStack[pageIndex]);
  }

  onMount(() => {
    void bootstrap();
    return () => {
      disposed = true;
      requestSequence += 1;
      editorLoadSequence += 1;
      tagLoadSequence += 1;
      if (searchTimer) clearTimeout(searchTimer);
      void monitorQueryClient.cancelQueries();
      monitorQueryClient.clear();
    };
  });
</script>

<section class="monitor-workspace" aria-labelledby="monitor-page-title">
  {#if !createOpen}
    <MonitorInventory
      workspaceId={selectedWorkspaceId}
      loadingWorkspaces={loadingWorkspaces}
      bootError={bootError}
      hasWorkspace={workspaces.length > 0}
      loadingMonitors={loadingMonitors}
      listError={listError}
      actionError={actionError}
      actionMessage={actionMessage}
      monitors={monitors}
      bind:search={search}
      bind:statusFilter={statusFilter}
      bind:tagFilter={tagFilter}
      bind:sort={sort}
      bind:direction={direction}
      bind:includeArchived={includeArchived}
      workspaceTags={workspaceTags}
      tagBusy={tagBusy}
      creating={creating}
      busyMonitorId={busyMonitorId}
      nextCursor={nextCursor}
      pageIndex={pageIndex}
      onRetryWorkspace={bootstrap}
      onNewMonitor={openCreate}
      onSearchInput={handleSearchInput}
      onApplyFilters={applyFilters}
      onClearFilters={() => { search = ''; statusFilter = 'all'; tagFilter = ''; includeArchived = false; applyFilters(); }}
      onRetryList={() => loadMonitors(cursorStack[pageIndex])}
      onManageTags={openTagManager}
      onEditMonitor={openEdit}
      onLifecycleAction={runLifecycleAction}
      onPreviousPage={previousPage}
      onNextPage={nextPage}
    />
  {/if}

  {#if createOpen}
      <section class="monitor-create-modal monitor-create-page" aria-labelledby="monitor-create-title">
        <header class="monitor-create-modal__header">
          <div><p class="eyebrow">{editingMonitor ? 'EDIT CHECK' : 'NEW CHECK'}</p><h2 id="monitor-create-title">{editingMonitor ? 'Refine your signal.' : 'Give your signal a shape.'}</h2><p>{editingMonitor ? 'Update the fields, cadence, and notification destinations for this monitor.' : 'Define the fields TrueExit should observe. A monitor always needs at least one valid field.'}</p></div>
          <button class="monitor-button monitor-button--quiet" type="button" on:click={closeCreate} disabled={creating}>← Back to monitors</button>
        </header>
        {#if createError}<div class="monitor-inline-alert" role="alert">{createError}</div>{/if}
        {#if initialMode === 'edit' && creating}
          <div class="monitor-form-loading" role="status"><span class="monitor-loader" aria-hidden="true"></span><div><strong>Loading monitor configuration</strong><p>Fetching the current fields and destinations before enabling edits.</p></div></div>
        {:else}
        <form class="monitor-create-form" on:submit={createMonitor}>
          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>01</span><div><h3>Monitor details</h3><p>Make it recognisable to your team.</p></div></div>
            <div class="monitor-form-grid">
              <label class="monitor-form-field monitor-form-field--wide"><span>Name <b>*</b></span><input bind:value={editorDraft.name} maxlength="200" required placeholder="e.g. Payments pipeline" autocomplete="off" /></label>
              <label class="monitor-form-field monitor-form-field--wide"><span>Description <small>Optional</small></span><textarea bind:value={editorDraft.description} maxlength="2000" rows="2" placeholder="What should this check tell you?"></textarea></label>
              <MonitorCadenceConfiguration bind:draft={editorDraft} bind:cadenceError bind:cadencePreview />
            </div>
          </div>

          <MonitorFieldConfiguration
            bind:this={fieldConfiguration}
            draft={editorDraft}
            workspaceId={selectedWorkspaceId}
            bind:fieldError
          />

          <MonitorDestinationConfiguration
            bind:draft={editorDraft}
            {channels}
            {channelsLoading}
            {channelsError}
            {canManageChannels}
          />

          <footer class="monitor-create-footer"><p>Fields are required. Destinations are optional. You can review everything before saving.</p><div><button class="monitor-button monitor-button--quiet" type="button" on:click={closeCreate} disabled={creating}>Cancel</button><button class="monitor-button monitor-button--primary" type="submit" disabled={creating}>{creating ? (editingMonitor ? 'Saving changes…' : 'Creating monitor…') : (editingMonitor ? 'Save changes' : 'Create monitor')} <span aria-hidden="true">↗</span></button></div></footer>
        </form>
        {/if}
      </section>
  {/if}

  {#if tagModalOpen && taggingMonitor}
    <MonitorTagManager
      bind:tagInput
      bind:monitorTagIds
      {taggingMonitor}
      {workspaceTags}
      {newTagNames}
      {tagBusy}
      {tagReady}
      {tagError}
      onSubmit={saveMonitorTags}
      onAddTag={addTagDraft}
      onRemoveTag={removeTagDraft}
      onClose={closeTagManager}
    />
  {/if}
</section>
