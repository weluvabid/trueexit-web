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
  import TemplateEditorDialog from '../features/templates/editor/template-editor-dialog.svelte';
  import TemplateList from '../features/templates/list/template-list.svelte';
  import TemplateDetailDialog from '../features/templates/detail/template-detail-dialog.svelte';
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

  <TemplateList
    {templates}
    bind:query
    {loading}
    {listError}
    {nextCursor}
    {pageIndex}
    {canManage}
    {saving}
    onSearchInput={handleSearchInput}
    onRetry={() => void loadTemplates(cursorStack[pageIndex])}
    onCreate={openCreate}
    onInspect={(template) => void showDetail(template)}
    onEdit={(template) => void openEdit(template)}
    onDelete={(template) => { if (!saving) pendingDelete = template; }}
    onPreviousPage={previousPage}
    onNextPage={nextPage}
  />
  <p class="template-footnote">Templates are starting points only. Editing or deleting a template never changes monitors that already use its field definitions.</p>
</section>

{#if formOpen}
  <TemplateEditorDialog
    {mode}
    bind:name
    bind:description
    bind:fields
    bind:samplePayload
    bind:formTab
    {formError}
    {saving}
    {discovering}
    {workspaceId}
    {discovered}
    {selectedDiscovered}
    {discoveryError}
    {discoveryWarnings}
    {primitiveOptions}
    {primitiveNames}
    onClose={closeForm}
    onSubmit={saveTemplate}
    onDiscover={() => void discoverFields()}
    onAddField={addField}
    onRemoveField={removeField}
    onUpdateField={updateField}
    onAddSelected={addDiscoveredFields}
    onToggleDiscovered={toggleDiscovered}
  />
{/if}

{#if detail || detailLoading || detailError}
  <TemplateDetailDialog {detail} {detailLoading} {detailError} {primitiveNames} onClose={closeDetail} />
{/if}

{#if pendingDelete}
  <div class="template-overlay" role="presentation"><section class="template-confirm" role="alertdialog" aria-modal="true" aria-labelledby="template-delete-title"><p class="template-eyebrow">DELETE TEMPLATE</p><h2 id="template-delete-title">Delete “{pendingDelete.name}”?</h2><p>Existing monitors will keep their copied field definitions. This cannot be undone.</p>{#if formError}<div class="template-alert" role="alert">{formError}</div>{/if}<footer class="template-dialog__footer"><button class="template-button" type="button" onclick={() => pendingDelete = null} disabled={saving}>Cancel</button><button class="template-button template-button--danger" type="button" onclick={() => void deleteTemplate()} disabled={saving}>{saving ? 'Deleting…' : 'Delete template'}</button></footer></section></div>
{/if}

