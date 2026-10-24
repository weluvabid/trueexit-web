<svelte:options runes={true} />
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { fieldPrimitiveFromValue, type MonitorEditorDraft, type FieldPrimitive } from '../lib/client/monitor-editor-state';
  import { buildMonitorJsonDraft, parseMonitorJsonDraft } from '../lib/client/monitor-field-editor';
  import { fetchMonitorTemplates, monitorTemplateQueryKeys, requireMonitorQueryResult, monitorQueryErrorMessage } from '../lib/client/monitor-queries';
  import { getSharedQueryClient } from '../lib/client/query-client';
  import * as Tabs from './ui/tabs/index.js';
  import * as Select from './ui/select/index.js';
  import { Button } from './ui/button/index.js';
  import { Input } from './ui/input/index.js';
  import { Textarea } from './ui/textarea/index.js';
  import { Label } from './ui/label/index.js';
  import { Alert, AlertDescription } from './ui/alert/index.js';
  import { Plus, Trash2, Braces, ListTree, LibraryBig, ArrowRight, ExternalLink } from '@lucide/svelte';

  let { draft, workspaceId = '', fieldError = $bindable('') }: { draft: MonitorEditorDraft; workspaceId?: string; fieldError?: string } = $props();

  let fieldMode = $state<'json' | 'fields' | 'templates'>('fields');
  let jsonDraft = $state('');
  let jsonError = $state('');

  let templateActionError = $state('');
  let selectedTemplateId = $state('');
  let templateApplyMode = $state<'replace' | 'merge'>('replace');
  let observedWorkspaceId = workspaceId;

  const queryClient = getSharedQueryClient();
  const templatesQuery = createQuery(() => ({
    queryKey: monitorTemplateQueryKeys.workspaceList(workspaceId),
    queryFn: async ({ signal }) => requireMonitorQueryResult(await fetchMonitorTemplates(workspaceId, signal)),
    enabled: fieldMode === 'templates' && Boolean(workspaceId),
    staleTime: 30_000,
    retry: false,
  }), () => queryClient);
  const templates = $derived(templatesQuery.data?.data ?? []);
  const templatesLoading = $derived(fieldMode === 'templates' && Boolean(workspaceId) && templatesQuery.isFetching);
  const templatesError = $derived(templateActionError || (templatesQuery.error ? monitorQueryErrorMessage(templatesQuery.error, messageFor) : ''));

  const primitiveOptions: FieldPrimitive[] = [
    'size', 'count', 'duration', 'timestamp', 'boolean', 'categorical', 'checksum', 'text',
  ];
  const primitiveLabels: Record<FieldPrimitive, string> = {
    size: 'Size', count: 'Count', duration: 'Duration', timestamp: 'Timestamp',
    boolean: 'Boolean', categorical: 'Categorical', checksum: 'Checksum', text: 'Text',
  };

  function messageFor(status: number, code: string | null): string {
    if (status === 401) return 'Your session needs attention. Sign in again to continue.';
    if (status === 403) return 'You do not have permission to perform this action in this workspace.';
    if (status === 404) return 'This template or workspace is no longer available.';
    if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
    if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
    return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
  }

  $effect(() => {
    if (workspaceId !== observedWorkspaceId) {
      observedWorkspaceId = workspaceId;
      selectedTemplateId = '';
      templateActionError = '';
    }
  });

  export function reset() {
    fieldMode = 'fields';
    jsonDraft = '';
    jsonError = '';
    templateActionError = '';
    selectedTemplateId = '';
    templateApplyMode = 'replace';
    fieldError = '';
  }

  export function applyPendingJson(): boolean {
    if (fieldMode !== 'json') return true;
    return applyJsonDraft();
  }

  function syncJsonFromFields() {
    try {
      jsonDraft = buildMonitorJsonDraft(draft.fields);
      jsonError = '';
    } catch (error) {
      jsonError = error instanceof Error ? error.message : 'Resolve conflicting paths first.';
      throw error;
    }
  }

  function applyJsonDraft(): boolean {
    try {
      const parsed = parseMonitorJsonDraft(jsonDraft, draft.nextFieldKey);
      draft.fields = parsed.fields;
      draft.nextFieldKey = parsed.nextFieldKey;
      fieldError = '';
      jsonError = '';
      fieldMode = 'fields';
      return true;
    } catch (error) {
      jsonError = error instanceof Error ? error.message : 'Check the JSON and try again.';
      return false;
    }
  }

  function addField() {
    if (draft.fields.length >= 50) return;
    draft.fields = [...draft.fields, { key: draft.nextFieldKey++, name: '', path: '', primitive: 'count' }];
    fieldError = '';
  }

  function removeField(key: number) {
    if (draft.fields.length <= 1) return;
    draft.fields = draft.fields.filter((field) => field.key !== key);
    fieldError = '';
  }

  function applySelectedTemplate() {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template || !template.fields.length) return;
    const mapped = template.fields.map((field) => ({
      key: draft.nextFieldKey++,
      name: field.name,
      path: field.path,
      primitive: fieldPrimitiveFromValue(field.primitive) ?? 'text',
    }));
    if (mapped.length > 50 || (templateApplyMode === 'merge' && draft.fields.length + mapped.length > 50)) {
      templateActionError = 'The resulting configuration would exceed the 50-field limit. Choose a smaller template or replace the current fields.';
      return;
    }
    if (templateApplyMode === 'merge') {
      const existing = new Set(draft.fields.map((field) => field.path));
      const duplicates = mapped.filter((field) => existing.has(field.path));
      if (duplicates.length) {
        templateActionError = `Cannot merge because these paths already exist: ${duplicates.map((field) => field.path).join(', ')}.`;
        return;
      }
      draft.fields = [...draft.fields, ...mapped];
    } else draft.fields = mapped;
    fieldError = '';
    templateActionError = '';
    fieldMode = 'fields';
  }


  function changeFieldMode(value: string) {
    const nextMode = value as 'json' | 'fields' | 'templates';
    if (nextMode === fieldMode) return;
    if (fieldMode === 'json' && jsonDraft.trim()) {
      const applied = applyJsonDraft();
      if (!applied) return;
    }
    if (nextMode === 'json') {
      try { syncJsonFromFields(); fieldMode = 'json'; } catch { /* Error is shown inline. */ }
      return;
    }
    fieldMode = nextMode;
  }

</script>

<div class="space-y-5">
  <section class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex gap-3">
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">02</span>
        <div class="space-y-1">
          <h3 class="font-semibold">Observed fields <span class="text-destructive">*</span></h3>
          <p class="max-w-2xl text-sm text-muted-foreground">Map each field to a value in the JSON payload your process will send to Ping.</p>
        </div>
      </div>
      <Button variant="outline" onclick={addField} disabled={draft.fields.length >= 50}>
        <Plus class="mr-1 size-4" /> Add field
      </Button>
    </div>

    <Tabs.Root value={fieldMode} onValueChange={changeFieldMode} class="w-full">
      <Tabs.List class="grid h-auto w-full grid-cols-3">
        <Tabs.Trigger value="json" class="gap-2 py-2">
          <Braces class="size-4" /><span>JSON</span>
        </Tabs.Trigger>
        <Tabs.Trigger value="fields" class="gap-2 py-2">
          <ListTree class="size-4" /><span>Fields</span>
        </Tabs.Trigger>
        <Tabs.Trigger value="templates" class="gap-2 py-2">
          <LibraryBig class="size-4" /><span>Templates</span>
        </Tabs.Trigger>
      </Tabs.List>

      {#if fieldError}
        <Alert variant="destructive" class="mt-4">
          <AlertDescription>{fieldError}</AlertDescription>
        </Alert>
      {/if}

      {#if fieldMode === 'json'}
        <div class="mt-4 space-y-4">
          <div class="grid gap-2">
            <Label for="monitor-json-payload">JSON payload <span class="text-destructive">*</span></Label>
            <Textarea id="monitor-json-payload" bind:value={jsonDraft} rows={10} spellcheck={false} class="min-h-56 font-mono text-xs" aria-describedby="monitor-json-help" placeholder={`{
  "backup": {
    "processed_rows": 42,
    "size": 1024
  }
}`} />
            <p id="monitor-json-help" class="text-xs leading-relaxed text-muted-foreground">Paste a representative object. Nested paths are discovered automatically; sample values are used to infer types, not submitted as monitor data.</p>
          </div>
          {#if jsonError}
            <Alert variant="destructive"><AlertDescription>{jsonError}</AlertDescription></Alert>
          {/if}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs text-muted-foreground">{draft.fields.filter((field) => field.path.trim()).length} configured fields currently in the draft</p>
            <Button onclick={applyJsonDraft}>Parse JSON into fields <ArrowRight class="ml-1 size-4" /></Button>
          </div>
        </div>
      {:else if fieldMode === 'templates'}
        <div class="mt-4 space-y-4">
          <p class="text-sm text-muted-foreground">Templates provide reusable field names, JSON paths, and interpretation types. They do not change cadence, tags, or destinations.</p>
          {#if templatesError}
            <Alert variant="destructive"><AlertDescription>{templatesError}</AlertDescription></Alert>
          {/if}
          {#if templatesLoading}
            <div class="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground" aria-live="polite">
              <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
              Loading templates…
            </div>
          {:else if templates.length === 0}
            <div class="rounded-lg border border-dashed p-6 text-center">
              <LibraryBig class="mx-auto mb-2 size-5 text-muted-foreground" />
              <h4 class="font-medium">No templates available</h4>
              <p class="mt-1 text-sm text-muted-foreground">Create a reusable field template first, or use JSON to discover fields from a sample payload.</p>
              <Button class="mt-4" variant="outline" href="/templates">Open Templates <ExternalLink class="ml-1 size-4" /></Button>
            </div>
          {:else}
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="monitor-field-template">Choose a template</Label>
                <Select.Root type="single" value={selectedTemplateId || '__trueexit_no_template__'} onValueChange={(value) => { selectedTemplateId = value === '__trueexit_no_template__' ? '' : value ?? ''; templateActionError = ''; }}>
                  <Select.Trigger id="monitor-field-template" class="w-full">
                    <Select.Value placeholder="Select a template…" />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="__trueexit_no_template__" label="Select a template…">Select a template…</Select.Item>
                    {#each templates as template (template.id)}
                      <Select.Item value={template.id} label={`${template.name} · ${template.fields.length} fields`}>{template.name} · {template.fields.length} fields</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="grid gap-2">
                <Label for="monitor-template-apply-mode">Apply method</Label>
                <Select.Root type="single" value={templateApplyMode} onValueChange={(value) => { if (value === 'replace' || value === 'merge') templateApplyMode = value; }}>
                  <Select.Trigger id="monitor-template-apply-mode" class="w-full"><Select.Value /></Select.Trigger>
                  <Select.Content>
                    <Select.Item value="replace" label="Replace current fields">Replace current fields</Select.Item>
                    <Select.Item value="merge" label="Merge with current fields">Merge with current fields</Select.Item>
                  </Select.Content>
                </Select.Root>
              </div>
            </div>
            {#if selectedTemplateId}
              <div class="overflow-hidden rounded-lg border">
                <div class="border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">Template field preview</div>
                <div class="divide-y">
                  {#each templates.find((template) => template.id === selectedTemplateId)?.fields ?? [] as field}
                    <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div class="min-w-0">
                        <p class="text-sm font-medium">{field.name}</p>
                        <code class="break-all text-xs text-muted-foreground">{field.path}</code>
                      </div>
                      <span class="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{primitiveLabels[fieldPrimitiveFromValue(field.primitive) ?? 'text']}</span>
                    </div>
                  {/each}
                </div>
              </div>
              <Button onclick={applySelectedTemplate}>Apply template to draft <ArrowRight class="ml-1 size-4" /></Button>
            {/if}
          {/if}
        </div>
      {:else}
        <div class="mt-4 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-muted-foreground">Enter nested JSON paths directly. Use Tab to move through each row; no nested-field builder required.</p>
            <span class="text-xs text-muted-foreground">{draft.fields.length} / 50 fields</span>
          </div>
          <div class="space-y-3">
            {#each draft.fields as field, index (field.key)}
              <div class="space-y-4 rounded-lg border p-4">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Field {String(index + 1).padStart(2, '0')}</span>
                  {#if draft.fields.length > 1}
                    <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" onclick={() => removeField(field.key)}>
                      <Trash2 class="mr-1 size-4" /> Remove
                    </Button>
                  {/if}
                </div>
                <div class="grid gap-4 md:grid-cols-3">
                  <div class="grid min-w-0 gap-2">
                    <Label for={`monitor-field-name-${field.key}`}>Field name <span class="text-destructive">*</span></Label>
                    <Input id={`monitor-field-name-${field.key}`} bind:value={field.name} maxlength={100} required placeholder="processed_rows" />
                  </div>
                  <div class="grid min-w-0 gap-2">
                    <Label for={`monitor-field-path-${field.key}`}>JSON path <span class="text-destructive">*</span></Label>
                    <Input id={`monitor-field-path-${field.key}`} bind:value={field.path} maxlength={200} required placeholder="backup.processed_rows" />
                    <p class="text-xs text-muted-foreground">Dot-separated path in the submitted JSON.</p>
                  </div>
                  <div class="grid min-w-0 gap-2">
                    <Label for={`monitor-field-primitive-${field.key}`}>Value type</Label>
                    <Select.Root type="single" value={field.primitive} onValueChange={(value) => { if (value && primitiveOptions.includes(value as FieldPrimitive)) field.primitive = value as FieldPrimitive; }}>
                      <Select.Trigger id={`monitor-field-primitive-${field.key}`} class="w-full"><Select.Value /></Select.Trigger>
                      <Select.Content>
                        {#each primitiveOptions as primitive}
                          <Select.Item value={primitive} label={primitiveLabels[primitive]}>{primitiveLabels[primitive]}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>
                </div>
                {#if field.primitive === 'checksum'}
                  <p class="text-xs text-muted-foreground">Checksum fields use SHA-256 with hexadecimal encoding.</p>
                {/if}
              </div>
            {/each}
          </div>
          <Button variant="outline" onclick={addField} disabled={draft.fields.length >= 50}>
            <Plus class="mr-1 size-4" /> Add field
          </Button>
        </div>
      {/if}
    </Tabs.Root>
  </section>
</div>
