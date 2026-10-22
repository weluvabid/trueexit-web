<svelte:options runes={true} />
<script lang="ts">
  import { getSharedQueryClient } from '../lib/client/query-client';
  import { templateQueryKeys } from '../lib/client/template-queries';
  import { fetchTemplatePage, fetchTemplateDetail, TemplateQueryError } from '../lib/client/template-queries';
  import { getApiErrorCode } from '../lib/client/api-response';
  import { can } from '../lib/client/permissions';
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import type { FieldDefinition, Primitive } from '../lib/client/template-types';
  import TemplateManualFieldEditor from './templates/TemplateManualFieldEditor.svelte';
  import { addTemplateField, removeTemplateField, updateTemplateField, discoveredFieldKey, mergeDiscoveredFields } from '../lib/client/template-field-model';
  import { validateTemplateDraft } from '../lib/client/template-validation';
  import { templateErrorMessage } from '../lib/client/template-errors';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveWorkspaceId } from '../lib/client/workspace-preference';

  const queryClient = getSharedQueryClient();

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

  let workspaces = $state<WorkspaceContext[]>([]);
  let workspaceId = $state('');
  let templates = $state<Template[]>([]);
  let query = $state('');
  let cursor = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let cursorStack = $state<(string | null)[]>([null]);
  let pageIndex = $state(0);
  let loading = $state(true);
  let saving = $state(false);
  let bootError = $state('');
  let listError = $state('');
  let formError = $state('');
  let notice = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;
  let bootstrapSequence = 0;
  let disposed = false;
  let detailSequence = 0;
  let editSequence = 0;
  let discoverySequence = 0;
  let mutationSequence = 0;
  let formOpen = $state(false);
  let mode = $state<Mode>('create');
  let formTab = $state<'json' | 'fields'>('json');
  let editing = $state<Template | null>(null);
  let name = $state('');
  let description = $state('');
  let fields = $state<FieldDefinition[]>([{ name: '', path: '', primitive: 1 }]);
  let samplePayload = $state('{\n  "backup": {\n    "size": 1024,\n    "processed_rows": 42\n  }\n}');
  let discovering = $state(false);
  let discoveryError = $state('');
  let discoveryWarnings = $state<string[]>([]);
  let discovered = $state<DiscoveredField[]>([]);
  let selectedDiscovered = $state<string[]>([]);
  let detail = $state<Template | null>(null);
  let detailLoading = $state(false);
  let detailError = $state('');
  let pendingDelete = $state<Template | null>(null);

  const selectedWorkspace = $derived(workspaces.find((item) => item.id === workspaceId) ?? null);
  const canManage = $derived(can(selectedWorkspace, 'templates.create'));


  async function readError(response: Response): Promise<string> {
    const body = await response.json().catch(() => null) as ApiError | null;
    return templateErrorMessage(response.status, getApiErrorCode(body));
  }

  function idempotencyHeaders(): HeadersInit {
    return { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() };
  }

  async function loadTemplates(next: string | null = null) {
    const current = ++sequence;
    if (!workspaceId) { templates = []; loading = false; return; }
    loading = true; listError = '';
    const targetWorkspaceId = workspaceId;
    try {
      const page = await fetchTemplatePage<Template>(targetWorkspaceId, query, next);
      if (current !== sequence || workspaceId !== targetWorkspaceId) return;
      templates = Array.isArray(page.data) ? page.data : [];
      nextCursor = page.page?.next_cursor ?? null;
      cursor = next;
    } catch (error) {
      if (current === sequence && workspaceId === targetWorkspaceId) {
        listError = error instanceof TemplateQueryError
          ? templateErrorMessage(error.status, error.code)
          : templateErrorMessage(0, 'network_error');
      }
    } finally { if (current === sequence) loading = false; }
  }

  async function bootstrap() {
    const current = ++bootstrapSequence;
    loading = true; bootError = '';
    try {
      const result = await loadWorkspaceBootstrap();
      if (disposed || current !== bootstrapSequence) return;
      if (!result.workspaces.ok) { bootError = templateErrorMessage(result.workspaces.status, result.workspaces.code); loading = false; return; }
      workspaces = result.workspaces.data.data;
      const personal = result.me.ok ? result.me.data.personal_workspace_id : null;
      workspaceId = resolveWorkspaceId(workspaces, [readActiveWorkspaceId(), personal]);
      writeActiveWorkspaceId(workspaceId);
      if (!workspaceId) { loading = false; return; }
      await loadTemplates(null);
    } catch {
      if (!disposed && current === bootstrapSequence) {
        bootError = templateErrorMessage(0, 'network_error');
        loading = false;
      }
    }
  }

  function openCreate() {
    if (saving) return;
    editSequence += 1;
    discoverySequence += 1;
    discovering = false;
    mode = 'create'; editing = null; name = ''; description = '';
    fields = [{ name: '', path: '', primitive: 1 }]; formError = ''; notice = ''; formTab = 'json'; formOpen = true;
    discoveryError = ''; discoveryWarnings = []; discovered = []; selectedDiscovered = [];
  }

  async function openEdit(template: Template) {
    if (saving || template.kind === 'built_in') return;
    const current = ++editSequence;
    discoverySequence += 1;
    discovering = false;
    const targetWorkspaceId = workspaceId;
    formError = ''; notice = ''; formTab = 'fields'; formOpen = true; mode = 'edit'; editing = template;
    name = template.name; description = template.description ?? '';
    fields = template.fields.map((field) => ({ ...field }));
    discoveryError = ''; discoveryWarnings = []; discovered = []; selectedDiscovered = [];
    // Load the latest version before editing to avoid silently overwriting a concurrent update.
    try {
      const latest = await fetchTemplateDetail<Template>(targetWorkspaceId, template.id);
      if (current !== editSequence || !formOpen || mode !== 'edit' || editing?.id !== template.id || workspaceId !== targetWorkspaceId) return;
      editing = latest; name = latest.name; description = latest.description ?? ''; fields = latest.fields.map((field) => ({ ...field }));
    } catch (error) {
      if (current === editSequence && formOpen && mode === 'edit' && editing?.id === template.id && workspaceId === targetWorkspaceId) {
        // Query failures retain the API status and domain error code.
        formError = error instanceof TemplateQueryError
          ? templateErrorMessage(error.status, error.code)
          : templateErrorMessage(0, 'network_error');
      }
    }
  }

  function addField() { fields = addTemplateField(fields); }
  function removeField(index: number) { fields = removeTemplateField(fields, index); }
  function updateField(index: number, key: keyof FieldDefinition, value: string | number) {
    fields = updateTemplateField(fields, index, key, value);
  }

  async function discoverFields() {
    const current = ++discoverySequence;
    const targetWorkspaceId = workspaceId;
    const targetSamplePayload = samplePayload;
    discoveryError = ''; discoveryWarnings = []; discovered = []; selectedDiscovered = [];
    let payload: unknown;
    try { payload = JSON.parse(targetSamplePayload); } catch { discoveryError = 'Enter valid JSON before discovering fields.'; return; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { discoveryError = 'The sample payload must be a JSON object.'; return; }
    discovering = true;
    try {
      const response = await fetch('/api/backend/templates/discover-fields', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: idempotencyHeaders(),
        body: JSON.stringify({ workspace_id: targetWorkspaceId, payload }),
      });
      const body = await response.json().catch(() => null) as { fields?: DiscoveredField[]; warnings?: { code: string }[] } | ApiError | null;
      if (current !== discoverySequence || !formOpen || workspaceId !== targetWorkspaceId || samplePayload !== targetSamplePayload) return;
      if (!response.ok) { discoveryError = templateErrorMessage(response.status, (body as ApiError | null)?.error?.code ?? null); return; }
      const result = body as { fields?: DiscoveredField[]; warnings?: { code: string }[] };
      discovered = Array.isArray(result.fields) ? result.fields : [];
      discoveryWarnings = (result.warnings ?? []).map((warning) => warning.code);
    } catch {
      if (current === discoverySequence && formOpen && workspaceId === targetWorkspaceId && samplePayload === targetSamplePayload) {
        discoveryError = templateErrorMessage(0, 'network_error');
      }
    } finally {
      if (current === discoverySequence) discovering = false;
    }
  }

  function toggleDiscovered(field: DiscoveredField, checked: boolean) {
    const key = discoveredFieldKey(field);
    selectedDiscovered = checked ? [...selectedDiscovered, key] : selectedDiscovered.filter((item) => item !== key);
  }

  function addDiscoveredFields() {
    const merged = mergeDiscoveredFields(fields, discovered, selectedDiscovered);
    if (merged === fields) return;
    fields = merged;
    selectedDiscovered = [];
  }


  async function saveTemplate(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    formError = ''; notice = '';
    const validation = validateTemplateDraft({ name, description, fields });
    if (validation) { formError = validation; return; }
    if (!canManage) { formError = 'You can view templates here, but only workspace managers can save them.'; return; }

    // Snapshot the operation inputs. UI state must not change the target of an in-flight write.
    const operation = ++mutationSequence;
    const targetMode = mode;
    const targetWorkspaceId = workspaceId;
    const targetTemplate = editing ? { ...editing } : null;
    if (targetMode === 'edit' && !targetTemplate) {
      formError = 'The template being edited is no longer available. Close the editor and try again.';
      return;
    }
    const payload = {
      workspace_id: targetWorkspaceId,
      name: name.trim(),
      description: description.trim(),
      fields: fields.filter((field) => field.name.trim() && field.path.trim()).map((field) => ({ ...field, name: field.name.trim(), path: field.path.trim() })),
    };
    saving = true;
    try {
      const response = targetMode === 'create'
        ? await fetch('/api/backend/templates', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: idempotencyHeaders(), body: JSON.stringify(payload) })
        : await fetch(`/api/backend/templates/${encodeURIComponent(targetTemplate!.id)}`, { method: 'PATCH', credentials: 'same-origin', cache: 'no-store', headers: idempotencyHeaders(), body: JSON.stringify({ ...payload, expected_version: targetTemplate!.version }) });
      if (operation !== mutationSequence) return;
      if (!response.ok) {
        const message = await readError(response);
        if (operation === mutationSequence) formError = message;
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: templateQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['monitor-templates'] }),
      ]);
      if (operation !== mutationSequence) return;
      formOpen = false;
      notice = targetMode === 'create' ? 'Template created.' : 'Template updated.';
      cursorStack = [null]; pageIndex = 0;
      await loadTemplates(null);
    } catch {
      if (operation === mutationSequence) formError = templateErrorMessage(0, 'network_error');
    } finally {
      if (operation === mutationSequence) saving = false;
    }
  }

  async function showDetail(template: Template) {
    const current = ++detailSequence;
    const targetWorkspaceId = workspaceId;
    detail = null; detailError = ''; detailLoading = true;
    try {
      const result = await fetchTemplateDetail<Template>(targetWorkspaceId, template.id);
      if (current !== detailSequence || workspaceId !== targetWorkspaceId) return;
      detail = result;
    } catch (error) {
      if (current === detailSequence && workspaceId === targetWorkspaceId) {
        detailError = error instanceof TemplateQueryError
          ? templateErrorMessage(error.status, error.code)
          : templateErrorMessage(0, 'network_error');
      }
    } finally {
      if (current === detailSequence) detailLoading = false;
    }
  }

  function closeDetail() {
    detailSequence += 1;
    detail = null;
    detailError = '';
    detailLoading = false;
  }

  async function deleteTemplate() {
    if (saving || !pendingDelete || !canManage) return;
    const operation = ++mutationSequence;
    const target = { ...pendingDelete };
    const targetWorkspaceId = workspaceId;
    saving = true;
    formError = '';
    try {
      const response = await fetch(`/api/backend/templates/${encodeURIComponent(target.id)}?workspace_id=${encodeURIComponent(targetWorkspaceId)}`, { method: 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Idempotency-Key': crypto.randomUUID() } });
      if (operation !== mutationSequence) return;
      if (!response.ok) {
        const message = await readError(response);
        if (operation === mutationSequence) formError = message;
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: templateQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['monitor-templates'] }),
      ]);
      if (operation !== mutationSequence) return;
      pendingDelete = null;
      detail = null;
      notice = 'Template deleted. Existing monitors are unchanged.';
      cursorStack = [null]; pageIndex = 0;
      await loadTemplates(null);
    } catch {
      if (operation === mutationSequence) formError = templateErrorMessage(0, 'network_error');
    } finally {
      if (operation === mutationSequence) saving = false;
    }
  }

  function runSearch() { cursorStack = [null]; pageIndex = 0; void loadTemplates(null); }
  function handleSearchInput() { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); }
  function nextPage() { if (!nextCursor || loading) return; cursorStack = [...cursorStack.slice(0, pageIndex + 1), nextCursor]; pageIndex += 1; void loadTemplates(nextCursor); }
  function previousPage() { if (pageIndex === 0 || loading) return; pageIndex -= 1; void loadTemplates(cursorStack[pageIndex]); }
  function closeForm() {
    if (saving) return;
    editSequence += 1;
    discoverySequence += 1;
    discovering = false;
    formOpen = false;
  }

  onMount(() => {
    disposed = false;
    void bootstrap();
    return () => {
      disposed = true;
      bootstrapSequence += 1;
      if (searchTimer) clearTimeout(searchTimer);
      sequence += 1;
      detailSequence += 1;
      editSequence += 1;
      discoverySequence += 1;
      mutationSequence += 1;
    };
  });
</script>

<section class="template-page" aria-labelledby="template-heading">
  <header class="template-page__header">
    <div><p class="template-eyebrow">REUSABLE FIELD DEFINITIONS</p><h1 id="template-heading">Templates</h1><p class="template-muted">Start monitors with reusable fields. Templates never remain linked to monitors after creation.</p></div>
    {#if canManage}<button class="template-button template-button--primary" type="button" onclick={openCreate} disabled={saving}>New template <span aria-hidden="true">＋</span></button>{/if}
  </header>

  {#if bootError}<div class="template-alert" role="alert">{bootError} <button type="button" onclick={() => void bootstrap()}>Try again</button></div>{/if}
  {#if notice}<div class="template-notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onclick={() => notice = ''}>×</button></div>{/if}
  {#if formError && !formOpen}<div class="template-alert" role="alert">{formError}</div>{/if}

  <div class="template-toolbar"><label class="template-search"><span class="sr-only">Search templates</span><span aria-hidden="true">⌕</span><input bind:value={query} oninput={handleSearchInput} placeholder="Search names, descriptions, fields…" /></label><span class="template-count">{loading ? 'Loading…' : `${templates.length} template${templates.length === 1 ? '' : 's'} on this page`}</span></div>

  {#if listError}<div class="template-state template-state--error" role="alert"><p>{listError}</p><button class="template-button" type="button" onclick={() => void loadTemplates(cursorStack[pageIndex])}>Try again</button></div>
  {:else if loading && templates.length === 0}<div class="template-state" aria-live="polite">Loading templates…</div>
  {:else if templates.length === 0}<div class="template-state"><h2>{query ? 'No matching templates' : 'No templates yet'}</h2><p>{query ? 'Try a different search term.' : 'Create a reusable set of field definitions, or discover fields from a representative JSON payload.'}</p>{#if !query && canManage}<button class="template-button template-button--primary" type="button" onclick={openCreate}>Create a template</button>{/if}</div>
  {:else}
    <div class="template-list" aria-busy={loading}>{#each templates as template (template.id)}
      <article class="template-card">
        <div class="template-card__main"><div class="template-card__title"><h2>{template.name}</h2><span class={`template-kind ${template.kind === 'built_in' ? 'template-kind--built-in' : ''}`}>{template.kind === 'built_in' ? 'Built-in' : 'Custom'}</span></div>
          <p>{template.description || 'No description.'}</p><div class="template-card__meta"><span>{template.fields.length} field{template.fields.length === 1 ? '' : 's'}</span><span>Version {template.version}</span><span>{template.fields.slice(0, 3).map((field) => field.name).join(' · ')}{template.fields.length > 3 ? ' …' : ''}</span></div>
        </div><div class="template-card__actions"><button class="template-button" type="button" onclick={() => void showDetail(template)} disabled={saving}>Inspect fields</button>{#if template.kind === 'custom' && canManage}<button class="template-button" type="button" onclick={() => void openEdit(template)} disabled={saving}>Edit</button><button class="template-button template-button--danger" type="button" onclick={() => { if (!saving) pendingDelete = template; }} disabled={saving}>Delete</button>{/if}</div>
      </article>
    {/each}</div>
    <nav class="template-pagination" aria-label="Template list pages"><button class="template-button" type="button" onclick={previousPage} disabled={pageIndex === 0 || loading}>← Previous</button><span>Page {pageIndex + 1}</span><button class="template-button" type="button" onclick={nextPage} disabled={!nextCursor || loading}>Next →</button></nav>
  {/if}
  <p class="template-footnote">Templates are starting points only. Editing or deleting a template never changes monitors that already use its field definitions.</p>
</section>

{#if formOpen}
  <div class="template-overlay" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
    <section class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-form-title">
      <header class="template-dialog__header"><div><p class="template-eyebrow">{mode === 'create' ? 'NEW STARTING POINT' : 'CUSTOM TEMPLATE'}</p><h2 id="template-form-title">{mode === 'create' ? 'Create template' : 'Edit template'}</h2></div><button class="template-icon-button" type="button" aria-label="Close" onclick={closeForm} disabled={saving}>×</button></header>
      {#if formError}<div class="template-alert" role="alert">{formError}</div>{/if}
      <form onsubmit={saveTemplate}>
        <label class="template-label">Name<input bind:value={name} maxlength="120" required placeholder="e.g. Database backup" /></label>
        <label class="template-label">Description <span>Optional</span><textarea bind:value={description} maxlength="1000" rows="2" placeholder="What these fields are intended to verify" /></label>
        <nav class="template-editor-tabs" aria-label="Template field editor"><button type="button" class:active={formTab === 'json'} onclick={() => formTab = 'json'}>Paste JSON</button><button type="button" class:active={formTab === 'fields'} onclick={() => formTab = 'fields'}>Add fields</button></nav>
        {#if formTab === 'json'}
        <section class="template-discovery"><div class="template-section-heading"><div><h3>Discover fields from JSON</h3><p>Paste a representative JSON object. Choose discovered fields to add them to the template; sample values are never saved.</p></div></div><label class="template-label">Sample JSON<textarea class="template-json-input" bind:value={samplePayload} rows="8" spellcheck="false" placeholder={`{
  "backup": {
    "size": 1024,
    "processed_rows": 42
  }
}`} /></label><div class="template-actions"><button class="template-button template-button--primary" type="button" onclick={() => void discoverFields()} disabled={discovering || !workspaceId}>{discovering ? 'Discovering…' : 'Discover fields'}</button>{#if discovered.length}<button class="template-button" type="button" onclick={addDiscoveredFields} disabled={!selectedDiscovered.length}>Add selected ({selectedDiscovered.length})</button>{/if}</div>
          {#if discoveryError}<p class="template-inline-error" role="alert">{discoveryError}</p>{/if}
          {#if discoveryWarnings.length}<p class="template-warning">Some values were skipped: {[...new Set(discoveryWarnings)].join(', ')}. Review the discovered fields before saving.</p>{/if}
          {#if discovered.length}<div class="template-discovered">{#each discovered as field}<label class="template-discovered__row"><input type="checkbox" checked={selectedDiscovered.includes(`${field.name}\u0000${field.path}`)} onchange={(event) => toggleDiscovered(field, event.currentTarget.checked)} /><span><strong>{field.name}</strong><small>{field.path}</small></span><span>{primitiveNames[field.primitive] ?? 'Unknown'}</span></label>{/each}</div>{/if}
        </section>
        {:else}
        <TemplateManualFieldEditor {fields} {primitiveOptions} onAddField={addField} onRemoveField={removeField} onUpdateField={updateField} />
        {/if}
        <footer class="template-dialog__footer"><button class="template-button" type="button" onclick={closeForm} disabled={saving}>Cancel</button><button class="template-button template-button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Create template' : 'Save changes'}</button></footer>
      </form>
    </section>
  </div>
{/if}

{#if detail || detailLoading || detailError}
  <div class="template-overlay" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) closeDetail() }}>
    <section class="template-dialog template-dialog--detail" role="dialog" aria-modal="true" aria-labelledby="template-detail-title"><header class="template-dialog__header"><div><p class="template-eyebrow">FIELD DEFINITIONS</p><h2 id="template-detail-title">{detail?.name ?? 'Template details'}</h2></div><button class="template-icon-button" type="button" aria-label="Close details" onclick={closeDetail}>×</button></header>
      {#if detailLoading}<p class="template-muted">Loading template…</p>{:else if detailError}<div class="template-alert" role="alert">{detailError}</div>{:else if detail}<p class="template-muted">{detail.description || 'No description.'} · Version {detail.version}</p><div class="template-detail-fields">{#each detail.fields as field}<article><div><h3>{field.name}</h3><code>{field.path}</code></div><span>{primitiveNames[field.primitive]}</span>{#if field.meta}<details><summary>Advanced rules</summary><pre>{JSON.stringify(field.meta, null, 2)}</pre></details>{/if}</article>{/each}</div><p class="template-footnote">These definitions are copied into a monitor when selected. This template does not remain linked to that monitor.</p>{/if}
    </section>
  </div>
{/if}

{#if pendingDelete}
  <div class="template-overlay" role="presentation"><section class="template-confirm" role="alertdialog" aria-modal="true" aria-labelledby="template-delete-title"><p class="template-eyebrow">DELETE TEMPLATE</p><h2 id="template-delete-title">Delete “{pendingDelete.name}”?</h2><p>Existing monitors will keep their copied field definitions. This cannot be undone.</p>{#if formError}<div class="template-alert" role="alert">{formError}</div>{/if}<footer class="template-dialog__footer"><button class="template-button" type="button" onclick={() => pendingDelete = null} disabled={saving}>Cancel</button><button class="template-button template-button--danger" type="button" onclick={() => void deleteTemplate()} disabled={saving}>{saving ? 'Deleting…' : 'Delete template'}</button></footer></section></div>
{/if}

<style>
  .template-page{max-width:1180px;margin:0 auto;padding:clamp(1.25rem,3vw,2.5rem);color:var(--text-primary,#1b1e27)}
  .template-page__header,.template-card,.template-card__title,.template-toolbar,.template-card__meta,.template-card__actions,.template-pagination,.template-dialog__header,.template-dialog__footer,.template-section-heading,.template-actions{display:flex;align-items:center;justify-content:space-between;gap:1rem}
  .template-page__header{align-items:flex-end;margin-bottom:2rem}.template-page h1{font-size:clamp(2rem,4vw,2.8rem);letter-spacing:-.045em;margin:.25rem 0 .5rem}.template-page h2,.template-dialog h2{letter-spacing:-.025em}.template-eyebrow{font-size:.72rem;letter-spacing:.16em;font-weight:750;color:#6557f5;margin:0 0 .55rem}.template-muted,.template-page__header p,.template-card__main>p{color:var(--text-muted,#697386);line-height:1.55}.template-page__header p{margin:0}.template-button{border:1px solid #dce1eb;border-radius:11px;background:white;color:#242936;padding:.65rem .9rem;font:inherit;font-size:.9rem;cursor:pointer;white-space:nowrap}.template-button:hover:not(:disabled){border-color:#9a90ff;background:#faf9ff}.template-button:disabled{opacity:.45;cursor:not-allowed}.template-button--primary{background:#242333;color:white;border-color:#242333}.template-button--primary:hover:not(:disabled){background:#39364e;color:white}.template-button--danger{color:#a72f43}.template-workspace{display:flex;align-items:center;gap:.8rem;margin-bottom:1.5rem;color:#626b7c}.template-workspace select{border:1px solid #dce1eb;border-radius:10px;padding:.6rem;background:white;color:#242936}.template-toolbar{margin:1.5rem 0 1rem}.template-search{display:flex;align-items:center;gap:.6rem;border:1px solid #dce1eb;background:#fff;border-radius:12px;padding:0 .85rem;max-width:560px;width:100%;color:#777}.template-search input{width:100%;border:0;outline:0;background:transparent;padding:.85rem 0;font:inherit}.template-count,.template-card__meta{font-size:.82rem;color:#778093}.template-list{display:grid;gap:.8rem}.template-card{align-items:flex-start;border:1px solid #e0e4ec;background:white;border-radius:16px;padding:1.25rem 1.35rem;gap:1.5rem}.template-card__main{min-width:0;flex:1}.template-card__title{justify-content:flex-start;flex-wrap:wrap;gap:.7rem}.template-card h2{font-size:1.08rem;margin:0}.template-card__main>p{margin:.5rem 0 .8rem;font-size:.92rem}.template-kind{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;padding:.28rem .5rem;background:#f1efff;color:#6252e8}.template-kind--built-in{background:#edf2f8;color:#596779}.template-card__meta{justify-content:flex-start;flex-wrap:wrap;gap:.45rem 1rem}.template-card__actions{justify-content:flex-end;flex-wrap:wrap}.template-state{padding:3rem 1rem;text-align:center;background:#fff;border:1px dashed #dce1eb;border-radius:16px;color:#697386}.template-state h2{margin:0 0 .5rem;color:#202431}.template-state p{margin:0 auto 1.2rem;max-width:480px;line-height:1.6}.template-state--error{border-color:#f0c8cf;color:#a72f43}.template-alert,.template-notice{padding:.8rem 1rem;border-radius:10px;margin:.8rem 0;line-height:1.5}.template-alert{background:#fff2f3;border:1px solid #f2c7ce;color:#8e2738}.template-alert button,.template-notice button{margin-left:.7rem;background:transparent;border:0;text-decoration:underline;color:inherit;cursor:pointer}.template-notice{background:#f0edff;border:1px solid #dcd5ff;color:#463b9e;display:flex;justify-content:space-between}.template-pagination{justify-content:center;margin:1.5rem 0}.template-pagination span{color:#727b8b;font-size:.88rem}.template-footnote{color:#7b8494;font-size:.8rem;line-height:1.6;margin-top:1.5rem}.template-overlay{position:fixed;z-index:100;inset:0;background:rgba(21,23,35,.42);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem}.template-dialog,.template-confirm{width:min(860px,100%);max-height:min(90vh,1000px);overflow:auto;background:#fff;border:1px solid #e0e4ec;border-radius:20px;padding:clamp(1rem,3vw,1.6rem);box-shadow:0 24px 90px #17172a2b}.template-dialog--detail{width:min(720px,100%)}.template-dialog__header{margin-bottom:1.25rem}.template-dialog__header h2,.template-confirm h2{font-size:1.5rem;margin:0}.template-icon-button{border:1px solid #dce1eb;border-radius:10px;background:#fff;font-size:1.35rem;width:2.5rem;height:2.5rem;cursor:pointer;color:#5e6676}.template-label{display:flex;flex-direction:column;gap:.45rem;font-size:.84rem;font-weight:650;color:#434a59;margin-bottom:1rem}.template-label>span{font-weight:400;color:#8a92a1}.template-label input,.template-label textarea,.template-label select{width:100%;box-sizing:border-box;border:1px solid #dce1eb;border-radius:10px;padding:.75rem .8rem;font:inherit;font-weight:400;color:#252936;background:white;min-width:0}.template-label textarea{resize:vertical}.template-json-input,.template-detail-fields pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;background:#f7f8fb}.template-discovery,.template-fields{border-top:1px solid #e8ebf1;margin-top:1.4rem;padding-top:1.3rem}.template-section-heading{align-items:flex-start;margin-bottom:1rem}.template-section-heading h3{margin:0 0 .35rem;font-size:1rem}.template-section-heading p{margin:0;color:#7a8393;font-size:.82rem;line-height:1.5}.template-actions{justify-content:flex-start;flex-wrap:wrap;margin:.8rem 0}.template-discovered{border:1px solid #e1e5ed;border-radius:12px;overflow:hidden}.template-discovered__row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.8rem;padding:.7rem .8rem;border-bottom:1px solid #edf0f5;font-size:.82rem}.template-discovered__row:last-child{border-bottom:0}.template-discovered__row span:nth-child(2){display:flex;flex-direction:column;min-width:0}.template-discovered__row small{color:#788193;overflow-wrap:anywhere;margin-top:.2rem}.template-discovered__row>span:last-child{color:#6257d8}.template-warning{background:#fff8e8;border-radius:8px;padding:.7rem;color:#79571b;font-size:.82rem}.template-inline-error{color:#a72f43;font-size:.85rem}.template-field-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) minmax(130px,.7fr) auto;align-items:end;gap:.65rem;margin-bottom:.7rem}.template-field-row .template-label{margin:0}.template-small{font-size:.78rem}.template-dialog__footer{justify-content:flex-end;border-top:1px solid #e8ebf1;padding-top:1rem;margin-top:1.25rem}.template-detail-fields{display:grid;gap:.6rem;margin-top:1rem}.template-detail-fields article{border:1px solid #e3e7ef;border-radius:12px;padding:.9rem;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem;align-items:center}.template-detail-fields h3{margin:0 0 .35rem;font-size:.95rem}.template-detail-fields code{color:#697386;font-size:.8rem;overflow-wrap:anywhere}.template-detail-fields>article>span{color:#5e53d5;font-size:.8rem;font-weight:700}.template-detail-fields details{grid-column:1/-1;font-size:.8rem;color:#697386}.template-detail-fields pre{padding:.8rem;border-radius:8px;overflow:auto}.template-confirm{width:min(480px,100%)}.template-confirm>p:not(.template-eyebrow){color:#697386;line-height:1.6}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(max-width:760px){.template-page__header{align-items:flex-start;flex-direction:column}.template-toolbar{align-items:flex-start;flex-direction:column}.template-card{flex-direction:column}.template-card__actions{justify-content:flex-start}.template-field-row{grid-template-columns:1fr 1fr}.template-field-row .template-icon-button{justify-self:end}.template-dialog{max-height:94vh}.template-section-heading{flex-direction:column}.template-card__meta{gap:.4rem .7rem}}

  .template-editor-tabs{display:flex;gap:.35rem;padding:.3rem;margin:1.25rem 0 0;border:1px solid var(--border-subtle,#34323f);border-radius:12px;background:var(--surface-muted,#17161e)}
  .template-editor-tabs button{flex:1;min-height:42px;border:0;border-radius:9px;background:transparent;color:var(--text-muted,#a6a2b5);font:inherit;font-weight:650;cursor:pointer}
  .template-editor-tabs button.active{background:var(--surface-raised,#272431);color:var(--text-primary,#f3f0fb);box-shadow:0 1px 3px #0002}
  .template-dialog{background:var(--surface-raised,#14131b);border-color:var(--border-subtle,#34313f);color:var(--text-primary,#f3f0fb);box-shadow:0 24px 90px #0008}
  .template-dialog .template-label{color:var(--text-secondary,#c2bdcf)}
  .template-dialog .template-label input,.template-dialog .template-label textarea,.template-dialog .template-label select{background:var(--surface-input,#101016);color:var(--text-primary,#f3f0fb);border-color:var(--border-subtle,#373342)}
  .template-dialog .template-label input:focus,.template-dialog .template-label textarea:focus,.template-dialog .template-label select:focus{outline:2px solid #8171ed55;border-color:#8d7af1}
  .template-dialog .template-json-input{background:var(--surface-input,#101016);color:var(--text-primary,#f3f0fb)}
  .template-dialog .template-button{background:var(--surface-input,#17151f);color:var(--text-primary,#f3f0fb);border-color:var(--border-subtle,#393545)}
  .template-dialog .template-button--primary{background:linear-gradient(110deg,#6658e8,#8b6de8);border-color:transparent;color:#fff}
  .template-dialog .template-icon-button{background:var(--surface-input,#17151f);color:var(--text-secondary,#c7c1d4);border-color:var(--border-subtle,#393545)}
  .template-dialog__footer{border-color:var(--border-subtle,#393545)}
  .template-discovery,.template-fields{border-color:var(--border-subtle,#393545)}
  .template-discovered{border-color:var(--border-subtle,#393545)}.template-discovered__row{border-color:var(--border-subtle,#393545)}
  .template-fields--editor{margin-top:1.25rem}.template-field-row{padding:.9rem;border:1px solid var(--border-subtle,#393545);border-radius:12px;background:var(--surface-muted,#191720)}
  .template-dialog .template-detail-fields article{border-color:var(--border-subtle,#393545)}
  .template-dialog .template-detail-fields code{color:var(--text-muted,#a6a2b5)}
  .template-dialog .template-alert{background:#351b24;border-color:#68313d;color:#ffc0c9}
  :global(html[data-theme='light']) .template-dialog{background:#fff;color:#202431;border-color:#e0e4ec}
  :global(html[data-theme='light']) .template-dialog .template-label{color:#434a59}
  :global(html[data-theme='light']) .template-dialog .template-label input,:global(html[data-theme='light']) .template-dialog .template-label textarea,:global(html[data-theme='light']) .template-dialog .template-label select{background:#fff;color:#252936;border-color:#dce1eb}
  :global(html[data-theme='light']) .template-dialog .template-json-input{background:#f7f8fb;color:#252936}
  :global(html[data-theme='light']) .template-dialog .template-button{background:#fff;color:#242936;border-color:#dce1eb}
  :global(html[data-theme='light']) .template-dialog .template-button--primary{background:linear-gradient(110deg,#6658e8,#8b6de8);color:#fff;border-color:transparent}
  :global(html[data-theme='light']) .template-dialog .template-icon-button{background:#fff;color:#5e6676;border-color:#dce1eb}
  :global(html[data-theme='light']) .template-editor-tabs{background:#f4f2fb;border-color:#e3deef}
  :global(html[data-theme='light']) .template-editor-tabs button{color:#6b6679}
  :global(html[data-theme='light']) .template-editor-tabs button.active{background:#fff;color:#39334d}
  :global(html[data-theme='light']) .template-field-row{background:#fbfaff;border-color:#e3deef}
  @media(prefers-reduced-motion:reduce){.template-overlay{backdrop-filter:none}}

  /* Match the monitor inventory's restrained dark surfaces while retaining light mode. */
  .template-page{color:var(--text-primary,#f3f0fb)}
  .template-button{background:var(--surface-raised,#17161e);color:var(--text-primary,#f3f0fb);border-color:var(--border-subtle,#34313f)}
  .template-button:hover:not(:disabled){background:var(--surface-muted,#211f2a);border-color:#8171ed}
  .template-button--primary{background:linear-gradient(110deg,#6658e8,#8b6de8);color:#fff;border-color:transparent}
  .template-button--primary:hover:not(:disabled){background:linear-gradient(110deg,#7568f0,#9879ed);color:#fff}
  .template-search{background:var(--surface-input,#101016);border-color:var(--border-subtle,#34313f);color:var(--text-muted,#a6a2b5)}
  .template-search input{color:var(--text-primary,#f3f0fb)}
  .template-card{background:var(--surface-raised,#121117);border-color:var(--border-subtle,#34313f);box-shadow:0 1px 0 #ffffff04}
  .template-card:hover{border-color:#51486a}
  .template-card__main>p{color:var(--text-muted,#a6a2b5)}
  .template-count,.template-card__meta,.template-pagination span,.template-footnote{color:var(--text-muted,#a6a2b5)}
  .template-kind--built-in{background:var(--surface-muted,#211f2a);color:var(--text-secondary,#c7c1d4)}
  .template-state{background:var(--surface-raised,#121117);border-color:var(--border-subtle,#34313f);color:var(--text-muted,#a6a2b5)}
  .template-state h2{color:var(--text-primary,#f3f0fb)}
  .template-alert{background:#351b24;border-color:#68313d;color:#ffc0c9}
  .template-notice{background:#211d37;border-color:#494071;color:#d6ceff}
  .template-overlay{background:rgba(5,5,9,.76)}
  .template-confirm{background:var(--surface-raised,#14131b);color:var(--text-primary,#f3f0fb);border-color:var(--border-subtle,#34313f);box-shadow:0 24px 90px #0008}
  .template-confirm>p:not(.template-eyebrow){color:var(--text-muted,#a6a2b5)}
  .template-discovered__row{background:var(--surface-muted,#191720)}
  .template-warning{background:#332819;color:#f3d49b}
  .template-inline-error{color:#ffabb7}
  :global(html[data-theme='light']) .template-page{color:#202431}
  :global(html[data-theme='light']) .template-button{background:#fff;color:#242936;border-color:#dce1eb}
  :global(html[data-theme='light']) .template-button:hover:not(:disabled){background:#faf9ff;border-color:#9a90ff}
  :global(html[data-theme='light']) .template-button--primary{background:linear-gradient(110deg,#6658e8,#8b6de8);color:#fff;border-color:transparent}
  :global(html[data-theme='light']) .template-search{background:#fff;border-color:#dce1eb;color:#777}
  :global(html[data-theme='light']) .template-search input{color:#252936}
  :global(html[data-theme='light']) .template-card{background:#fff;border-color:#e0e4ec}
  :global(html[data-theme='light']) .template-card__main>p{color:#697386}
  :global(html[data-theme='light']) .template-count,:global(html[data-theme='light']) .template-card__meta,:global(html[data-theme='light']) .template-pagination span,:global(html[data-theme='light']) .template-footnote{color:#778093}
  :global(html[data-theme='light']) .template-kind--built-in{background:#edf2f8;color:#596779}
  :global(html[data-theme='light']) .template-state{background:#fff;border-color:#dce1eb;color:#697386}
  :global(html[data-theme='light']) .template-state h2{color:#202431}
  :global(html[data-theme='light']) .template-alert{background:#fff2f3;border-color:#f2c7ce;color:#8e2738}
  :global(html[data-theme='light']) .template-notice{background:#f0edff;border-color:#dcd5ff;color:#463b9e}
  :global(html[data-theme='light']) .template-overlay{background:rgba(21,23,35,.42)}
  :global(html[data-theme='light']) .template-confirm{background:#fff;color:#202431;border-color:#e0e4ec}
  :global(html[data-theme='light']) .template-confirm>p:not(.template-eyebrow){color:#697386}
  :global(html[data-theme='light']) .template-discovered__row{background:#fff}
  :global(html[data-theme='light']) .template-warning{background:#fff8e8;color:#79571b}
  :global(html[data-theme='light']) .template-inline-error{color:#a72f43}

</style>
