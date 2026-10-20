<script lang="ts">
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';

  type Primitive = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  type FieldDefinition = { name: string; path: string; primitive: Primitive; meta?: Record<string, unknown> };
  type Template = {
    id: string; owner_user_id: string | null; kind: 'built_in' | 'custom'; name: string;
    description: string; fields: FieldDefinition[]; version: number; created_at: string; updated_at: string;
  };
  type Page<T> = { data: T[]; page: { next_cursor: string | null } };
  type ApiError = { error?: { code?: string }; request_id?: string };
  type DiscoveredField = FieldDefinition & { source_type?: string };
  type Mode = 'create' | 'edit';

  const primitiveNames: Record<Primitive, string> = {
    0: 'Size', 1: 'Count', 2: 'Duration', 3: 'Timestamp',
    4: 'Boolean', 5: 'Categorical', 6: 'Checksum', 7: 'Text',
  };
  const primitiveOptions = Object.entries(primitiveNames).map(([value, label]) => ({ value: Number(value) as Primitive, label }));

  let workspaces: WorkspaceContext[] = [];
  let workspaceId = '';
  let templates: Template[] = [];
  let query = '';
  let cursor: string | null = null;
  let nextCursor: string | null = null;
  let cursorStack: (string | null)[] = [null];
  let pageIndex = 0;
  let loading = true;
  let saving = false;
  let bootError = '';
  let listError = '';
  let formError = '';
  let notice = '';
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;
  let formOpen = false;
  let mode: Mode = 'create';
  let editing: Template | null = null;
  let name = '';
  let description = '';
  let fields: FieldDefinition[] = [{ name: '', path: '', primitive: 1 }];
  let samplePayload = '{\n  "backup": {\n    "size": 1024,\n    "processed_rows": 42\n  }\n}';
  let discovering = false;
  let discoveryError = '';
  let discoveryWarnings: string[] = [];
  let discovered: DiscoveredField[] = [];
  let selectedDiscovered: string[] = [];
  let detail: Template | null = null;
  let detailLoading = false;
  let detailError = '';
  let pendingDelete: Template | null = null;

  $: selectedWorkspace = workspaces.find((item) => item.id === workspaceId) ?? null;
  $: canManage = !!selectedWorkspace && (selectedWorkspace.personal || selectedWorkspace.account_owner || selectedWorkspace.role === 'admin');

  function errorMessage(status: number, code: string | null): string {
    if (status === 401) return 'Your session needs attention. Sign in again to continue.';
    if (status === 403) return 'You do not have permission to manage templates in this workspace.';
    if (status === 404) return 'This template or workspace is no longer available.';
    if (status === 409) return code === 'version_conflict' || code === 'template_version_conflict'
      ? 'This template changed elsewhere. Reload it before saving your changes.'
      : 'This operation conflicts with the current state. Refresh and try again.';
    if (status === 422) return 'The template was not accepted. Check its fields and try again.';
    if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
    if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
    return code ? `The request could not be completed (${code}).` : 'The request could not be completed.';
  }

  async function readError(response: Response): Promise<string> {
    const body = await response.json().catch(() => null) as ApiError | null;
    return errorMessage(response.status, body?.error?.code ?? null);
  }

  function idempotencyHeaders(): HeadersInit {
    return { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() };
  }

  async function loadTemplates(next: string | null = null) {
    const current = ++sequence;
    if (!workspaceId) { templates = []; loading = false; return; }
    loading = true; listError = '';
    const params = new URLSearchParams({ workspace_id: workspaceId, limit: '25' });
    if (query.trim()) params.set('q', query.trim());
    if (next) params.set('cursor', next);
    try {
      const response = await fetch(`/api/backend/templates?${params}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json().catch(() => null) as Page<Template> | ApiError | null;
      if (current !== sequence) return;
      if (!response.ok) { const e = body as ApiError | null; listError = errorMessage(response.status, e?.error?.code ?? null); return; }
      const page = body as Page<Template>;
      templates = Array.isArray(page.data) ? page.data : [];
      nextCursor = page.page?.next_cursor ?? null;
      cursor = next;
    } catch { if (current === sequence) listError = errorMessage(0, 'network_error'); }
    finally { if (current === sequence) loading = false; }
  }

  async function bootstrap() {
    loading = true; bootError = '';
    const result = await loadWorkspaceBootstrap();
    if (!result.workspaces.ok) { bootError = errorMessage(result.workspaces.status, result.workspaces.code); loading = false; return; }
    workspaces = result.workspaces.data.data;
    const personal = result.me.ok ? result.me.data.personal_workspace_id : null;
    workspaceId = workspaces.find((w) => w.id === personal)?.id ?? workspaces[0]?.id ?? '';
    if (!workspaceId) { loading = false; return; }
    await loadTemplates(null);
  }

  function openCreate() {
    mode = 'create'; editing = null; name = ''; description = '';
    fields = [{ name: '', path: '', primitive: 1 }]; formError = ''; notice = ''; formOpen = true;
    discoveryError = ''; discoveryWarnings = []; discovered = []; selectedDiscovered = [];
  }

  async function openEdit(template: Template) {
    if (template.kind === 'built_in') return;
    formError = ''; notice = ''; formOpen = true; mode = 'edit'; editing = template;
    name = template.name; description = template.description ?? '';
    fields = template.fields.map((field) => ({ ...field }));
    discoveryError = ''; discoveryWarnings = []; discovered = []; selectedDiscovered = [];
    // Load the latest version before editing to avoid silently overwriting a concurrent update.
    try {
      const response = await fetch(`/api/backend/templates/${encodeURIComponent(template.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json().catch(() => null) as Template | ApiError | null;
      if (!response.ok) { formError = errorMessage(response.status, (body as ApiError | null)?.error?.code ?? null); return; }
      const latest = body as Template;
      editing = latest; name = latest.name; description = latest.description ?? ''; fields = latest.fields.map((field) => ({ ...field }));
    } catch { formError = errorMessage(0, 'network_error'); }
  }

  function addField() { fields = [...fields, { name: '', path: '', primitive: 1 }]; }
  function removeField(index: number) { if (fields.length > 1) fields = fields.filter((_, i) => i !== index); }
  function updateField(index: number, key: keyof FieldDefinition, value: string | number) {
    fields = fields.map((field, i) => i === index ? { ...field, [key]: value } as FieldDefinition : field);
  }

  async function discoverFields() {
    discoveryError = ''; discoveryWarnings = []; discovered = []; selectedDiscovered = [];
    let payload: unknown;
    try { payload = JSON.parse(samplePayload); } catch { discoveryError = 'Enter valid JSON before discovering fields.'; return; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { discoveryError = 'The sample payload must be a JSON object.'; return; }
    discovering = true;
    try {
      const response = await fetch('/api/backend/templates/discover-fields', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: idempotencyHeaders(),
        body: JSON.stringify({ workspace_id: workspaceId, payload }),
      });
      const body = await response.json().catch(() => null) as { fields?: DiscoveredField[]; warnings?: { code: string }[] } | ApiError | null;
      if (!response.ok) { discoveryError = errorMessage(response.status, (body as ApiError | null)?.error?.code ?? null); return; }
      const result = body as { fields?: DiscoveredField[]; warnings?: { code: string }[] };
      discovered = Array.isArray(result.fields) ? result.fields : [];
      discoveryWarnings = (result.warnings ?? []).map((warning) => warning.code);
    } catch { discoveryError = errorMessage(0, 'network_error'); }
    finally { discovering = false; }
  }

  function toggleDiscovered(field: DiscoveredField, checked: boolean) {
    const key = `${field.name}\u0000${field.path}`;
    selectedDiscovered = checked ? [...selectedDiscovered, key] : selectedDiscovered.filter((item) => item !== key);
  }

  function addDiscoveredFields() {
    const chosen = discovered.filter((field) => selectedDiscovered.includes(`${field.name}\u0000${field.path}`));
    if (!chosen.length) return;
    const combined = [...fields.filter((field) => field.name.trim() || field.path.trim()), ...chosen.map(({ name, path, primitive, meta }) => ({ name, path, primitive, ...(meta ? { meta } : {}) }))];
    const unique = new Map<string, FieldDefinition>();
    for (const field of combined) unique.set(`${field.name}\u0000${field.path}`, field);
    fields = unique.size ? [...unique.values()] : [{ name: '', path: '', primitive: 1 }];
    selectedDiscovered = [];
  }

  function validateForm(): string | null {
    if (!name.trim()) return 'Give this template a name.';
    if (name.trim().length > 120) return 'Template names must be 120 characters or fewer.';
    if (description.length > 1000) return 'Descriptions must be 1,000 characters or fewer.';
    const valid = fields.filter((field) => field.name.trim() && field.path.trim());
    if (!valid.length) return 'Add at least one field with a name and JSON path.';
    const names = valid.map((field) => field.name.trim());
    if (new Set(names).size !== names.length) return 'Field names must be unique.';
    if (valid.filter((field) => field.primitive === 3).length > 1) return 'Only one field can use the Timestamp primitive.';
    if (valid.some((field) => !Number.isInteger(field.primitive) || field.primitive < 0 || field.primitive > 7)) return 'Choose a valid primitive for every field.';
    return null;
  }

  async function saveTemplate(event: SubmitEvent) {
    event.preventDefault(); formError = ''; notice = '';
    const validation = validateForm(); if (validation) { formError = validation; return; }
    if (!canManage) { formError = 'You can view templates here, but only workspace managers can save them.'; return; }
    saving = true;
    const payload = { workspace_id: workspaceId, name: name.trim(), description: description.trim(), fields: fields.filter((field) => field.name.trim() && field.path.trim()).map((field) => ({ ...field, name: field.name.trim(), path: field.path.trim() })) };
    try {
      const response = mode === 'create'
        ? await fetch('/api/backend/templates', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: idempotencyHeaders(), body: JSON.stringify(payload) })
        : await fetch(`/api/backend/templates/${encodeURIComponent(editing!.id)}`, { method: 'PATCH', credentials: 'same-origin', cache: 'no-store', headers: idempotencyHeaders(), body: JSON.stringify({ ...payload, expected_version: editing!.version }) });
      if (!response.ok) { formError = await readError(response); return; }
      formOpen = false; notice = mode === 'create' ? 'Template created.' : 'Template updated.';
      cursorStack = [null]; pageIndex = 0; await loadTemplates(null);
    } catch { formError = errorMessage(0, 'network_error'); }
    finally { saving = false; }
  }

  async function showDetail(template: Template) {
    detail = null; detailError = ''; detailLoading = true;
    try {
      const response = await fetch(`/api/backend/templates/${encodeURIComponent(template.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json().catch(() => null) as Template | ApiError | null;
      if (!response.ok) { detailError = errorMessage(response.status, (body as ApiError | null)?.error?.code ?? null); return; }
      detail = body as Template;
    } catch { detailError = errorMessage(0, 'network_error'); }
    finally { detailLoading = false; }
  }

  async function deleteTemplate() {
    if (!pendingDelete || !canManage) return;
    const target = pendingDelete; saving = true; formError = '';
    try {
      const response = await fetch(`/api/backend/templates/${encodeURIComponent(target.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { method: 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Idempotency-Key': crypto.randomUUID() } });
      if (!response.ok) { formError = await readError(response); return; }
      pendingDelete = null; detail = null; notice = 'Template deleted. Existing monitors are unchanged.';
      cursorStack = [null]; pageIndex = 0; await loadTemplates(null);
    } catch { formError = errorMessage(0, 'network_error'); }
    finally { saving = false; }
  }

  function runSearch() { cursorStack = [null]; pageIndex = 0; void loadTemplates(null); }
  function handleSearchInput() { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); }
  function nextPage() { if (!nextCursor || loading) return; cursorStack = [...cursorStack.slice(0, pageIndex + 1), nextCursor]; pageIndex += 1; void loadTemplates(nextCursor); }
  function previousPage() { if (pageIndex === 0 || loading) return; pageIndex -= 1; void loadTemplates(cursorStack[pageIndex]); }
  function closeForm() { if (!saving) formOpen = false; }

  onMount(() => { void bootstrap(); return () => { if (searchTimer) clearTimeout(searchTimer); }; });
</script>

<section class="template-page" aria-labelledby="template-heading">
  <header class="template-page__header">
    <div><p class="template-eyebrow">REUSABLE FIELD DEFINITIONS</p><h1 id="template-heading">Templates</h1><p class="template-muted">Start monitors with reusable fields. Templates never remain linked to monitors after creation.</p></div>
    {#if canManage}<button class="template-button template-button--primary" type="button" on:click={openCreate}>New template <span aria-hidden="true">＋</span></button>{/if}
  </header>

  {#if workspaces.length > 1}
    <label class="template-workspace">Workspace <select bind:value={workspaceId} on:change={() => { cursorStack = [null]; pageIndex = 0; void loadTemplates(null); }}><option value="" disabled>Select workspace</option>{#each workspaces as workspace}<option value={workspace.id}>{workspace.name}{workspace.personal ? ' · Personal' : ''}</option>{/each}</select></label>
  {/if}
  {#if bootError}<div class="template-alert" role="alert">{bootError} <button type="button" on:click={() => void bootstrap()}>Try again</button></div>{/if}
  {#if notice}<div class="template-notice" role="status">{notice}<button type="button" aria-label="Dismiss message" on:click={() => notice = ''}>×</button></div>{/if}
  {#if formError && !formOpen}<div class="template-alert" role="alert">{formError}</div>{/if}

  <div class="template-toolbar"><label class="template-search"><span class="sr-only">Search templates</span><span aria-hidden="true">⌕</span><input bind:value={query} on:input={handleSearchInput} placeholder="Search names, descriptions, fields…" /></label><span class="template-count">{loading ? 'Loading…' : `${templates.length} template${templates.length === 1 ? '' : 's'} on this page`}</span></div>

  {#if listError}<div class="template-state template-state--error" role="alert"><p>{listError}</p><button class="template-button" type="button" on:click={() => void loadTemplates(cursorStack[pageIndex])}>Try again</button></div>
  {:else if loading && templates.length === 0}<div class="template-state" aria-live="polite">Loading templates…</div>
  {:else if templates.length === 0}<div class="template-state"><h2>{query ? 'No matching templates' : 'No templates yet'}</h2><p>{query ? 'Try a different search term.' : 'Create a reusable set of field definitions, or discover fields from a representative JSON payload.'}</p>{#if !query && canManage}<button class="template-button template-button--primary" type="button" on:click={openCreate}>Create a template</button>{/if}</div>
  {:else}
    <div class="template-list" aria-busy={loading}>{#each templates as template (template.id)}
      <article class="template-card">
        <div class="template-card__main"><div class="template-card__title"><h2>{template.name}</h2><span class={`template-kind ${template.kind === 'built_in' ? 'template-kind--built-in' : ''}`}>{template.kind === 'built_in' ? 'Built-in' : 'Custom'}</span></div>
          <p>{template.description || 'No description.'}</p><div class="template-card__meta"><span>{template.fields.length} field{template.fields.length === 1 ? '' : 's'}</span><span>Version {template.version}</span><span>{template.fields.slice(0, 3).map((field) => field.name).join(' · ')}{template.fields.length > 3 ? ' …' : ''}</span></div>
        </div><div class="template-card__actions"><button class="template-button" type="button" on:click={() => void showDetail(template)}>Inspect fields</button>{#if template.kind === 'custom' && canManage}<button class="template-button" type="button" on:click={() => void openEdit(template)}>Edit</button><button class="template-button template-button--danger" type="button" on:click={() => pendingDelete = template}>Delete</button>{/if}</div>
      </article>
    {/each}</div>
    <nav class="template-pagination" aria-label="Template list pages"><button class="template-button" type="button" on:click={previousPage} disabled={pageIndex === 0 || loading}>← Previous</button><span>Page {pageIndex + 1}</span><button class="template-button" type="button" on:click={nextPage} disabled={!nextCursor || loading}>Next →</button></nav>
  {/if}
  <p class="template-footnote">Templates are starting points only. Editing or deleting a template never changes monitors that already use its field definitions.</p>
</section>

{#if formOpen}
  <div class="template-overlay" role="presentation" on:click={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
    <section class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-form-title">
      <header class="template-dialog__header"><div><p class="template-eyebrow">{mode === 'create' ? 'NEW STARTING POINT' : 'CUSTOM TEMPLATE'}</p><h2 id="template-form-title">{mode === 'create' ? 'Create template' : 'Edit template'}</h2></div><button class="template-icon-button" type="button" aria-label="Close" on:click={closeForm} disabled={saving}>×</button></header>
      {#if formError}<div class="template-alert" role="alert">{formError}</div>{/if}
      <form on:submit={saveTemplate}>
        <label class="template-label">Name<input bind:value={name} maxlength="120" required placeholder="e.g. Database backup" /></label>
        <label class="template-label">Description <span>Optional</span><textarea bind:value={description} maxlength="1000" rows="2" placeholder="What these fields are intended to verify" /></label>
        <section class="template-discovery"><div class="template-section-heading"><div><h3>Discover fields</h3><p>Paste a representative JSON object. Sample values are used for discovery only and are not saved.</p></div></div><label class="template-label">Sample JSON<textarea class="template-json-input" bind:value={samplePayload} rows="6" spellcheck="false" /></label><div class="template-actions"><button class="template-button" type="button" on:click={() => void discoverFields()} disabled={discovering || !workspaceId}>{discovering ? 'Discovering…' : 'Discover fields'}</button>{#if discovered.length}<button class="template-button" type="button" on:click={addDiscoveredFields} disabled={!selectedDiscovered.length}>Add selected ({selectedDiscovered.length})</button>{/if}</div>
          {#if discoveryError}<p class="template-inline-error" role="alert">{discoveryError}</p>{/if}
          {#if discoveryWarnings.length}<p class="template-warning">Some values were skipped: {[...new Set(discoveryWarnings)].join(', ')}. Review the discovered fields before saving.</p>{/if}
          {#if discovered.length}<div class="template-discovered">{#each discovered as field}<label class="template-discovered__row"><input type="checkbox" checked={selectedDiscovered.includes(`${field.name}\u0000${field.path}`)} on:change={(event) => toggleDiscovered(field, event.currentTarget.checked)} /><span><strong>{field.name}</strong><small>{field.path}</small></span><span>{primitiveNames[field.primitive] ?? 'Unknown'}</span></label>{/each}</div>{/if}
        </section>
        <section class="template-fields"><div class="template-section-heading"><div><h3>Template fields</h3><p>Choose the field names, JSON paths, and interpretation types.</p></div><button class="template-button" type="button" on:click={addField}>Add field ＋</button></div>
          {#each fields as field, index}<div class="template-field-row"><label class="template-label">Field name<input value={field.name} on:input={(event) => updateField(index, 'name', event.currentTarget.value)} required placeholder="processed_rows" /></label><label class="template-label">JSON path<input value={field.path} on:input={(event) => updateField(index, 'path', event.currentTarget.value)} required placeholder="backup.processed_rows" /></label><label class="template-label">Type<select value={field.primitive} on:change={(event) => updateField(index, 'primitive', Number(event.currentTarget.value))}>{#each primitiveOptions as option}<option value={option.value}>{option.label}</option>{/each}</select></label><button class="template-icon-button" type="button" aria-label={`Remove field ${index + 1}`} on:click={() => removeField(index)} disabled={fields.length === 1}>×</button></div>{/each}
          <p class="template-muted template-small">At least one valid field is required. Advanced assertion, reasoning, and checksum metadata are preserved when editing existing fields.</p>
        </section>
        <footer class="template-dialog__footer"><button class="template-button" type="button" on:click={closeForm} disabled={saving}>Cancel</button><button class="template-button template-button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Create template' : 'Save changes'}</button></footer>
      </form>
    </section>
  </div>
{/if}

{#if detail || detailLoading || detailError}
  <div class="template-overlay" role="presentation" on:click={(event) => { if (event.target === event.currentTarget) { detail = null; detailError = ''; } }}>
    <section class="template-dialog template-dialog--detail" role="dialog" aria-modal="true" aria-labelledby="template-detail-title"><header class="template-dialog__header"><div><p class="template-eyebrow">FIELD DEFINITIONS</p><h2 id="template-detail-title">{detail?.name ?? 'Template details'}</h2></div><button class="template-icon-button" type="button" aria-label="Close details" on:click={() => { detail = null; detailError = ''; }}>×</button></header>
      {#if detailLoading}<p class="template-muted">Loading template…</p>{:else if detailError}<div class="template-alert" role="alert">{detailError}</div>{:else if detail}<p class="template-muted">{detail.description || 'No description.'} · Version {detail.version}</p><div class="template-detail-fields">{#each detail.fields as field}<article><div><h3>{field.name}</h3><code>{field.path}</code></div><span>{primitiveNames[field.primitive]}</span>{#if field.meta}<details><summary>Advanced rules</summary><pre>{JSON.stringify(field.meta, null, 2)}</pre></details>{/if}</article>{/each}</div><p class="template-footnote">These definitions are copied into a monitor when selected. This template does not remain linked to that monitor.</p>{/if}
    </section>
  </div>
{/if}

{#if pendingDelete}
  <div class="template-overlay" role="presentation"><section class="template-confirm" role="alertdialog" aria-modal="true" aria-labelledby="template-delete-title"><p class="template-eyebrow">DELETE TEMPLATE</p><h2 id="template-delete-title">Delete “{pendingDelete.name}”?</h2><p>Existing monitors will keep their copied field definitions. This cannot be undone.</p>{#if formError}<div class="template-alert" role="alert">{formError}</div>{/if}<footer class="template-dialog__footer"><button class="template-button" type="button" on:click={() => pendingDelete = null} disabled={saving}>Cancel</button><button class="template-button template-button--danger" type="button" on:click={() => void deleteTemplate()} disabled={saving}>{saving ? 'Deleting…' : 'Delete template'}</button></footer></section></div>
{/if}

<style>
  .template-page{max-width:1180px;margin:0 auto;padding:clamp(1.25rem,3vw,2.5rem);color:var(--text-primary,#1b1e27)}
  .template-page__header,.template-card,.template-card__title,.template-toolbar,.template-card__meta,.template-card__actions,.template-pagination,.template-dialog__header,.template-dialog__footer,.template-section-heading,.template-actions{display:flex;align-items:center;justify-content:space-between;gap:1rem}
  .template-page__header{align-items:flex-end;margin-bottom:2rem}.template-page h1{font-size:clamp(2rem,4vw,2.8rem);letter-spacing:-.045em;margin:.25rem 0 .5rem}.template-page h2,.template-dialog h2{letter-spacing:-.025em}.template-eyebrow{font-size:.72rem;letter-spacing:.16em;font-weight:750;color:#6557f5;margin:0 0 .55rem}.template-muted,.template-page__header p,.template-card__main>p{color:var(--text-muted,#697386);line-height:1.55}.template-page__header p{margin:0}.template-button{border:1px solid #dce1eb;border-radius:11px;background:white;color:#242936;padding:.65rem .9rem;font:inherit;font-size:.9rem;cursor:pointer;white-space:nowrap}.template-button:hover:not(:disabled){border-color:#9a90ff;background:#faf9ff}.template-button:disabled{opacity:.45;cursor:not-allowed}.template-button--primary{background:#242333;color:white;border-color:#242333}.template-button--primary:hover:not(:disabled){background:#39364e;color:white}.template-button--danger{color:#a72f43}.template-workspace{display:flex;align-items:center;gap:.8rem;margin-bottom:1.5rem;color:#626b7c}.template-workspace select{border:1px solid #dce1eb;border-radius:10px;padding:.6rem;background:white;color:#242936}.template-toolbar{margin:1.5rem 0 1rem}.template-search{display:flex;align-items:center;gap:.6rem;border:1px solid #dce1eb;background:#fff;border-radius:12px;padding:0 .85rem;max-width:560px;width:100%;color:#777}.template-search input{width:100%;border:0;outline:0;background:transparent;padding:.85rem 0;font:inherit}.template-count,.template-card__meta{font-size:.82rem;color:#778093}.template-list{display:grid;gap:.8rem}.template-card{align-items:flex-start;border:1px solid #e0e4ec;background:white;border-radius:16px;padding:1.25rem 1.35rem;gap:1.5rem}.template-card__main{min-width:0;flex:1}.template-card__title{justify-content:flex-start;flex-wrap:wrap;gap:.7rem}.template-card h2{font-size:1.08rem;margin:0}.template-card__main>p{margin:.5rem 0 .8rem;font-size:.92rem}.template-kind{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;padding:.28rem .5rem;background:#f1efff;color:#6252e8}.template-kind--built-in{background:#edf2f8;color:#596779}.template-card__meta{justify-content:flex-start;flex-wrap:wrap;gap:.45rem 1rem}.template-card__actions{justify-content:flex-end;flex-wrap:wrap}.template-state{padding:3rem 1rem;text-align:center;background:#fff;border:1px dashed #dce1eb;border-radius:16px;color:#697386}.template-state h2{margin:0 0 .5rem;color:#202431}.template-state p{margin:0 auto 1.2rem;max-width:480px;line-height:1.6}.template-state--error{border-color:#f0c8cf;color:#a72f43}.template-alert,.template-notice{padding:.8rem 1rem;border-radius:10px;margin:.8rem 0;line-height:1.5}.template-alert{background:#fff2f3;border:1px solid #f2c7ce;color:#8e2738}.template-alert button,.template-notice button{margin-left:.7rem;background:transparent;border:0;text-decoration:underline;color:inherit;cursor:pointer}.template-notice{background:#f0edff;border:1px solid #dcd5ff;color:#463b9e;display:flex;justify-content:space-between}.template-pagination{justify-content:center;margin:1.5rem 0}.template-pagination span{color:#727b8b;font-size:.88rem}.template-footnote{color:#7b8494;font-size:.8rem;line-height:1.6;margin-top:1.5rem}.template-overlay{position:fixed;z-index:100;inset:0;background:rgba(21,23,35,.42);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem}.template-dialog,.template-confirm{width:min(860px,100%);max-height:min(90vh,1000px);overflow:auto;background:#fff;border:1px solid #e0e4ec;border-radius:20px;padding:clamp(1rem,3vw,1.6rem);box-shadow:0 24px 90px #17172a2b}.template-dialog--detail{width:min(720px,100%)}.template-dialog__header{margin-bottom:1.25rem}.template-dialog__header h2,.template-confirm h2{font-size:1.5rem;margin:0}.template-icon-button{border:1px solid #dce1eb;border-radius:10px;background:#fff;font-size:1.35rem;width:2.5rem;height:2.5rem;cursor:pointer;color:#5e6676}.template-label{display:flex;flex-direction:column;gap:.45rem;font-size:.84rem;font-weight:650;color:#434a59;margin-bottom:1rem}.template-label>span{font-weight:400;color:#8a92a1}.template-label input,.template-label textarea,.template-label select{width:100%;box-sizing:border-box;border:1px solid #dce1eb;border-radius:10px;padding:.75rem .8rem;font:inherit;font-weight:400;color:#252936;background:white;min-width:0}.template-label textarea{resize:vertical}.template-json-input,.template-detail-fields pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;background:#f7f8fb}.template-discovery,.template-fields{border-top:1px solid #e8ebf1;margin-top:1.4rem;padding-top:1.3rem}.template-section-heading{align-items:flex-start;margin-bottom:1rem}.template-section-heading h3{margin:0 0 .35rem;font-size:1rem}.template-section-heading p{margin:0;color:#7a8393;font-size:.82rem;line-height:1.5}.template-actions{justify-content:flex-start;flex-wrap:wrap;margin:.8rem 0}.template-discovered{border:1px solid #e1e5ed;border-radius:12px;overflow:hidden}.template-discovered__row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.8rem;padding:.7rem .8rem;border-bottom:1px solid #edf0f5;font-size:.82rem}.template-discovered__row:last-child{border-bottom:0}.template-discovered__row span:nth-child(2){display:flex;flex-direction:column;min-width:0}.template-discovered__row small{color:#788193;overflow-wrap:anywhere;margin-top:.2rem}.template-discovered__row>span:last-child{color:#6257d8}.template-warning{background:#fff8e8;border-radius:8px;padding:.7rem;color:#79571b;font-size:.82rem}.template-inline-error{color:#a72f43;font-size:.85rem}.template-field-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) minmax(130px,.7fr) auto;align-items:end;gap:.65rem;margin-bottom:.7rem}.template-field-row .template-label{margin:0}.template-small{font-size:.78rem}.template-dialog__footer{justify-content:flex-end;border-top:1px solid #e8ebf1;padding-top:1rem;margin-top:1.25rem}.template-detail-fields{display:grid;gap:.6rem;margin-top:1rem}.template-detail-fields article{border:1px solid #e3e7ef;border-radius:12px;padding:.9rem;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem;align-items:center}.template-detail-fields h3{margin:0 0 .35rem;font-size:.95rem}.template-detail-fields code{color:#697386;font-size:.8rem;overflow-wrap:anywhere}.template-detail-fields>article>span{color:#5e53d5;font-size:.8rem;font-weight:700}.template-detail-fields details{grid-column:1/-1;font-size:.8rem;color:#697386}.template-detail-fields pre{padding:.8rem;border-radius:8px;overflow:auto}.template-confirm{width:min(480px,100%)}.template-confirm>p:not(.template-eyebrow){color:#697386;line-height:1.6}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(max-width:760px){.template-page__header{align-items:flex-start;flex-direction:column}.template-toolbar{align-items:flex-start;flex-direction:column}.template-card{flex-direction:column}.template-card__actions{justify-content:flex-start}.template-field-row{grid-template-columns:1fr 1fr}.template-field-row .template-icon-button{justify-self:end}.template-dialog{max-height:94vh}.template-section-heading{flex-direction:column}.template-card__meta{gap:.4rem .7rem}}
  @media(prefers-reduced-motion:reduce){.template-overlay{backdrop-filter:none}}
</style>
