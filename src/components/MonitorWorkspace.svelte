<script lang="ts">
  import { can } from '../lib/client/permissions';
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';

  type MonitorStatus = 'enabled' | 'disabled' | 'archived';
  type Monitor = {
    id: string;
    workspace_id: string;
    name: string;
    description: string;
    status: MonitorStatus;
    cadence_seconds: number;
    current_config_version: number;
    created_at: string;
    updated_at: string;
  };
  type MonitorConfigVersion = { version: number; cadence_seconds: number; config: { fields: Array<{ name: string; path: string; primitive: number; meta?: Record<string, unknown> }> } };
  type MonitorDetail = Monitor & { config_versions?: MonitorConfigVersion[] };
  type MonitorPage = { data: Monitor[]; page: { next_cursor: string | null } };
  type ApiErrorBody = { error?: { code?: string }; request_id?: string };
  type WorkspaceTag = { id: string; workspace_id: string; name: string; monitor_count: number; created_at: string; updated_at: string };
  type ChannelKind = 'email' | 'webhook' | 'slack' | 'discord';
  type Channel = { id: string; label: string; type: ChannelKind; enabled: boolean; configured: boolean };
  type FieldPrimitive = 'size' | 'count' | 'duration' | 'timestamp' | 'boolean' | 'categorical' | 'checksum' | 'text';
  type MonitorField = { key: number; name: string; path: string; primitive: FieldPrimitive };
  type ExistingChannelSelection = { kind: 'existing'; channel_id: string; label: string };
  type NewChannelSelection = { kind: 'new'; type: ChannelKind; label: string; priority: number; enabled: boolean; config: Record<string, string>; displayLabel: string };
  type ChannelSelection = ExistingChannelSelection | NewChannelSelection;

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
  let createOpen = false;
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
  let monitorName = '';
  let monitorDescription = '';
  let cadenceSeconds = 300;
  let fields: MonitorField[] = [{ key: 1, name: '', path: '', primitive: 'count' }];
  let nextFieldKey = 2;
  let fieldError = '';
  let channels: Channel[] = [];
  let channelsLoading = false;
  let channelsError = '';
  let channelSelection: ChannelSelection[] = [];
  let channelSelectionWorkspaceId = '';
  let selectedExistingChannelId = '';
  let newChannelOpen = false;
  let newChannelType: ChannelKind = 'webhook';
  let newChannelLabel = '';
  let newChannelAddress = '';
  let newChannelPriority = 0;
  let newChannelError = '';
  let newChannelHeaders = '';

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

  async function parseError(response: Response): Promise<string> {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    return messageFor(response.status, body?.error?.code ?? null);
  }

  function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function formatCadence(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return 'Cadence unavailable';
    if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`;
    if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`;
    if (seconds % 60 === 0) return `${seconds / 60} min`;
    return `${seconds} sec`;
  }

  $: selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  $: canManageChannels = can(selectedWorkspace, 'workspace.destinations.manage');
  $: availableChannels = channels.filter((channel) => channel.enabled && !channelSelection.some((item) => item.kind === 'existing' && item.channel_id === channel.id));

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
    const monitorName = taggingMonitor.name;
    const requestBody = JSON.stringify({ workspace_id: selectedWorkspaceId, tag_ids: monitorTagIds, create_tags: newTagNames });
    if (!tagRequestKey || tagRequestBody !== requestBody) {
      tagRequestKey = crypto.randomUUID();
      tagRequestBody = requestBody;
    }
    try {
      const response = await fetch(`/api/backend/monitors/${encodeURIComponent(taggingMonitor.id)}/tags`, {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': tagRequestKey },
        body: requestBody,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorBody = body as ApiErrorBody | null;
        tagError = messageFor(response.status, errorBody?.error?.code ?? null);
        return;
      }
      tagModalOpen = false;
      taggingMonitor = null;
      tagRequestKey = '';
      tagRequestBody = '';
      actionError = '';
      actionMessage = `Tags updated for “${monitorName}”.`;
      await Promise.all([loadWorkspaceTags(), loadMonitors(null)]);
    } catch {
      tagError = messageFor(0, 'network_error');
    } finally {
      tagBusy = false;
    }
  }


  async function openCreate() {
    editingMonitor = null;
    createOpen = true;
    createError = '';
    createMessage = '';
    channelsError = '';
    if (channelSelectionWorkspaceId !== selectedWorkspaceId) {
      channelSelection = [];
      channelSelectionWorkspaceId = selectedWorkspaceId;
    }
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
    createOpen = false;
    newChannelOpen = false;
    createError = '';
    editingMonitor = null;
  }

  async function openEdit(monitor: Monitor) {
    if (busyMonitorId || creating) return;
    editingMonitor = monitor as MonitorDetail;
    editRequestKey = '';
    editRequestBody = '';
    createError = '';
    createMessage = '';
    fieldError = '';
    channelsError = '';
    channels = [];
    selectedExistingChannelId = '';
    if (channelSelectionWorkspaceId !== selectedWorkspaceId) {
      channelSelection = [];
      channelSelectionWorkspaceId = selectedWorkspaceId;
    }
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
        createOpen = false;
        return;
      }
      const detail = detailBody as MonitorDetail;
      const currentConfig = detail.config_versions?.find((version) => version.version === detail.current_config_version);
      if (!currentConfig || !Array.isArray(currentConfig.config?.fields) || currentConfig.config.fields.length === 0) {
        createError = 'The current monitor configuration could not be loaded safely. Nothing has been changed.';
        createOpen = false;
        return;
      }
      const channelBody: unknown = await channelResponse.json().catch(() => null);
      if (!channelResponse.ok) {
        const errorBody = channelBody as ApiErrorBody | null;
        createError = messageFor(channelResponse.status, errorBody?.error?.code ?? null);
        createOpen = false;
        return;
      }
      const destinationBody: unknown = await destinationsResponse.json().catch(() => null);
      if (!destinationsResponse.ok) {
        const errorBody = destinationBody as ApiErrorBody | null;
        createError = messageFor(destinationsResponse.status, errorBody?.error?.code ?? null);
        createOpen = false;
        return;
      }
      const selectedIds = (channelBody as { channel_ids?: string[] } | null)?.channel_ids ?? [];
      channels = Array.isArray(destinationBody) ? destinationBody as Channel[] : [];
      channelSelection = selectedIds.flatMap((id) => {
        const channel = channels.find((item) => item.id === id);
        return channel ? [{ kind: 'existing' as const, channel_id: channel.id, label: channel.label }] : [];
      });
      selectedExistingChannelId = availableChannels[0]?.id ?? '';
      monitorName = detail.name;
      monitorDescription = detail.description ?? '';
      cadenceSeconds = currentConfig.cadence_seconds;
      fields = currentConfig.config.fields.map((field, index) => ({
        key: index + 1,
        name: field.name,
        path: field.path,
        primitive: (Object.entries(primitiveValues).find(([, value]) => value === field.primitive)?.[0] ?? 'text') as FieldPrimitive,
      }));
      nextFieldKey = fields.length + 1;
      editingMonitor = detail;
    } catch {
      createError = messageFor(0, 'network_error');
      createOpen = false;
    } finally {
      creating = false;
    }
  }

  function addField() {
    if (fields.length >= 50) return;
    fields = [...fields, { key: nextFieldKey++, name: '', path: '', primitive: 'count' }];
    fieldError = '';
  }

  function removeField(key: number) {
    if (fields.length <= 1) return;
    fields = fields.filter((field) => field.key !== key);
    fieldError = '';
  }

  function addExistingChannel() {
    if (!selectedExistingChannelId || channelSelection.length >= 25) return;
    const channel = channels.find((item) => item.id === selectedExistingChannelId);
    if (!channel || channelSelection.some((item) => item.kind === 'existing' && item.channel_id === channel.id)) return;
    channelSelection = [...channelSelection, { kind: 'existing', channel_id: channel.id, label: channel.label }];
    selectedExistingChannelId = availableChannels.find((item) => item.id !== channel.id)?.id ?? '';
  }

  function addNewChannel() {
    newChannelError = '';
    if (!canManageChannels) {
      newChannelError = 'Only a workspace owner or admin can configure a new destination. You can still select an existing destination.';
      return;
    }
    if (channelSelection.length >= 25) {
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
    channelSelection = [...channelSelection, {
      kind: 'new', type: newChannelType, label, priority: newChannelPriority, enabled: true, config, displayLabel: label,
    }];
    newChannelLabel = '';
    newChannelAddress = '';
    newChannelPriority = 0;
    newChannelHeaders = '';
    newChannelOpen = false;
  }

  function removeChannelSelection(index: number) {
    channelSelection = channelSelection.filter((_, itemIndex) => itemIndex !== index);
  }

  function buildMonitorConfig() {
    const seen = new Set<string>();
    const names = new Set<string>();
    const configuredFields: Record<string, unknown>[] = [];
    for (const field of fields) {
      const name = field.name.trim();
      const path = field.path.trim();
      if (!name || !path || path.split('.').some((part) => !part.trim())) {
        fieldError = 'Every field needs a name and a dot-separated JSON path.';
        return null;
      }
      if (names.has(name)) {
        fieldError = `Field name “${name}” is repeated. Field names must be unique.`;
        return null;
      }
      names.add(name);
      if (field.primitive === 'timestamp') {
        if (seen.has('timestamp')) {
          fieldError = 'Only one Timestamp field can be configured.';
          return null;
        }
        seen.add('timestamp');
      }
      const item: Record<string, unknown> = { name, path, primitive: primitiveValues[field.primitive] };
      if (field.primitive === 'checksum') item.meta = { checksum: { algorithm: CHECKSUM_ALGORITHM_SHA256, encoding: CHECKSUM_ENCODING_HEXADECIMAL } };
      configuredFields.push(item);
    }
    if (configuredFields.length === 0) {
      fieldError = 'Add at least one configured field before creating this monitor.';
      return null;
    }
    fieldError = '';
    return { fields: configuredFields };
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
    const name = monitorName.trim();
    if (!name || name.length > 200) {
      createError = 'Enter a monitor name between 1 and 200 characters.';
      return;
    }
    if (monitorDescription.length > 2000) {
      createError = 'Description must be 2,000 characters or fewer.';
      return;
    }
    const config = buildMonitorConfig();
    if (!config) return;

    const payloadChannels = channelSelection.map((selection) => {
      if (selection.kind === 'existing') return { kind: 'existing', channel_id: selection.channel_id };
      return { kind: 'new', type: selection.type, label: selection.label, priority: selection.priority, enabled: selection.enabled, config: selection.config };
    });
    const payload = {
      workspace_id: selectedWorkspaceId,
      name,
      description: monitorDescription.trim(),
      cadence_seconds: cadenceSeconds,
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
      const response = await fetch('/api/backend/monitors', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': createRequestKey },
        body: requestBody,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorBody = body as ApiErrorBody | null;
        createError = response.status === 422 && errorBody?.error?.code === 'invalid_monitor_config'
          ? 'TrueExit rejected this field configuration. Check field names, paths, and primitive choices.'
          : messageFor(response.status, errorBody?.error?.code ?? null);
        return;
      }
      const created = body as Monitor;
      monitorName = '';
      monitorDescription = '';
      cadenceSeconds = 300;
      fields = [{ key: nextFieldKey++, name: '', path: '', primitive: 'count' }];
      channelSelection = [];
      channelSelectionWorkspaceId = selectedWorkspaceId;
      newChannelOpen = false;
      createRequestKey = '';
      createRequestBody = '';
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
    const name = monitorName.trim();
    if (!name || name.length > 200) {
      createError = 'Enter a monitor name between 1 and 200 characters.';
      return;
    }
    if (monitorDescription.length > 2000) {
      createError = 'Description must be 2,000 characters or fewer.';
      return;
    }
    const config = buildMonitorConfig();
    if (!config) return;
    const channelsPayload = channelSelection.map((selection) => selection.kind === 'existing'
      ? { kind: 'existing', channel_id: selection.channel_id }
      : { kind: 'new', type: selection.type, label: selection.label, priority: selection.priority, enabled: selection.enabled, config: selection.config });
    const payload = {
      expected_updated_at: original.updated_at,
      name,
      description: monitorDescription.trim(),
      cadence_seconds: cadenceSeconds,
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
      const response = await fetch(`/api/backend/monitors/${encodeURIComponent(original.id)}?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': editRequestKey,
        },
        body: requestBody,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorBody = body as ApiErrorBody | null;
        createError = response.status === 409
          ? 'This monitor changed while you were editing it. Close this form, reopen Edit monitor, and review the latest version before saving again.'
          : response.status === 422 && errorBody?.error?.code === 'invalid_monitor_config'
            ? 'TrueExit rejected this field configuration. Check field names, paths, and value types.'
            : messageFor(response.status, errorBody?.error?.code ?? null);
        return;
      }
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

    const params = new URLSearchParams({ workspace_id: selectedWorkspaceId, limit: '25', sort, direction });
    if (search.trim()) params.set('q', search.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (tagFilter) params.set('tag_ids', tagFilter);
    if (includeArchived || statusFilter === 'archived') params.set('include_archived', 'true');
    if (cursor) params.set('cursor', cursor);

    try {
      const response = await fetch(`/api/backend/monitors?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const body: unknown = await response.json().catch(() => null);
      if (sequence !== requestSequence) return;
      if (!response.ok) {
        const errorBody = body as ApiErrorBody | null;
        listError = messageFor(response.status, errorBody?.error?.code ?? null);
        return;
      }
      const result = body as MonitorPage;
      monitors = Array.isArray(result.data) ? result.data : [];
      nextCursor = result.page?.next_cursor ?? null;
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
    const initialWorkspace = workspaces.find((workspace) => workspace.id === storedWorkspaceId) ?? workspaces.find((workspace) => workspace.id === personalId) ?? workspaces[0];
    if (initialWorkspace) { try { localStorage.setItem('trueexit.active-workspace-id', initialWorkspace.id); } catch { /* Storage may be unavailable. */ } }
    selectedWorkspaceId = initialWorkspace?.id ?? '';
    loadingWorkspaces = false;
    if (selectedWorkspaceId) void loadWorkspaceTags();
    if (selectedWorkspaceId) await loadMonitors(null);
  }

  async function runLifecycleAction(monitor: Monitor, action: 'pause' | 'resume' | 'archive' | 'restore') {
    if (busyMonitorId) return;
    const labels = { pause: 'Pause', resume: 'Resume', archive: 'Archive', restore: 'Restore' };
    if (action === 'archive' && !window.confirm(`Archive “${monitor.name}”? Its evidence and health history will be retained, and it can be restored later.`)) return;

    busyMonitorId = monitor.id;
    actionError = '';
    actionMessage = '';
    try {
      const response = await fetch(`/api/backend/monitors/${encodeURIComponent(monitor.id)}/${action}?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
      });
      if (!response.ok) {
        actionError = await parseError(response);
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
    };
  });
</script>

<section class="monitor-workspace" aria-labelledby="monitor-page-title">
  <div class="monitor-page-heading">
    <div>
      <p class="eyebrow">YOUR CHECKS</p>
      <h1 id="monitor-page-title">Monitors</h1>
      <p class="monitor-page-subtitle">Inspect monitor configuration and control its lifecycle. Health is shown as persisted evidence and field signals—not a guessed overall verdict.</p>
    </div>
    <button class="monitor-button monitor-button--primary monitor-create-trigger" type="button" on:click={openCreate} disabled={loadingWorkspaces || !selectedWorkspaceId}>＋ New monitor</button>
    {#if workspaces.length > 1}
      <label class="monitor-workspace-picker">
        <span>Workspace</span>
        <select value={selectedWorkspaceId} on:change={(event) => { selectedWorkspaceId = event.currentTarget.value; try { localStorage.setItem('trueexit.active-workspace-id', selectedWorkspaceId); } catch { /* Storage may be unavailable. */ } resetPagination(); void loadMonitors(null); }} disabled={loadingWorkspaces || loadingMonitors}>
          {#each workspaces as workspace (workspace.id)}
            <option value={workspace.id}>{workspace.name}</option>
          {/each}
        </select>
      </label>
    {:else if workspaces.length === 1}
      <span class="monitor-workspace-name">{workspaces[0].name}</span>
    {/if}
  </div>

  {#if loadingWorkspaces}
    <div class="monitor-state" aria-live="polite"><span class="monitor-loader" aria-hidden="true"></span>Loading your workspace…</div>
  {:else if bootError}
    <div class="monitor-state monitor-state--error" role="alert"><p>{bootError}</p><button class="monitor-button monitor-button--quiet" type="button" on:click={bootstrap}>Try again</button></div>
  {:else if workspaces.length === 0}
    <div class="monitor-state monitor-state--empty"><h2>No workspace available</h2><p>Your account is authenticated, but there is no active workspace to inspect.</p></div>
  {:else}
    <div class="monitor-toolbar">
      <label class="monitor-search">
        <span class="monitor-search__icon" aria-hidden="true">⌕</span>
        <span class="sr-only">Search monitor names</span>
        <input bind:value={search} on:input={handleSearchInput} placeholder="Search monitors…" maxlength="200" />
        {#if search}<button type="button" class="monitor-search__clear" aria-label="Clear search" on:click={() => { search = ''; applyFilters(); }}>×</button>{/if}
      </label>
      <label class="monitor-filter"><span>Status</span><select bind:value={statusFilter} on:change={applyFilters}><option value="all">All active</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select></label>
      <label class="monitor-filter"><span>Tag</span><select bind:value={tagFilter} on:change={applyFilters}><option value="">All tags</option>{#each workspaceTags as tag (tag.id)}<option value={tag.id}>{tag.name}</option>{/each}</select></label>
      <label class="monitor-filter"><span>Sort by</span><select bind:value={sort} on:change={applyFilters}><option value="updated_at">Recently updated</option><option value="created_at">Recently created</option><option value="name">Name</option><option value="id">Default order</option></select></label>
      <button class="monitor-sort-direction" type="button" on:click={() => { direction = direction === 'desc' ? 'asc' : 'desc'; applyFilters(); }} aria-label={`Sort ${direction === 'desc' ? 'ascending' : 'descending'}`} title={`Currently ${direction === 'desc' ? 'descending' : 'ascending'}`}>
        {direction === 'desc' ? '↓' : '↑'} <span>{direction === 'desc' ? 'Desc' : 'Asc'}</span>
      </button>
      <label class="monitor-archived-toggle"><input type="checkbox" bind:checked={includeArchived} on:change={applyFilters} /><span>Include archived</span></label>
    </div>

    {#if actionError}<div class="monitor-inline-alert" role="alert"><p>{actionError}</p></div>{/if}
    {#if actionMessage}<div class="monitor-inline-success" role="status">{actionMessage}</div>{/if}

    {#if listError}
      <div class="monitor-state monitor-state--error" role="alert"><p>{listError}</p><button class="monitor-button monitor-button--quiet" type="button" on:click={() => loadMonitors(cursorStack[pageIndex])}>Try again</button></div>
    {:else if loadingMonitors && monitors.length === 0}
      <div class="monitor-state" aria-live="polite"><span class="monitor-loader" aria-hidden="true"></span>Loading monitors…</div>
    {:else if monitors.length === 0}
      <div class="monitor-state monitor-state--empty">
        <span class="monitor-empty-mark" aria-hidden="true">⌁</span>
        <h2>{search || statusFilter !== 'all' || tagFilter ? 'No monitors match these filters' : 'Nothing to monitor yet'}</h2>
        <p>{search || statusFilter !== 'all' || tagFilter ? 'Try another search or broaden the status or tag filter.' : 'There are no monitors in this view yet. Create one by defining the fields TrueExit should observe.'}</p>
        {#if search || statusFilter !== 'all' || tagFilter}<button class="monitor-button monitor-button--quiet" type="button" on:click={() => { search = ''; statusFilter = 'all'; tagFilter = ''; includeArchived = false; applyFilters(); }}>Clear filters</button>{:else}<button class="monitor-button monitor-button--primary" type="button" on:click={openCreate}>Create your first monitor</button>{/if}
      </div>
    {:else}
      <div class="monitor-results-heading"><span>{loadingMonitors ? 'Refreshing…' : `${monitors.length} monitor${monitors.length === 1 ? '' : 's'} on this page`}</span><span>Page {pageIndex + 1}</span></div>
      <div class="monitor-list" aria-busy={loadingMonitors}>
        {#each monitors as monitor (monitor.id)}
          <article class="monitor-row">
            <div class="monitor-row__main">
              <div class="monitor-row__titleline">
                <span class={`monitor-status-dot monitor-status-dot--${monitor.status}`} aria-hidden="true"></span>
                <h2>{monitor.name}</h2>
                <a class="monitor-button monitor-button--quiet" href={`/monitors/${encodeURIComponent(monitor.id)}?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`}>Investigate</a>
                <span class={`monitor-status-pill monitor-status-pill--${monitor.status}`}>{monitor.status}</span>
              </div>
              <p class="monitor-row__description">{monitor.description || 'No description added.'}</p>
              <div class="monitor-row__facts">
                <span><small>Cadence</small>{formatCadence(monitor.cadence_seconds)}</span>
                <span><small>Configuration</small>v{monitor.current_config_version}</span>
                <span><small>Updated</small>{formatDate(monitor.updated_at)}</span>
              </div>
            </div>
            <div class="monitor-row__actions">
              <button class="monitor-button monitor-button--quiet" type="button" disabled={tagBusy || creating || !!busyMonitorId} on:click={() => openTagManager(monitor)}>Tags</button>
              {#if monitor.status !== 'archived'}
                <button class="monitor-button monitor-button--quiet" type="button" disabled={!!busyMonitorId || creating} on:click={() => openEdit(monitor)}>Edit</button>
              {/if}
              {#if monitor.status === 'enabled'}
                <button class="monitor-button monitor-button--quiet" type="button" disabled={!!busyMonitorId} on:click={() => runLifecycleAction(monitor, 'pause')}>{busyMonitorId === monitor.id ? 'Working…' : 'Pause'}</button>
                <button class="monitor-button monitor-button--subtle" type="button" disabled={!!busyMonitorId} on:click={() => runLifecycleAction(monitor, 'archive')}>Archive</button>
              {:else if monitor.status === 'disabled'}
                <button class="monitor-button monitor-button--primary" type="button" disabled={!!busyMonitorId} on:click={() => runLifecycleAction(monitor, 'resume')}>{busyMonitorId === monitor.id ? 'Working…' : 'Resume'}</button>
                <button class="monitor-button monitor-button--subtle" type="button" disabled={!!busyMonitorId} on:click={() => runLifecycleAction(monitor, 'archive')}>Archive</button>
              {:else}
                <button class="monitor-button monitor-button--quiet" type="button" disabled={!!busyMonitorId} on:click={() => runLifecycleAction(monitor, 'restore')}>{busyMonitorId === monitor.id ? 'Working…' : 'Restore'}</button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
      <nav class="monitor-pagination" aria-label="Monitor list pages">
        <button class="monitor-button monitor-button--quiet" type="button" on:click={previousPage} disabled={pageIndex === 0 || loadingMonitors}>← Previous</button>
        <span>Page {pageIndex + 1}</span>
        <button class="monitor-button monitor-button--quiet" type="button" on:click={nextPage} disabled={!nextCursor || loadingMonitors}>Next →</button>
      </nav>
    {/if}
    <p class="monitor-footnote">Monitor IDs and Ping capabilities are intentionally not displayed. Archived monitors retain evidence and health history; restoring returns them to disabled.</p>
  {/if}

  {#if createOpen}
    <div class="monitor-modal-backdrop" role="presentation">
      <section class="monitor-create-modal" role="dialog" aria-modal="true" aria-labelledby="monitor-create-title">
        <header class="monitor-create-modal__header">
          <div><p class="eyebrow">{editingMonitor ? 'EDIT CHECK' : 'NEW CHECK'}</p><h2 id="monitor-create-title">{editingMonitor ? 'Refine your signal.' : 'Give your signal a shape.'}</h2><p>{editingMonitor ? 'Update the fields, cadence, and notification destinations for this monitor.' : 'Define the fields TrueExit should observe. A monitor always needs at least one valid field.'}</p></div>
          <button class="monitor-modal-close" type="button" aria-label={editingMonitor ? 'Close monitor editor' : 'Close monitor creation'} on:click={closeCreate} disabled={creating}>×</button>
        </header>
        {#if createError}<div class="monitor-inline-alert" role="alert">{createError}</div>{/if}
        <form class="monitor-create-form" on:submit={createMonitor}>
          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>01</span><div><h3>Monitor details</h3><p>Make it recognisable to your team.</p></div></div>
            <div class="monitor-form-grid">
              <label class="monitor-form-field monitor-form-field--wide"><span>Name <b>*</b></span><input bind:value={monitorName} maxlength="200" required placeholder="e.g. Payments pipeline" autocomplete="off" /></label>
              <label class="monitor-form-field monitor-form-field--wide"><span>Description <small>Optional</small></span><textarea bind:value={monitorDescription} maxlength="2000" rows="2" placeholder="What should this check tell you?"></textarea></label>
              <label class="monitor-form-field"><span>Check cadence</span><select bind:value={cadenceSeconds}><option value={60}>Every minute</option><option value={300}>Every 5 minutes</option><option value={600}>Every 10 minutes</option><option value={1800}>Every 30 minutes</option><option value={3600}>Every hour</option><option value={86400}>Every day</option></select></label>
            </div>
          </div>

          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>02</span><div><h3>Observed fields <b>*</b></h3><p>Map each field to a value in the JSON payload your process will send to Ping.</p></div><button class="monitor-button monitor-button--quiet" type="button" on:click={addField} disabled={fields.length >= 50}>＋ Add field</button></div>
            {#if fieldError}<p class="monitor-form-error" role="alert">{fieldError}</p>{/if}
            <div class="monitor-field-list">
              {#each fields as field, index (field.key)}
                <div class="monitor-field-card">
                  <div class="monitor-field-card__top"><span>FIELD {String(index + 1).padStart(2, '0')}</span>{#if fields.length > 1}<button type="button" class="monitor-remove-link" on:click={() => removeField(field.key)}>Remove</button>{/if}</div>
                  <div class="monitor-form-grid monitor-form-grid--field">
                    <label class="monitor-form-field"><span>Field name <b>*</b></span><input bind:value={field.name} maxlength="100" required placeholder="processed_rows" /></label>
                    <label class="monitor-form-field"><span>JSON path <b>*</b></span><input bind:value={field.path} maxlength="200" required placeholder="backup.processed_rows" /><small>Dot-separated path in the submitted JSON.</small></label>
                    <label class="monitor-form-field"><span>Value type</span><select bind:value={field.primitive}>{#each Object.keys(primitiveLabels) as primitive}<option value={primitive}>{primitiveLabels[primitive as FieldPrimitive]}</option>{/each}</select></label>
                  </div>
                  {#if field.primitive === 'checksum'}<p class="monitor-field-note">Checksum fields use SHA-256 with hexadecimal encoding.</p>{/if}
                </div>
              {/each}
            </div>
          </div>

          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>03</span><div><h3>Notification destinations</h3><p>Optional. Select saved destinations or configure one inline.</p></div></div>
            {#if channelsError}<p class="monitor-form-error" role="alert">{channelsError}</p>{/if}
            {#if channelsLoading}<p class="monitor-form-hint">Loading workspace destinations…</p>{:else if availableChannels.length > 0}
              <div class="monitor-channel-add"><label class="monitor-form-field"><span>Saved destination</span><select bind:value={selectedExistingChannelId}><option value="">Choose a destination…</option>{#each availableChannels as channel (channel.id)}<option value={channel.id}>{channel.label} · {channel.type}</option>{/each}</select></label><button class="monitor-button monitor-button--quiet" type="button" on:click={addExistingChannel} disabled={!selectedExistingChannelId || channelSelection.length >= 25}>Add destination</button></div>
            {:else}<p class="monitor-form-hint">No saved destinations available to select.</p>{/if}
            {#if channelSelection.length > 0}
              <div class="monitor-selected-channels" aria-label="Selected notification destinations">{#each channelSelection as selection, index}<div class="monitor-selected-channel"><span class="monitor-selected-channel__icon" aria-hidden="true">{selection.kind === 'existing' ? '↗' : '＋'}</span><span><strong>{selection.kind === 'existing' ? selection.label : selection.displayLabel}</strong><small>{selection.kind === 'existing' ? 'Saved destination' : `New ${selection.type} destination`}</small></span><button type="button" aria-label={`Remove ${selection.kind === 'existing' ? selection.label : selection.displayLabel}`} on:click={() => removeChannelSelection(index)}>×</button></div>{/each}</div>
            {/if}
            {#if canManageChannels}
              <button class="monitor-inline-configure" type="button" on:click={() => { newChannelOpen = !newChannelOpen; newChannelError = ''; }}>{newChannelOpen ? '− Cancel new destination' : '＋ Configure a new destination inline'}</button>
              {#if newChannelOpen}
                <div class="monitor-new-channel-panel">
                  {#if newChannelError}<p class="monitor-form-error" role="alert">{newChannelError}</p>{/if}
                  <div class="monitor-form-grid">
                    <label class="monitor-form-field"><span>Provider</span><select bind:value={newChannelType}><option value="webhook">Custom webhook</option><option value="email">Email</option><option value="slack">Slack incoming webhook</option><option value="discord">Discord webhook</option></select></label>
                    <label class="monitor-form-field"><span>Destination label <b>*</b></span><input bind:value={newChannelLabel} maxlength="80" placeholder="Operations alerts" /></label>
                    <label class="monitor-form-field monitor-form-field--wide"><span>{newChannelType === 'email' ? 'Recipient email' : 'HTTPS webhook URL'} <b>*</b></span><input bind:value={newChannelAddress} type={newChannelType === 'email' ? 'email' : 'url'} autocomplete="off" placeholder={newChannelType === 'email' ? 'ops@example.com' : newChannelType === 'slack' ? 'https://hooks.slack.com/services/…' : newChannelType === 'discord' ? 'https://discord.com/api/webhooks/…' : 'https://hooks.example.com/trueexit'} /></label>
                    {#if newChannelType !== 'email'}<label class="monitor-form-field monitor-form-field--wide"><span>Custom headers <small>Optional JSON object</small></span><textarea bind:value={newChannelHeaders} rows="2" spellcheck="false" placeholder={'{ "Authorization": "Bearer …" }'}></textarea><small>Stored encrypted. Never sent back to the browser after saving.</small></label>{/if}
                  </div>
                  <div class="monitor-new-channel-actions"><p>Destination settings are saved with the monitor. Provider delivery adapters are not yet active.</p><button class="monitor-button monitor-button--primary" type="button" on:click={addNewChannel}>Add to monitor</button></div>
                </div>
              {/if}
            {:else}<p class="monitor-form-hint">You can select saved destinations. Configuring a new destination requires workspace owner or admin access.</p>{/if}
          </div>

          <footer class="monitor-create-footer"><p>Fields are required. Destinations are optional. Tags can be assigned separately after creation.</p><div><button class="monitor-button monitor-button--quiet" type="button" on:click={closeCreate} disabled={creating}>Cancel</button><button class="monitor-button monitor-button--primary" type="submit" disabled={creating}>{creating ? 'Creating monitor…' : 'Create monitor'} <span aria-hidden="true">↗</span></button></div></footer>
        </form>
      </section>
    </div>
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
