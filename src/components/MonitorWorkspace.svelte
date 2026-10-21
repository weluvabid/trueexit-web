<script lang="ts">
  export let initialMode: 'inventory' | 'create' | 'edit' = 'inventory';
  export let monitorId = '';
  import { can } from '../lib/client/permissions';
  import { onMount } from 'svelte';
  import MonitorInventory from './MonitorInventory.svelte';
  import type { Monitor, MonitorStatus } from '../lib/client/monitor-types';
  import { formatMonitorCadence } from '../lib/client/monitor-format';
  import { buildMonitorConfig, resolveMonitorCadence, validateMonitorIdentity } from '../lib/client/monitor-editor-validation';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import { createMutation } from '@tanstack/svelte-query';
  import { createMonitorQueryClient, fetchMonitorPage, fetchMonitorTemplates, monitorQueryKeys, monitorTemplateQueryKeys, type MonitorTemplate } from '../lib/client/monitor-queries';
  import { createEmptyMonitorDraft, createMonitorDraft, type ChannelKind, type ChannelSelection, type FieldPrimitive, type MonitorField } from '../lib/client/monitor-editor-state';
  import { createMonitorMutationOptions, editMonitorMutationOptions, lifecycleMonitorMutationOptions, tagMonitorMutationOptions } from '../lib/client/monitor-mutations';

  type MonitorConfigVersion = { version: number; cadence_seconds: number; config: { fields: Array<{ name: string; path: string; primitive: number; meta?: Record<string, unknown> }> } };
  type MonitorDetail = Monitor & { config_versions?: MonitorConfigVersion[] };
  const monitorQueryClient = createMonitorQueryClient();
  const createMonitorMutation = createMutation(() => createMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const editMonitorMutation = createMutation(() => editMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const tagMonitorMutation = createMutation(() => tagMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  const lifecycleMonitorMutation = createMutation(() => lifecycleMonitorMutationOptions(monitorQueryClient), () => monitorQueryClient);
  type ApiErrorBody = { error?: { code?: string }; request_id?: string };
  type WorkspaceTag = { id: string; workspace_id: string; name: string; monitor_count: number; created_at: string; updated_at: string };
  type Channel = { id: string; label: string; type: ChannelKind; enabled: boolean; configured: boolean };

  const primitiveValues: Record<FieldPrimitive, number> = {
    size: 0, count: 1, duration: 2, timestamp: 3, boolean: 4, categorical: 5, checksum: 6, text: 7,
  };
  const CHECKSUM_ALGORITHM_SHA256 = 0;
  const CHECKSUM_ENCODING_HEXADECIMAL = 0;
  const primitiveLabels: Record<FieldPrimitive, string> = {
    size: 'Size', count: 'Count', duration: 'Duration', timestamp: 'Timestamp',
    boolean: 'Boolean', categorical: 'Categorical', checksum: 'Checksum', text: 'Text',
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
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let createOpen = initialMode !== 'inventory';
  let fieldMode: 'json' | 'fields' | 'templates' = 'fields';
  let jsonDraft = '';
  let jsonError = '';
  let templates: MonitorTemplate[] = [];
  let templatesLoading = false;
  let templatesError = '';
  let selectedTemplateId = '';
  let templateApplyMode: 'replace' | 'merge' = 'replace';
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
  let selectedExistingChannelId = '';
  let newChannelOpen = false;
  let newChannelType: ChannelKind = 'webhook';
  let newChannelLabel = '';
  let newChannelAddress = '';
  let newChannelPriority = 0;
  let newChannelError = '';
  let newChannelHeaders = '';

  function resetEditorDraft() {
    editorDraft = createEmptyMonitorDraft();
    editorDraft.channelSelectionWorkspaceId = selectedWorkspaceId;
    fieldMode = 'fields';
    jsonDraft = '';
    jsonError = '';
    selectedTemplateId = '';
    templateApplyMode = 'replace';
    cadenceError = '';
    cadencePreview = 'Every 5 minutes';
    fieldError = '';
    newChannelOpen = false;
    newChannelType = 'webhook';
    newChannelLabel = '';
    newChannelAddress = '';
    newChannelPriority = 0;
    newChannelError = '';
    newChannelHeaders = '';
    createRequestKey = '';
    createRequestBody = '';
    editRequestKey = '';
    editRequestBody = '';
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


  function resolveCadence() {
    const cadence = resolveMonitorCadence(editorDraft);
    cadenceError = cadence.ok ? '' : cadence.error;
    if (cadence.ok) cadencePreview = cadence.preview;
  }


  function flattenJson(value: unknown, prefix = ''): MonitorField[] {
    const result: MonitorField[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Paste a JSON object at the top level.');
    const visit = (node: unknown, path: string) => {
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        for (const [key, child] of Object.entries(node as Record<string, unknown>)) visit(child, path ? `${path}.${key}` : key);
        return;
      }
      if (Array.isArray(node) || node === undefined) return;
      const primitive: FieldPrimitive = typeof node === 'boolean' ? 'boolean' : typeof node === 'number' ? 'count' : node === null ? 'text' : 'text';
      result.push({ key: editorDraft.nextFieldKey++, name: path.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || `field_${result.length + 1}`, path, primitive });
    };
    visit(value, prefix);
    if (!result.length) throw new Error('No scalar values were found. Include at least one number, string, boolean, or null value.');
    if (result.length > 50) throw new Error('This editor supports up to 50 fields.');
    return result;
  }

  function syncJsonFromFields() {
    const nested: Record<string, unknown> = {};
    for (const field of editorDraft.fields) {
      const path = field.path.trim();
      if (!field.name.trim() || !path) throw new Error('Complete or remove blank field rows before switching to JSON.');
      if (path.split('.').some((part) => !part.trim())) throw new Error(`The path “${path}” contains an empty segment.`);
      const parts = path.split('.');
      let cursor: Record<string, unknown> = nested;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];
        if (!part || (cursor[part] !== undefined && (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])))) throw new Error(`The path “${path}” conflicts with another field.`);
        cursor[part] = cursor[part] ?? {};
        cursor = cursor[part] as Record<string, unknown>;
      }
      const leaf = parts[parts.length - 1];
      if (!leaf || cursor[leaf] !== undefined) throw new Error(`The path “${path}” is duplicated or conflicts with another field.`);
      cursor[leaf] = field.primitive === 'boolean' ? true : field.primitive === 'count' || field.primitive === 'size' || field.primitive === 'duration' ? 0 : field.primitive === 'timestamp' ? '2026-01-01T00:00:00Z' : field.primitive === 'checksum' ? 'sha256-example' : 'example';
    }
    jsonDraft = JSON.stringify(nested, null, 2);
    jsonError = '';
  }

  function applyJsonDraft() {
    try {
      const parsed: unknown = JSON.parse(jsonDraft);
      const discovered = flattenJson(parsed);
      editorDraft.fields = discovered;
      fieldError = '';
      jsonError = '';
      fieldMode = 'fields';
    } catch (error) {
      jsonError = error instanceof Error ? error.message : 'Check the JSON and try again.';
    }
  }

  async function loadTemplates() {
    if (!selectedWorkspaceId) return;
    templatesLoading = true;
    templatesError = '';
    try {
      const result = await monitorQueryClient.fetchQuery({
        queryKey: monitorTemplateQueryKeys.workspaceList(selectedWorkspaceId),
        queryFn: ({ signal }) => fetchMonitorTemplates(selectedWorkspaceId, signal),
        staleTime: 30_000,
        retry: false,
      });
      if (!result.ok) {
        templatesError = messageFor(result.status, result.code);
        return;
      }
      templates = result.data;
    } catch {
      templatesError = messageFor(0, 'network_error');
    } finally {
      templatesLoading = false;
    }
  }

  async function applySelectedTemplate() {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template || !template.fields.length) return;
    const mapped = template.fields.map((field) => ({ key: editorDraft.nextFieldKey++, name: field.name, path: field.path, primitive: (Object.entries(primitiveValues).find(([, value]) => value === field.primitive)?.[0] ?? 'text') as FieldPrimitive }));
    if (mapped.length > 50 || (templateApplyMode === 'merge' && editorDraft.fields.length + mapped.length > 50)) { templatesError = 'The resulting configuration would exceed the 50-field limit. Choose a smaller template or replace the current fields.'; return; }
    if (templateApplyMode === 'merge') {
      const existing = new Set(editorDraft.fields.map((field) => field.path));
      const duplicates = mapped.filter((field) => existing.has(field.path));
      if (duplicates.length) { templatesError = `Cannot merge because these paths already exist: ${duplicates.map((field) => field.path).join(', ')}.`; return; }
      editorDraft.fields = [...editorDraft.fields, ...mapped];
    } else editorDraft.fields = mapped;
    fieldError = '';
    templatesError = '';
    fieldMode = 'fields';
  }

  $: selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  $: canManageChannels = can(selectedWorkspace, 'workspace.destinations.manage');
  $: availableChannels = channels.filter((channel) => channel.enabled && !editorDraft.channelSelection.some((item) => item.kind === 'existing' && item.channel_id === channel.id));

  async function loadWorkspaceTags(): Promise<boolean> {
    if (!selectedWorkspaceId) {
      workspaceTags = [];
      return false;
    }
    try {
      const response = await fetch(`/api/backend/workspaces/${encodeURIComponent(selectedWorkspaceId)}/tags`, {
        headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store',
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) return false;
      if (Array.isArray(body)) workspaceTags = body as WorkspaceTag[];
      else if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) workspaceTags = body.data as WorkspaceTag[];
      else return false;
      return true;
    } catch {
      // Tags are an optional organization layer; do not block monitor inventory on their availability.
      return false;
    }
  }

  async function openTagManager(monitor: Monitor) {
    if (tagBusy || creating || busyMonitorId) return;
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
      if (!tagsLoaded) {
        tagError = 'Workspace tags could not be loaded. Close this panel and try again; no changes have been made.';
        return;
      }
      const response = await fetch(`/api/backend/monitors/${encodeURIComponent(monitor.id)}/tags?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`, {
        headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store',
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorBody = body as ApiErrorBody | null;
        tagError = messageFor(response.status, errorBody?.error?.code ?? null);
        return;
      }
      const assigned = Array.isArray(body) ? body as WorkspaceTag[] : (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data) ? body.data as WorkspaceTag[] : []);
      monitorTagIds = assigned.map((tag) => tag.id);
      tagReady = true;
    } catch {
      tagError = messageFor(0, 'network_error');
      tagReady = false;
    } finally {
      tagBusy = false;
    }
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
    tagBusy = true;
    tagError = '';
    const taggedMonitorName = taggingMonitor.name;
    const requestBody = JSON.stringify({ workspace_id: selectedWorkspaceId, tag_ids: monitorTagIds, create_tags: newTagNames });
    if (!tagRequestKey || tagRequestBody !== requestBody) {
      tagRequestKey = crypto.randomUUID();
      tagRequestBody = requestBody;
    }
    try {
      const result = await tagMonitorMutation.mutateAsync({
        workspaceId: selectedWorkspaceId,
        monitorId: taggingMonitor.id,
        requestBody,
        idempotencyKey: tagRequestKey,
      });
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
      tagError = messageFor(0, 'network_error');
    } finally {
      tagBusy = false;
    }
  }


  async function openCreate() {
    if (initialMode === 'inventory') { window.location.href = `/monitors/new?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
    editingMonitor = null;
    resetEditorDraft();
    createOpen = true;
    createError = '';
    createMessage = '';
    channelsError = '';
    channels = [];
    selectedExistingChannelId = '';
    if (!selectedWorkspaceId) return;
    channelsLoading = true;
    try {
      const response = await fetch(`/api/backend/workspaces/${encodeURIComponent(selectedWorkspaceId)}/channels`, {
        headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store',
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorBody = body as ApiErrorBody | null;
        channelsError = messageFor(response.status, errorBody?.error?.code ?? null);
        return;
      }
      channels = Array.isArray(body) ? body as Channel[] : [];
      selectedExistingChannelId = availableChannels[0]?.id ?? '';
    } catch {
      channelsError = messageFor(0, 'network_error');
    } finally {
      channelsLoading = false;
    }
  }

  function closeCreate() {
    if (creating) return;
    if (initialMode !== 'inventory') { window.location.href = `/monitors?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
    createOpen = false;
    newChannelOpen = false;
    createError = '';
    editingMonitor = null;
    resetEditorDraft();
  }

  async function openEdit(monitor: Monitor) {
    if (initialMode === 'inventory') { window.location.href = `/monitors/${encodeURIComponent(monitor.id)}/edit?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
    if (busyMonitorId || creating) return;
    editingMonitor = monitor as MonitorDetail;
    resetEditorDraft();
    createError = '';
    createMessage = '';
    fieldError = '';
    channelsError = '';
    channels = [];
    selectedExistingChannelId = '';
    createOpen = true;
    creating = true;
    try {
      const detailUrl = `/api/backend/monitors/${encodeURIComponent(monitor.id)}?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`;
      const channelsUrl = `/api/backend/monitors/${encodeURIComponent(monitor.id)}/channels?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`;
      const destinationsUrl = `/api/backend/workspaces/${encodeURIComponent(selectedWorkspaceId)}/channels`;
      const [detailResponse, channelResponse, destinationsResponse] = await Promise.all([
        fetch(detailUrl, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' }),
        fetch(channelsUrl, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' }),
        fetch(destinationsUrl, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' }),
      ]);
      const detailBody: unknown = await detailResponse.json().catch(() => null);
      if (!detailResponse.ok) {
        const errorBody = detailBody as ApiErrorBody | null;
        createError = messageFor(detailResponse.status, errorBody?.error?.code ?? null);
        return;
      }
      const detail = detailBody as MonitorDetail;
      const currentConfig = detail.config_versions?.find((version) => version.version === detail.current_config_version);
      if (!currentConfig || !Array.isArray(currentConfig.config?.fields) || currentConfig.config.fields.length === 0) {
        createError = 'The current monitor configuration could not be loaded safely. Nothing has been changed.';
        return;
      }
      const channelBody: unknown = await channelResponse.json().catch(() => null);
      if (!channelResponse.ok) {
        const errorBody = channelBody as ApiErrorBody | null;
        createError = messageFor(channelResponse.status, errorBody?.error?.code ?? null);
        return;
      }
      const destinationBody: unknown = await destinationsResponse.json().catch(() => null);
      if (!destinationsResponse.ok) {
        const errorBody = destinationBody as ApiErrorBody | null;
        createError = messageFor(destinationsResponse.status, errorBody?.error?.code ?? null);
        return;
      }
      const selectedIds = (channelBody as { channel_ids?: string[] } | null)?.channel_ids ?? [];
      channels = Array.isArray(destinationBody) ? destinationBody as Channel[] : [];
      const channelSelection = selectedIds.flatMap((id) => {
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
        workspaceId: selectedWorkspaceId,
      });
      selectedExistingChannelId = availableChannels[0]?.id ?? '';
      secondsToCadence(currentConfig.cadence_seconds);
      editingMonitor = detail;
    } catch {
      createError = messageFor(0, 'network_error');
    } finally {
      creating = false;
    }
  }

  function addField() {
    if (editorDraft.fields.length >= 50) return;
    editorDraft.fields = [...editorDraft.fields, { key: editorDraft.nextFieldKey++, name: '', path: '', primitive: 'count' }];
    fieldError = '';
  }

  function removeField(key: number) {
    if (editorDraft.fields.length <= 1) return;
    editorDraft.fields = editorDraft.fields.filter((field) => field.key !== key);
    fieldError = '';
  }

  function addExistingChannel() {
    if (!selectedExistingChannelId || editorDraft.channelSelection.length >= 25) return;
    const channel = channels.find((item) => item.id === selectedExistingChannelId);
    if (!channel || editorDraft.channelSelection.some((item) => item.kind === 'existing' && item.channel_id === channel.id)) return;
    editorDraft.channelSelection = [...editorDraft.channelSelection, { kind: 'existing', channel_id: channel.id, label: channel.label }];
    selectedExistingChannelId = availableChannels.find((item) => item.id !== channel.id)?.id ?? '';
  }

  function addNewChannel() {
    newChannelError = '';
    if (!canManageChannels) {
      newChannelError = 'Only a workspace owner or admin can configure a new destination. You can still select an existing destination.';
      return;
    }
    if (editorDraft.channelSelection.length >= 25) {
      newChannelError = 'A monitor can select at most 25 destinations.';
      return;
    }
    const label = newChannelLabel.trim();
    if (!label || label.length > 80) {
      newChannelError = 'Enter a destination label between 1 and 80 characters.';
      return;
    }
    let config: Record<string, string>;
    if (newChannelType === 'email') {
      const recipient = newChannelAddress.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 320) {
        newChannelError = 'Enter a valid recipient email address.';
        return;
      }
      config = { to: recipient };
    } else {
      const url = newChannelAddress.trim();
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !parsed.hostname) throw new Error('invalid');
        if (newChannelType === 'slack' && !(['hooks.slack.com', 'hooks.slack-gov.com'].includes(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith('/services/'))) throw new Error('invalid');
        if (newChannelType === 'discord' && !(['discord.com', 'discordapp.com'].includes(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith('/api/webhooks/'))) throw new Error('invalid');
        config = { url };
      } catch {
        newChannelError = newChannelType === 'slack'
          ? 'Use a Slack incoming webhook URL from hooks.slack.com/services/….'
          : newChannelType === 'discord'
            ? 'Use a Discord webhook URL from discord.com/api/webhooks/….'
            : 'Enter a valid HTTPS destination URL.';
        return;
      }
      if (newChannelHeaders.trim()) {
        try {
          const parsedHeaders: unknown = JSON.parse(newChannelHeaders);
          if (!parsedHeaders || Array.isArray(parsedHeaders) || typeof parsedHeaders !== 'object' || Object.values(parsedHeaders).some((value) => typeof value !== 'string')) throw new Error('invalid');
          config.headers = JSON.stringify(parsedHeaders) as unknown as string;
          config = { ...config, ...({ headers: parsedHeaders } as unknown as Record<string, string>) };
        } catch {
          newChannelError = 'Custom headers must be a JSON object whose values are strings.';
          return;
        }
      }
    }
    editorDraft.channelSelection = [...editorDraft.channelSelection, {
      kind: 'new', type: newChannelType, label, priority: newChannelPriority, enabled: true, config, displayLabel: label,
    }];
    newChannelLabel = '';
    newChannelAddress = '';
    newChannelPriority = 0;
    newChannelHeaders = '';
    newChannelOpen = false;
  }

  function removeChannelSelection(index: number) {
    editorDraft.channelSelection = editorDraft.channelSelection.filter((_, itemIndex) => itemIndex !== index);
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
    if (fieldMode === 'json') { applyJsonDraft(); if (fieldMode === 'json') return; }
    const identity = validateMonitorIdentity(editorDraft.name, editorDraft.description);
    if (!identity.ok) {
      createError = identity.error;
      return;
    }
    const name = identity.name;
    const cadence = resolveMonitorCadence(editorDraft);
    cadenceError = cadence.ok ? '' : cadence.error;
    if (!cadence.ok) return;
    cadencePreview = cadence.preview;
    const configResult = buildMonitorConfig(editorDraft.fields);
    fieldError = configResult.ok ? '' : configResult.error;
    if (!configResult.ok) return;
    const resolvedCadence = cadence.seconds;
    const config = configResult.config;

    const payloadChannels = editorDraft.channelSelection.map((selection) => {
      if (selection.kind === 'existing') return { kind: 'existing', channel_id: selection.channel_id };
      return { kind: 'new', type: selection.type, label: selection.label, priority: selection.priority, enabled: selection.enabled, config: selection.config };
    });
    const payload = {
      workspace_id: selectedWorkspaceId,
      name,
      description: identity.description,
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
        workspaceId: selectedWorkspaceId,
        requestBody,
        idempotencyKey: createRequestKey,
      });
      if (!result.ok) {
        createError = result.status === 422 && result.code === 'invalid_monitor_config'
          ? 'TrueExit rejected this field configuration. Check field names, paths, and primitive choices.'
          : messageFor(result.status, result.code);
        return;
      }
      const created = result.body as Monitor;
      resetEditorDraft();
      if (initialMode !== 'inventory') { window.location.href = `/monitors?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
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
      createError = messageFor(0, 'network_error');
    } finally {
      creating = false;
    }
  }

  async function saveMonitorEdits(event: SubmitEvent) {
    event.preventDefault();
    const original = editingMonitor;
    if (!original || creating || !selectedWorkspaceId) return;
    createError = '';
    createMessage = '';
    if (fieldMode === 'json') { applyJsonDraft(); if (fieldMode === 'json') return; }
    const identity = validateMonitorIdentity(editorDraft.name, editorDraft.description);
    if (!identity.ok) {
      createError = identity.error;
      return;
    }
    const name = identity.name;
    const cadence = resolveMonitorCadence(editorDraft);
    cadenceError = cadence.ok ? '' : cadence.error;
    if (!cadence.ok) return;
    cadencePreview = cadence.preview;
    const configResult = buildMonitorConfig(editorDraft.fields);
    fieldError = configResult.ok ? '' : configResult.error;
    if (!configResult.ok) return;
    const resolvedCadence = cadence.seconds;
    const config = configResult.config;
    const channelsPayload = editorDraft.channelSelection.map((selection) => selection.kind === 'existing'
      ? { kind: 'existing', channel_id: selection.channel_id }
      : { kind: 'new', type: selection.type, label: selection.label, priority: selection.priority, enabled: selection.enabled, config: selection.config });
    const payload = {
      expected_updated_at: original.updated_at,
      name,
      description: identity.description,
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
        workspaceId: selectedWorkspaceId,
        monitorId: original.id,
        requestBody,
        idempotencyKey: editRequestKey,
      });
      if (!result.ok) {
        createError = result.status === 409
          ? 'This monitor changed while you were editing it. Close this form, reopen Edit monitor, and review the latest version before saving again.'
          : result.status === 422 && result.code === 'invalid_monitor_config'
            ? 'TrueExit rejected this field configuration. Check field names, paths, and value types.'
            : messageFor(result.status, result.code);
        return;
      }
      if (initialMode !== 'inventory') { window.location.href = `/monitors?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`; return; }
      createOpen = false;
      editingMonitor = null;
      editRequestKey = '';
      editRequestBody = '';
      newChannelOpen = false;
      actionError = '';
      actionMessage = `“${name}” was updated.`;
      resetPagination();
      await loadMonitors(null);
    } catch {
      createError = messageFor(0, 'network_error');
    } finally {
      creating = false;
    }
  }

  function resetPagination() {
    cursorStack = [null];
    pageIndex = 0;
    nextCursor = null;
  }

  async function loadMonitors(cursor: string | null = null) {
    const sequence = ++requestSequence;
    if (!selectedWorkspaceId) {
      monitors = [];
      nextCursor = null;
      return;
    }

    loadingMonitors = true;
    listError = '';
    actionError = '';

    const query = {
      workspaceId: selectedWorkspaceId,
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
      if (sequence !== requestSequence) return;
      if (!result.ok || !result.page) {
        listError = messageFor(result.status, result.code);
        return;
      }
      monitors = result.page.data;
      nextCursor = result.page.page.next_cursor;
    } catch {
      if (sequence === requestSequence) listError = messageFor(0, 'network_error');
    } finally {
      if (sequence === requestSequence) loadingMonitors = false;
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
    loadingWorkspaces = true;
    bootError = '';
    const result = await loadWorkspaceBootstrap();
    if (!result.workspaces.ok) {
      bootError = messageFor(result.workspaces.status, result.workspaces.code);
      loadingWorkspaces = false;
      return;
    }

    workspaces = result.workspaces.data.data;
    const personalId = result.me.ok ? result.me.data.personal_workspace_id : null;
    let storedWorkspaceId = '';
    try { storedWorkspaceId = localStorage.getItem('trueexit.active-workspace-id') ?? ''; } catch { /* Storage may be unavailable. */ }
    const requestedWorkspaceId = new URLSearchParams(window.location.search).get('workspace_id') ?? '';
    const initialWorkspace = workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ?? workspaces.find((workspace) => workspace.id === storedWorkspaceId) ?? workspaces.find((workspace) => workspace.id === personalId) ?? workspaces[0];
    if (initialWorkspace) { try { localStorage.setItem('trueexit.active-workspace-id', initialWorkspace.id); } catch { /* Storage may be unavailable. */ } }
    selectedWorkspaceId = initialWorkspace?.id ?? '';
    loadingWorkspaces = false;
    if (selectedWorkspaceId) void loadWorkspaceTags();
    if (selectedWorkspaceId && initialMode === 'inventory') await loadMonitors(null);
    if (initialMode === 'create') { await openCreate(); }
    else if (initialMode === 'edit' && monitorId) { await openEdit({ id: monitorId, workspace_id: selectedWorkspaceId } as Monitor); }
  }

  async function runLifecycleAction(monitor: Monitor, action: 'pause' | 'resume' | 'archive' | 'restore') {
    if (busyMonitorId) return;
    const labels = { pause: 'Pause', resume: 'Resume', archive: 'Archive', restore: 'Restore' };
    if (action === 'archive' && !window.confirm(`Archive “${monitor.name}”? Its evidence and health history will be retained, and it can be restored later.`)) return;

    busyMonitorId = monitor.id;
    actionError = '';
    actionMessage = '';
    try {
      const result = await lifecycleMonitorMutation.mutateAsync({
        workspaceId: selectedWorkspaceId,
        monitorId: monitor.id,
        action,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        actionError = messageFor(result.status, result.code);
        return;
      }
      actionMessage = `${monitor.name}: ${labels[action].toLowerCase()} completed.`;
      resetPagination();
      await loadMonitors(null);
    } catch {
      actionError = messageFor(0, 'network_error');
    } finally {
      busyMonitorId = '';
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
      if (searchTimer) clearTimeout(searchTimer);
      void monitorQueryClient.cancelQueries({ queryKey: ['monitors', 'list'] });
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
          <div><p class="eyebrow">{editingMonitor ? 'EDIT CHECK' : 'NEW CHECK'}</p><h2 id="monitor-create-title">{editingMonitor ? 'Refine your signal.' : 'Give your signal a shape.'}</h2><p>{editingMonitor ? 'Update the fields, cadence, and notification destinations for this monitor.' : 'Define the editorDraft.fields TrueExit should observe. A monitor always needs at least one valid field.'}</p></div>
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
              <div class="monitor-cadence-control"><span class="monitor-cadence-label">Check cadence</span><div class="monitor-field-modes monitor-field-modes--compact" role="tablist" aria-label="Cadence input mode"><button type="button" role="tab" aria-selected={editorDraft.cadenceMode === 'interval'} class:active={editorDraft.cadenceMode === 'interval'} on:click={() => { editorDraft.cadenceMode = 'interval'; cadenceError = ''; }}>Interval</button><button type="button" role="tab" aria-selected={editorDraft.cadenceMode === 'cron'} class:active={editorDraft.cadenceMode === 'cron'} on:click={() => { editorDraft.cadenceMode = 'cron'; cadenceError = ''; }}>Cron</button></div>
                {#if editorDraft.cadenceMode === 'interval'}<div class="monitor-cadence-input"><label class="monitor-form-field"><span class="sr-only">Interval amount</span><input type="number" min="1" step="1" bind:value={editorDraft.cadenceValue} on:input={() => { resolveCadence(); }} /></label><label class="monitor-form-field"><span class="sr-only">Interval unit</span><select bind:value={editorDraft.cadenceUnit}><option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="hours">Hours</option></select></label></div><small class="monitor-form-hint">Minimum interval: 15 seconds.</small>
                {:else}<label class="monitor-form-field"><span>Cron expression</span><input bind:value={editorDraft.cronExpression} on:input={() => { resolveCadence(); }} placeholder="*/30 * * * * *" spellcheck="false" /><small>Fixed intervals only. Seconds syntax: <code>*/30 * * * * *</code>; minutes syntax: <code>*/5 * * * *</code>.</small></label>{/if}
                {#if cadenceError}<p class="monitor-form-error" role="alert">{cadenceError}</p>{:else}<p class="monitor-cadence-preview">Resolved schedule <strong>{editorDraft.cadenceMode === 'interval' ? `Every ${editorDraft.cadenceValue || '…'} ${editorDraft.cadenceUnit}` : cadencePreview}</strong></p>{/if}</div>
            </div>
          </div>

          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>02</span><div><h3>Observed fields <b>*</b></h3><p>Map each field to a value in the JSON payload your process will send to Ping.</p></div><button class="monitor-button monitor-button--quiet" type="button" on:click={addField} disabled={editorDraft.fields.length >= 50}>＋ Add field</button></div>
            <div class="monitor-field-modes" role="tablist" aria-label="Field configuration method">
              <button type="button" role="tab" aria-selected={fieldMode === 'json'} class:active={fieldMode === 'json'} on:click={() => { try { syncJsonFromFields(); fieldMode = 'json'; } catch (error) { jsonError = error instanceof Error ? error.message : 'Resolve conflicting paths first.'; } }}>JSON <small>Paste an object</small></button>
              <button type="button" role="tab" aria-selected={fieldMode === 'fields'} class:active={fieldMode === 'fields'} on:click={() => { if (fieldMode === 'json' && jsonDraft.trim()) applyJsonDraft(); else fieldMode = 'fields'; }}>Fields <small>Edit paths</small></button>
              <button type="button" role="tab" aria-selected={fieldMode === 'templates'} class:active={fieldMode === 'templates'} on:click={() => { if (fieldMode === 'json' && jsonDraft.trim()) { applyJsonDraft(); if (fieldMode === 'json') return; } fieldMode = 'templates'; void loadTemplates(); }}>Templates <small>Start from a template</small></button>
            </div>
            {#if fieldError}<p class="monitor-form-error" role="alert">{fieldError}</p>{/if}
            {#if fieldMode === 'json'}
              <div class="monitor-json-mode"><label class="monitor-form-field"><span>JSON payload <b>*</b></span><textarea bind:value={jsonDraft} rows="10" spellcheck="false" class="monitor-json-editor" aria-describedby="monitor-json-help" placeholder={`{
  "backup": {
    "processed_rows": 42,
    "size": 1024
  }
}`}></textarea><small id="monitor-json-help">Paste a representative object. Nested paths are discovered automatically; sample values are used to infer types, not submitted as monitor data.</small></label>
                {#if jsonError}<p class="monitor-form-error" role="alert">{jsonError}</p>{/if}
                <div class="monitor-json-actions"><span>{editorDraft.fields.filter((field) => field.path.trim()).length} configured fields currently in the draft</span><button type="button" class="monitor-button monitor-button--primary" on:click={applyJsonDraft}>Parse JSON into fields <span aria-hidden="true">→</span></button></div>
              </div>
            {:else if fieldMode === 'templates'}
              <div class="monitor-template-mode"><p>Templates provide reusable field names, JSON paths, and interpretation types. They do not change cadence, tags, or destinations.</p>
                {#if templatesError}<p class="monitor-form-error" role="alert">{templatesError}</p>{/if}
                {#if templatesLoading}<p class="monitor-form-hint">Loading templates…</p>{:else if templates.length === 0}<div class="monitor-template-empty"><strong>No templates available</strong><span>Create a reusable field template first, or use JSON to discover fields from a sample payload.</span><a href="/templates">Open Templates ↗</a></div>{:else}
                  <div class="monitor-template-picker"><label class="monitor-form-field"><span>Choose a template</span><select bind:value={selectedTemplateId}><option value="">Select a template…</option>{#each templates as template (template.id)}<option value={template.id}>{template.name} · {template.fields.length} editorDraft.fields</option>{/each}</select></label><label class="monitor-form-field"><span>Apply method</span><select bind:value={templateApplyMode}><option value="replace">Replace current fields</option><option value="merge">Merge with current fields</option></select></label></div>
                  {#if selectedTemplateId}<div class="monitor-template-preview">{#each templates.find((template) => template.id === selectedTemplateId)?.fields ?? [] as field}<div><span><strong>{field.name}</strong><code>{field.path}</code></span><small>{primitiveLabels[(Object.entries(primitiveValues).find(([, value]) => value === field.primitive)?.[0] ?? 'text') as FieldPrimitive]}</small></div>{/each}</div><button type="button" class="monitor-button monitor-button--primary" on:click={applySelectedTemplate}>Apply template to draft →</button>{/if}
                {/if}
              </div>
            {:else}
              <div class="monitor-fields-toolbar"><p>Enter nested JSON paths directly. Use Tab to move through each row; no nested-field builder required.</p><button class="monitor-button monitor-button--quiet" type="button" on:click={addField} disabled={editorDraft.fields.length >= 50}>＋ Add field</button></div>
              <div class="monitor-field-list">
                {#each editorDraft.fields as field, index (field.key)}
                  <div class="monitor-field-card">
                    <div class="monitor-field-card__top"><span>FIELD {String(index + 1).padStart(2, '0')}</span>{#if editorDraft.fields.length > 1}<button type="button" class="monitor-remove-link" on:click={() => removeField(field.key)}>Remove</button>{/if}</div>
                    <div class="monitor-form-grid monitor-form-grid--field">
                      <label class="monitor-form-field"><span>Field name <b>*</b></span><input bind:value={field.name} maxlength="100" required placeholder="processed_rows" /></label>
                      <label class="monitor-form-field"><span>JSON path <b>*</b></span><input bind:value={field.path} maxlength="200" required placeholder="backup.processed_rows" /><small>Dot-separated path in the submitted JSON.</small></label>
                      <label class="monitor-form-field"><span>Value type</span><select bind:value={field.primitive}>{#each Object.keys(primitiveLabels) as primitive}<option value={primitive}>{primitiveLabels[primitive as FieldPrimitive]}</option>{/each}</select></label>
                    </div>
                    {#if field.primitive === 'checksum'}<p class="monitor-field-note">Checksum fields use SHA-256 with hexadecimal encoding.</p>{/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>03</span><div><h3>Notification destinations</h3><p>Optional. Select saved destinations or configure one inline.</p></div></div>
            {#if channelsError}<p class="monitor-form-error" role="alert">{channelsError}</p>{/if}
            {#if channelsLoading}<p class="monitor-form-hint">Loading workspace destinations…</p>{:else if availableChannels.length > 0}
              <div class="monitor-channel-add"><label class="monitor-form-field"><span>Saved destination</span><select bind:value={selectedExistingChannelId}><option value="">Choose a destination…</option>{#each availableChannels as channel (channel.id)}<option value={channel.id}>{channel.label} · {channel.type}</option>{/each}</select></label><button class="monitor-button monitor-button--quiet" type="button" on:click={addExistingChannel} disabled={!selectedExistingChannelId || editorDraft.channelSelection.length >= 25}>Add destination</button></div>
            {:else}<p class="monitor-form-hint">No saved destinations available to select.</p>{/if}
            {#if editorDraft.channelSelection.length > 0}
              <div class="monitor-selected-channels" aria-label="Selected notification destinations">{#each editorDraft.channelSelection as selection, index}<div class="monitor-selected-channel"><span class="monitor-selected-channel__icon" aria-hidden="true">{selection.kind === 'existing' ? '↗' : '＋'}</span><span><strong>{selection.kind === 'existing' ? selection.label : selection.displayLabel}</strong><small>{selection.kind === 'existing' ? 'Saved destination' : `New ${selection.type} destination`}</small></span><button type="button" aria-label={`Remove ${selection.kind === 'existing' ? selection.label : selection.displayLabel}`} on:click={() => removeChannelSelection(index)}>×</button></div>{/each}</div>
            {/if}
            {#if canManageChannels}
              <button class="monitor-inline-configure" type="button" on:click={() => { newChannelOpen = !newChannelOpen; newChannelError = ''; }}>{newChannelOpen ? '− Close channel setup' : '＋ Add a channel'}</button>
              {#if newChannelOpen}
                <div class="monitor-channel-modal-backdrop" role="presentation" on:click={(event) => { if (event.target === event.currentTarget) newChannelOpen = false; }}>
                  <section class="monitor-new-channel-panel" role="dialog" aria-modal="true" aria-labelledby="monitor-channel-modal-title">
                    <header class="monitor-channel-modal__header"><div><p class="eyebrow">NOTIFICATION DESTINATION</p><h3 id="monitor-channel-modal-title">Add a channel</h3><p>Configure a destination and add it to this monitor draft.</p></div><button class="monitor-modal-close" type="button" aria-label="Close channel setup" on:click={() => { newChannelOpen = false; newChannelError = ''; }}>×</button></header>
                  {#if newChannelError}<p class="monitor-form-error" role="alert">{newChannelError}</p>{/if}
                  <div class="monitor-form-grid">
                    <label class="monitor-form-field"><span>Provider</span><select bind:value={newChannelType}><option value="webhook">Custom webhook</option><option value="email">Email</option><option value="slack">Slack incoming webhook</option><option value="discord">Discord webhook</option></select></label>
                    <label class="monitor-form-field"><span>Destination label <b>*</b></span><input bind:value={newChannelLabel} maxlength="80" placeholder="Operations alerts" /></label>
                    <label class="monitor-form-field monitor-form-field--wide"><span>{newChannelType === 'email' ? 'Recipient email' : 'HTTPS webhook URL'} <b>*</b></span><input bind:value={newChannelAddress} type={newChannelType === 'email' ? 'email' : 'url'} autocomplete="off" placeholder={newChannelType === 'email' ? 'ops@example.com' : newChannelType === 'slack' ? 'https://hooks.slack.com/services/…' : newChannelType === 'discord' ? 'https://discord.com/api/webhooks/…' : 'https://hooks.example.com/trueexit'} /></label>
                    {#if newChannelType !== 'email'}<label class="monitor-form-field monitor-form-field--wide"><span>Custom headers <small>Optional JSON object</small></span><textarea bind:value={newChannelHeaders} rows="2" spellcheck="false" placeholder={'{ "Authorization": "Bearer …" }'}></textarea><small>Stored encrypted. Never sent back to the browser after saving.</small></label>{/if}
                  </div>
                  <div class="monitor-new-channel-actions"><p>Channel settings are staged in this form and submitted with the monitor.</p><div><button class="monitor-button monitor-button--quiet" type="button" on:click={() => { newChannelOpen = false; newChannelError = ''; }}>Cancel</button><button class="monitor-button monitor-button--primary" type="button" on:click={addNewChannel}>Add to monitor</button></div></div>
                  </section>
                </div>
              {/if}
            {:else}<p class="monitor-form-hint">You can select saved destinations. Configuring a new destination requires workspace owner or admin access.</p>{/if}
          </div>

          <footer class="monitor-create-footer"><p>Fields are required. Destinations are optional. You can review everything before saving.</p><div><button class="monitor-button monitor-button--quiet" type="button" on:click={closeCreate} disabled={creating}>Cancel</button><button class="monitor-button monitor-button--primary" type="submit" disabled={creating}>{creating ? (editingMonitor ? 'Saving changes…' : 'Creating monitor…') : (editingMonitor ? 'Save changes' : 'Create monitor')} <span aria-hidden="true">↗</span></button></div></footer>
        </form>
        {/if}
      </section>
  {/if}

  {#if tagModalOpen && taggingMonitor}
    <div class="monitor-modal-backdrop" role="presentation">
      <section class="monitor-create-modal monitor-tag-modal" role="dialog" aria-modal="true" aria-labelledby="monitor-tags-title">
        <header class="monitor-create-modal__header">
          <div><p class="eyebrow">WORKSPACE LABELS</p><h2 id="monitor-tags-title">Organise this monitor.</h2><p>Tags are optional labels shared across monitors. They do not change verification or health.</p></div>
          <button class="monitor-modal-close" type="button" aria-label="Close tag manager" on:click={() => { if (!tagBusy) { tagModalOpen = false; taggingMonitor = null; } }} disabled={tagBusy}>×</button>
        </header>
        {#if tagError}<div class="monitor-inline-alert" role="alert">{tagError}</div>{/if}
        {#if tagBusy}
          <div class="monitor-state" aria-live="polite"><span class="monitor-loader" aria-hidden="true"></span>Loading tags…</div>
        {:else}
          <form class="monitor-create-form" on:submit={saveMonitorTags}>
            <div class="monitor-create-section">
              <div class="monitor-create-section__heading"><span>01</span><div><h3>Available tags</h3><p>Select up to three labels for {taggingMonitor.name}.</p></div></div>
              {#if workspaceTags.length > 0}
                <div class="monitor-tag-options">
                  {#each workspaceTags as tag (tag.id)}
                    <label class="monitor-tag-option"><input type="checkbox" value={tag.id} bind:group={monitorTagIds} disabled={!monitorTagIds.includes(tag.id) && monitorTagIds.length + newTagNames.length >= 3} /><span>{tag.name}</span><small>{tag.monitor_count} monitor{tag.monitor_count === 1 ? '' : 's'}</small></label>
                  {/each}
                </div>
              {:else}
                <p class="monitor-form-hint">No workspace tags yet. Create one below.</p>
              {/if}
            </div>
            <div class="monitor-create-section">
              <div class="monitor-create-section__heading"><span>02</span><div><h3>Create a tag</h3><p>New tags become reusable across this workspace.</p></div></div>
              <div class="monitor-channel-add"><label class="monitor-form-field"><span>Tag name</span><input bind:value={tagInput} maxlength="40" placeholder="e.g. Customer-facing" /></label><button class="monitor-button monitor-button--quiet" type="button" on:click={addTagDraft} disabled={!tagInput.trim() || monitorTagIds.length + newTagNames.length >= 3}>Add tag</button></div>
              {#if newTagNames.length > 0}
                <div class="monitor-selected-channels" aria-label="New tags to create">
                  {#each newTagNames as tag (tag)}
                    <div class="monitor-selected-channel"><span class="monitor-selected-channel__icon" aria-hidden="true">＋</span><span><strong>{tag}</strong><small>Will be created and assigned on save</small></span><button type="button" aria-label={`Remove ${tag}`} on:click={() => removeTagDraft(tag)}>×</button></div>
                  {/each}
                </div>
              {/if}
            </div>
            <footer class="monitor-create-footer"><p>Saving replaces this monitor's complete tag assignment. Removing a tag here does not delete it from the workspace.</p><div><button class="monitor-button monitor-button--quiet" type="button" on:click={() => { tagModalOpen = false; taggingMonitor = null; }} disabled={tagBusy}>Cancel</button><button class="monitor-button monitor-button--primary" type="submit" disabled={tagBusy || !tagReady}>{tagBusy ? 'Saving tags…' : 'Save tags'} <span aria-hidden="true">↗</span></button></div></footer>
          </form>
        {/if}
      </section>
    </div>
  {/if}
</section>
