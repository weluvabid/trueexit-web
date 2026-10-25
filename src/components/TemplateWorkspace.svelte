<svelte:options runes={true} />
<script lang="ts">
  import { getSharedQueryClient } from '../lib/client/query-client';
  import { fetchTemplatePage, fetchTemplateDetail, TemplateQueryError } from '../lib/client/template-queries';
  import { ApiClientError } from '../lib/client/api-client';
  import { discoverTemplateFields, removeTemplate, writeTemplate } from '../lib/client/template-mutations';
  import { can } from '../lib/client/permissions';
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import type { FieldDefinition, Primitive, Template } from '../lib/client/template-types';
  import { PRIMITIVE_VALUES, PrimitiveCode } from '../lib/client/field-primitives';
  import TemplateManualFieldEditor from '../features/templates/fields/template-manual-field-editor.svelte';
  import { addTemplateField, removeTemplateField, updateTemplateField, discoveredFieldKey, mergeDiscoveredFields } from '../lib/client/template-field-model';
  import { validateTemplateDraft } from '../lib/client/template-validation';
  import { buildTemplatePayload, createTemplateDraft, parseSamplePayload } from '../lib/client/template-model';
  import { templateErrorMessage } from '../lib/client/template-errors';
  import { readActiveWorkspaceId, resolveAndPersistWorkspaceId } from '../lib/client/workspace-preference';

  const queryClient = getSharedQueryClient();

  type Page<T> = { data: T[]; page: { next_cursor: string | null } };
  type DiscoveredField = FieldDefinition & { source_type?: string };
  type Mode = 'create' | 'edit';

  const primitiveNames: Record<Primitive, string> = {
    [PrimitiveCode.size]: 'Size',
    [PrimitiveCode.count]: 'Count',
    [PrimitiveCode.duration]: 'Duration',
    [PrimitiveCode.timestamp]: 'Timestamp',
    [PrimitiveCode.boolean]: 'Boolean',
    [PrimitiveCode.categorical]: 'Categorical',
    [PrimitiveCode.checksum]: 'Checksum',
    [PrimitiveCode.text]: 'Text',
  };
  const primitiveValues = PRIMITIVE_VALUES satisfies readonly Primitive[];
  const primitiveOptions = primitiveValues.map((value) => ({ value, label: primitiveNames[value] }));

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
  let fields = $state<FieldDefinition[]>([{ name: '', path: '', primitive: PrimitiveCode.count }]);
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


  async function loadTemplates(next: string | null = null) {
    const current = ++sequence;
    if (!workspaceId) { templates = []; loading = false; return; }
    loading = true; listError = '';
    const targetWorkspaceId = workspaceId;
    try {
      const page = await fetchTemplatePage(targetWorkspaceId, query, next);
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
      workspaceId = resolveAndPersistWorkspaceId(workspaces, [readActiveWorkspaceId(), personal]);
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
    fields = [{ name: '', path: '', primitive: PrimitiveCode.count }]; formError = ''; notice = ''; formTab = 'json'; formOpen = true;
    discoveryError = ''; discoveryWarnings = []; discovered = []; selectedDiscovered = [];
  }

  async function openEdit(template: Template) {
    if (saving || template.kind === 'built_in') return;
    const current = ++editSequence;
    discoverySequence += 1;
    discovering = false;
    const targetWorkspaceId = workspaceId;
    formError = ''; notice = ''; formTab = 'fields'; formOpen = true; mode = 'edit'; editing = template;
    ({ name, description, fields } = createTemplateDraft(template));
    discoveryError = ''; discoveryWarnings = []; discovered = []; selectedDiscovered = [];
    // Load the latest version before editing to avoid silently overwriting a concurrent update.
    try {
      const latest = await fetchTemplateDetail(targetWorkspaceId, template.id);
      if (current !== editSequence || !formOpen || mode !== 'edit' || editing?.id !== template.id || workspaceId !== targetWorkspaceId) return;
      editing = latest; ({ name, description, fields } = createTemplateDraft(latest));
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
    const parsedPayload = parseSamplePayload(targetSamplePayload);
    if (!parsedPayload.ok) {
      discoveryError = parsedPayload.reason === 'invalid_json'
        ? 'Enter valid JSON before discovering fields.'
        : 'The sample payload must be a JSON object.';
      return;
    }
    const payload = parsedPayload.value;
    discovering = true;
    try {
      const discovery = await discoverTemplateFields(targetWorkspaceId, payload, crypto.randomUUID());
      if (current !== discoverySequence || !formOpen || workspaceId !== targetWorkspaceId || samplePayload !== targetSamplePayload) return;
      discovered = discovery.fields;
      discoveryWarnings = (discovery.warnings ?? []).map((warning) => warning.code);
    } catch (error) {
      if (current === discoverySequence && formOpen && workspaceId === targetWorkspaceId && samplePayload === targetSamplePayload) {
        discoveryError = error instanceof ApiClientError
          ? templateErrorMessage(error.status, error.code)
          : templateErrorMessage(0, 'network_error');
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
    const targetTemplate = targetMode === 'edit' && editing ? { ...editing } : null;
    if (targetMode === 'edit' && !targetTemplate) {
      formError = 'The template being edited is no longer available. Close the editor and try again.';
      return;
    }
    const payload = buildTemplatePayload(targetWorkspaceId, { name, description, fields });
    saving = true;
    try {
      await writeTemplate(queryClient, {
        mode: targetMode,
        payload,
        idempotencyKey: crypto.randomUUID(),
        ...(targetTemplate ? { template: targetTemplate } : {}),
      });
      if (operation !== mutationSequence) return;
      formOpen = false;
      notice = targetMode === 'create' ? 'Template created.' : 'Template updated.';
      cursorStack = [null]; pageIndex = 0;
      await loadTemplates(null);
    } catch (error) {
      if (operation === mutationSequence) formError = error instanceof ApiClientError
        ? templateErrorMessage(error.status, error.code)
        : templateErrorMessage(0, 'network_error');
    } finally {
      if (operation === mutationSequence) saving = false;
    }
  }

  async function showDetail(template: Template) {
    const current = ++detailSequence;
    const targetWorkspaceId = workspaceId;
    detail = null; detailError = ''; detailLoading = true;
    try {
      const result = await fetchTemplateDetail(targetWorkspaceId, template.id);
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
      await removeTemplate(queryClient, target.id, targetWorkspaceId, crypto.randomUUID());
      if (operation !== mutationSequence) return;
      pendingDelete = null;
      detail = null;
      notice = 'Template deleted. Existing monitors are unchanged.';
      cursorStack = [null]; pageIndex = 0;
      await loadTemplates(null);
    } catch (error) {
      if (operation === mutationSequence) formError = error instanceof ApiClientError
        ? templateErrorMessage(error.status, error.code)
        : templateErrorMessage(0, 'network_error');
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

