<svelte:options runes={true} />
<script lang="ts">
  let { initialMode = 'inventory', monitorId = '' }: { initialMode?: 'inventory' | 'create' | 'edit'; monitorId?: string } = $props();
  import { can } from '../lib/client/permissions';
  import { onMount } from 'svelte';
  import MonitorInventory from './MonitorInventory.svelte';
  import MonitorFieldConfiguration from './MonitorFieldConfiguration.svelte';
  import MonitorTagManager from './MonitorTagManager.svelte';
  import MonitorCadenceConfiguration from './MonitorCadenceConfiguration.svelte';
  import MonitorDestinationConfiguration from './MonitorDestinationConfiguration.svelte';
  import type { Monitor, MonitorDetail, MonitorStatus } from '../lib/client/monitor-types';
  import { addMonitorTagDraft, removeMonitorTagDraft, getCadenceDraftFromSeconds } from '../lib/client/monitor-editor-model';
  import { prepareMonitorSubmission } from '../lib/client/monitor-editor-validation';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import { createMutation, createQuery } from '@tanstack/svelte-query';
  import { fetchWorkspaceTags, fetchMonitorTags, fetchWorkspaceChannels, fetchMonitorDetail, fetchMonitorChannelIds, monitorResourceQueryKeys, monitorListQueryOptions, type MonitorListQuery, type MonitorListResponse, type MonitorSort, type WorkspaceTag, type MonitorChannel, requireMonitorQueryResult, monitorQueryErrorMessage } from '../lib/client/monitor-queries';
  import { createEmptyMonitorDraft, createMonitorDraft, fieldPrimitiveFromValue, serializeMonitorChannelSelection } from '../lib/client/monitor-editor-state';
  import { createMonitorMutationOptions, editMonitorMutationOptions, lifecycleMonitorMutationOptions, tagMonitorMutationOptions } from '../lib/client/monitor-mutations';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveAndPersistWorkspaceId } from '../lib/client/workspace-preference';
  import { getSharedQueryClient } from '../lib/client/query-client';
  import { ApiClientError } from '../lib/client/api-client';
  import { monitorSchema, parseApiBody } from '../lib/client/api-schemas';

  // Query cache lifetime belongs to the application, not this component instance.
  const monitorQueryClient = getSharedQueryClient();
  const createMonitorMutation = createMutation(() => createMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const editMonitorMutation = createMutation(() => editMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const tagMonitorMutation = createMutation(() => tagMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const lifecycleMonitorMutation = createMutation(() => lifecycleMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  type Channel = MonitorChannel;

  let activeListQuery = $state<MonitorListQuery | null>(null);
  const monitorsQuery = createQuery(() => ({
    ...(activeListQuery ? monitorListQueryOptions(activeListQuery) : {
      queryKey: ['monitors', 'list', 'inactive'] as const,
      queryFn: async (): Promise<MonitorListResponse<Monitor>> => ({ ok: true, status: 200, code: null, requestId: null, page: { data: [], page: { next_cursor: null } } }),
    }),
    enabled: Boolean(activeListQuery?.workspaceId),
  }), () => monitorQueryClient);
  const monitors = $derived(monitorsQuery.data?.page?.data ?? []);
  const nextCursor = $derived(monitorsQuery.data?.page?.page.next_cursor ?? null);
  const loadingMonitors = $derived(Boolean(activeListQuery?.workspaceId) && monitorsQuery.isFetching);
  const listError = $derived(monitorsQuery.error ? monitorQueryErrorMessage(monitorsQuery.error, messageFor) : '');

  let workspaces: WorkspaceContext[] = $state([]);
  let selectedWorkspaceId = $state('');
  let search = $state('');
  let statusFilter: 'all' | MonitorStatus = $state('all');
  let includeArchived = $state(false);
  let sort: MonitorSort = $state('updated_at');
  let direction: 'asc' | 'desc' = $state('desc');
  let cursorStack: (string | null)[] = $state([null]);
  let pageIndex = $state(0);
  let loadingWorkspaces = $state(true);
  let bootError = $state('');
  let actionError = $state('');
  let actionMessage = $state('');
  let busyMonitorId = $state('');
  let editorLoadSequence = 0;
  let disposed = false;
  let tagLoadSequence = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let createOpen = $state(initialMode !== 'inventory');
  let fieldConfiguration = $state<InstanceType<typeof MonitorFieldConfiguration> | undefined>(undefined);
  let cadenceError = $state('');
  let cadencePreview = $state('Every 5 minutes');
  let editingMonitor: MonitorDetail | null = $state(null);
  let workspaceTags: WorkspaceTag[] = $state([]);
  let tagFilter = $state('');
  let tagModalOpen = $state(false);
  let taggingMonitor: Monitor | null = $state(null);
  let monitorTagIds: string[] = $state([]);
  let newTagNames: string[] = $state([]);
  let tagInput = $state('');
  let tagBusy = $state(false);
  let tagReady = $state(false);
  let tagError = $state('');
  let tagRequestKey = $state('');
  let tagRequestBody = $state('');
  let createRequestKey = $state('');
  let createRequestBody = $state('');
  let editRequestKey = $state('');
  let editRequestBody = $state('');
  let creating = $state(false);
  let createError = $state('');
  let createMessage = $state('');
  let editorDraft = $state(createEmptyMonitorDraft());
  let fieldError = $state('');
  let channels: Channel[] = $state([]);
  let channelsLoading = $state(false);
  let channelsError = $state('');

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
    const cadence = getCadenceDraftFromSeconds(seconds);
    editorDraft.cadenceValue = cadence.cadenceValue;
    editorDraft.cadenceUnit = cadence.cadenceUnit;
    editorDraft.cadenceMode = cadence.cadenceMode;
    cadencePreview = cadence.cadencePreview;
  }




  const selectedWorkspace = $derived(workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null);
  const canManageChannels = $derived(can(selectedWorkspace, 'workspace.destinations.manage'));

  function monitorMutationErrorMessage(error: unknown, operation: 'create' | 'edit'): string {
    if (!(error instanceof ApiClientError)) return messageFor(0, 'network_error');
    if (operation === 'edit' && error.status === 409) {
      return 'This monitor changed while you were editing it. Close this form, reopen Edit monitor, and review the latest version before saving again.';
    }
    if (error.status === 422 && error.code === 'invalid_monitor_config') {
      return operation === 'create'
        ? 'TrueExit rejected this field configuration. Check field names, paths, and primitive choices.'
        : 'TrueExit rejected this field configuration. Check field names, paths, and value types.';
    }
    return messageFor(error.status, error.code);
  }

  async function loadWorkspaceTags(): Promise<boolean> {
    const workspaceId = selectedWorkspaceId;
    if (!workspaceId) {
      workspaceTags = [];
      return false;
    }
    try {
      const result = await monitorQueryClient.fetchQuery({
        queryKey: monitorResourceQueryKeys.workspaceTags(workspaceId),
        queryFn: async ({ signal }) => requireMonitorQueryResult(await fetchWorkspaceTags(workspaceId, signal)),
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
        queryFn: async ({ signal }) => requireMonitorQueryResult(await fetchMonitorTags(workspaceId, monitor.id, signal)),
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
    } catch (error) {
      if (requestSequenceForTags === tagLoadSequence) {
        tagError = monitorQueryErrorMessage(error, messageFor);
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
    const result = addMonitorTagDraft({
      input: tagInput,
      selectedTagIds: monitorTagIds,
      newTagNames,
      workspaceTags,
    });
    if (result.kind === 'unchanged') return;
    if (result.kind === 'error') {
      tagError = result.message;
      return;
    }
    monitorTagIds = result.selectedTagIds;
    newTagNames = result.newTagNames;
    tagInput = '';
    tagError = '';
  }

  function removeTagDraft(name: string) {
    newTagNames = removeMonitorTagDraft(newTagNames, name);
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
      await tagMonitorMutation.mutateAsync({
        workspaceId,
        monitorId,
        requestBody,
        idempotencyKey: tagRequestKey,
      });
      if (!isCurrentWorkspace(workspaceId) || taggingMonitor?.id !== monitorId) return;
      tagModalOpen = false;
      taggingMonitor = null;
      tagRequestKey = '';
      tagRequestBody = '';
      actionError = '';
      actionMessage = `Tags updated for “${taggedMonitorName}”.`;
      await Promise.all([loadWorkspaceTags(), loadMonitors(null)]);
    } catch (error) {
      if (isCurrentWorkspace(workspaceId)) tagError = error instanceof ApiClientError ? messageFor(error.status, error.code) : messageFor(0, 'network_error');
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
        queryFn: async ({ signal }) => requireMonitorQueryResult(await fetchWorkspaceChannels(workspaceId, signal)),
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
    } catch (error) {
      if (sequence === editorLoadSequence) channelsError = monitorQueryErrorMessage(error, messageFor);
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

  async function openEdit(monitor: Pick<Monitor, 'id'>) {
    if (initialMode === 'inventory') { window.location.href = `/monitors/${encodeURIComponent(monitor.id)}/edit?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
    if (busyMonitorId || creating) return;
    const workspaceId = selectedWorkspaceId;
    const sequence = ++editorLoadSequence;
    editingMonitor = null;
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
          queryFn: async ({ signal }) => requireMonitorQueryResult(await fetchMonitorDetail(workspaceId, monitor.id, signal)),
          staleTime: 0,
          retry: false,
        }),
        monitorQueryClient.fetchQuery({
          queryKey: monitorResourceQueryKeys.monitorChannels(workspaceId, monitor.id),
          queryFn: async ({ signal }) => requireMonitorQueryResult(await fetchMonitorChannelIds(workspaceId, monitor.id, signal)),
          staleTime: 0,
          retry: false,
        }),
        monitorQueryClient.fetchQuery({
          queryKey: monitorResourceQueryKeys.workspaceChannels(workspaceId),
          queryFn: async ({ signal }) => requireMonitorQueryResult(await fetchWorkspaceChannels(workspaceId, signal)),
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
        primitive: fieldPrimitiveFromValue(field.primitive) ?? 'text',
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
    } catch (error) {
      if (sequence === editorLoadSequence) createError = monitorQueryErrorMessage(error, messageFor);
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
      const created = parseApiBody(monitorSchema, result.body, { status: result.status, requestId: result.requestId });
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
    } catch (error) {
      if (isCurrentWorkspace(workspaceId)) createError = monitorMutationErrorMessage(error, 'create');
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
      await editMonitorMutation.mutateAsync({
        workspaceId,
        monitorId: original.id,
        requestBody,
        idempotencyKey: editRequestKey,
      });
      if (!isCurrentWorkspace(workspaceId) || editingMonitor?.id !== original.id) return;
      if (initialMode !== 'inventory') { window.location.href = `/monitors?workspace_id=${encodeURIComponent(workspaceId)}`; return; }
      createOpen = false;
      editingMonitor = null;
      editRequestKey = '';
      editRequestBody = '';
        actionError = '';
      actionMessage = `“${name}” was updated.`;
      resetPagination();
      await loadMonitors(null);
    } catch (error) {
      if (isCurrentWorkspace(workspaceId) && editingMonitor?.id === original.id) createError = monitorMutationErrorMessage(error, 'edit');
    } finally {
      if (!disposed) creating = false;
    }
  }

  function resetPagination() {
    cursorStack = [null];
    pageIndex = 0;
  }

  async function loadMonitors(cursor: string | null = null) {
    const workspaceId = selectedWorkspaceId;
    if (!workspaceId || disposed) {
      activeListQuery = null;
      return;
    }

    actionError = '';
    const query: MonitorListQuery = {
      workspaceId,
      limit: 25,
      sort,
      direction,
      search: search.trim(),
      status: statusFilter,
      tagId: tagFilter,
      includeArchived,
      cursor,
    };
    activeListQuery = query;

    // fetchQuery shares the same key and query function as the reactive observer.
    // It lets existing mutation/navigation handlers await the refresh without
    // maintaining a second copy of query data or query lifecycle state.
    try {
      await monitorQueryClient.fetchQuery(monitorListQueryOptions(query));
    } catch {
      // The reactive query owns error state; the component derives listError from it.
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
      selectedWorkspaceId = resolveAndPersistWorkspaceId(workspaces, [requestedWorkspaceId, readActiveWorkspaceId(), personalId]);
      loadingWorkspaces = false;
      if (selectedWorkspaceId) void loadWorkspaceTags();
      if (selectedWorkspaceId && initialMode === 'inventory') await loadMonitors(null);
      if (initialMode === 'create') { await openCreate(); }
      else if (initialMode === 'edit' && monitorId) { await openEdit({ id: monitorId }); }
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
      await lifecycleMonitorMutation.mutateAsync({
        workspaceId,
        monitorId: monitor.id,
        action,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!isCurrentWorkspace(workspaceId)) return;
      actionMessage = `${monitor.name}: ${labels[action].toLowerCase()} completed.`;
      resetPagination();
      await loadMonitors(null);
    } catch (error) {
      if (isCurrentWorkspace(workspaceId)) actionError = error instanceof ApiClientError ? messageFor(error.status, error.code) : messageFor(0, 'network_error');
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
      editorLoadSequence += 1;
      tagLoadSequence += 1;
      if (searchTimer) clearTimeout(searchTimer);
      // Do not cancel or clear the application-wide cache when this island unmounts.
      // Query identity and the editor/tag sequence guards prevent stale results from applying.
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
          <button class="monitor-button monitor-button--quiet" type="button" onclick={closeCreate} disabled={creating}>← Back to monitors</button>
        </header>
        {#if createError}<div class="monitor-inline-alert" role="alert">{createError}</div>{/if}
        {#if initialMode === 'edit' && creating}
          <div class="monitor-form-loading" role="status"><span class="monitor-loader" aria-hidden="true"></span><div><strong>Loading monitor configuration</strong><p>Fetching the current fields and destinations before enabling edits.</p></div></div>
        {:else}
        <form class="monitor-create-form" onsubmit={createMonitor}>
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

          <footer class="monitor-create-footer"><p>Fields are required. Destinations are optional. You can review everything before saving.</p><div><button class="monitor-button monitor-button--quiet" type="button" onclick={closeCreate} disabled={creating}>Cancel</button><button class="monitor-button monitor-button--primary" type="submit" disabled={creating}>{creating ? (editingMonitor ? 'Saving changes…' : 'Creating monitor…') : (editingMonitor ? 'Save changes' : 'Create monitor')} <span aria-hidden="true">↗</span></button></div></footer>
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
