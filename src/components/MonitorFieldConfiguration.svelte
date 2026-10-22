<script lang="ts">
  import type { MonitorEditorDraft, FieldPrimitive } from '../lib/client/monitor-editor-state';
  import type { MonitorTemplate } from '../lib/client/monitor-queries';

  export let draft: MonitorEditorDraft;
  export let fieldMode: 'json' | 'fields' | 'templates' = 'fields';
  export let jsonDraft = '';
  export let jsonError = '';
  export let fieldError = '';
  export let templates: MonitorTemplate[] = [];
  export let templatesLoading = false;
  export let templatesError = '';
  export let selectedTemplateId = '';
  export let templateApplyMode: 'replace' | 'merge' = 'replace';
  export let onAddField: () => void;
  export let onRemoveField: (key: number) => void;
  export let onSyncJsonFromFields: () => void;
  export let onApplyJsonDraft: () => void;
  export let onLoadTemplates: () => void;
  export let onApplyTemplate: () => void;

  const primitiveValues: Record<FieldPrimitive, number> = {
    size: 0, count: 1, duration: 2, timestamp: 3, boolean: 4, categorical: 5, checksum: 6, text: 7,
  };
  const primitiveLabels: Record<FieldPrimitive, string> = {
    size: 'Size', count: 'Count', duration: 'Duration', timestamp: 'Timestamp',
    boolean: 'Boolean', categorical: 'Categorical', checksum: 'Checksum', text: 'Text',
  };
</script>

          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>02</span><div><h3>Observed fields <b>*</b></h3><p>Map each field to a value in the JSON payload your process will send to Ping.</p></div><button class="monitor-button monitor-button--quiet" type="button" on:click={onAddField} disabled={draft.fields.length >= 50}>＋ Add field</button></div>
            <div class="monitor-field-modes" role="tablist" aria-label="Field configuration method">
              <button type="button" role="tab" aria-selected={fieldMode === 'json'} class:active={fieldMode === 'json'} on:click={() => { try { onSyncJsonFromFields(); fieldMode = 'json'; } catch (error) { jsonError = error instanceof Error ? error.message : 'Resolve conflicting paths first.'; } }}>JSON <small>Paste an object</small></button>
              <button type="button" role="tab" aria-selected={fieldMode === 'fields'} class:active={fieldMode === 'fields'} on:click={() => { if (fieldMode === 'json' && jsonDraft.trim()) onApplyJsonDraft(); else fieldMode = 'fields'; }}>Fields <small>Edit paths</small></button>
              <button type="button" role="tab" aria-selected={fieldMode === 'templates'} class:active={fieldMode === 'templates'} on:click={() => { if (fieldMode === 'json' && jsonDraft.trim()) { onApplyJsonDraft(); if (fieldMode === 'json') return; } fieldMode = 'templates'; void onLoadTemplates(); }}>Templates <small>Start from a template</small></button>
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
                <div class="monitor-json-actions"><span>{draft.fields.filter((field) => field.path.trim()).length} configured fields currently in the draft</span><button type="button" class="monitor-button monitor-button--primary" on:click={onApplyJsonDraft}>Parse JSON into fields <span aria-hidden="true">→</span></button></div>
              </div>
            {:else if fieldMode === 'templates'}
              <div class="monitor-template-mode"><p>Templates provide reusable field names, JSON paths, and interpretation types. They do not change cadence, tags, or destinations.</p>
                {#if templatesError}<p class="monitor-form-error" role="alert">{templatesError}</p>{/if}
                {#if templatesLoading}<p class="monitor-form-hint">Loading templates…</p>{:else if templates.length === 0}<div class="monitor-template-empty"><strong>No templates available</strong><span>Create a reusable field template first, or use JSON to discover fields from a sample payload.</span><a href="/templates">Open Templates ↗</a></div>{:else}
                  <div class="monitor-template-picker"><label class="monitor-form-field"><span>Choose a template</span><select bind:value={selectedTemplateId}><option value="">Select a template…</option>{#each templates as template (template.id)}<option value={template.id}>{template.name} · {template.fields.length} fields</option>{/each}</select></label><label class="monitor-form-field"><span>Apply method</span><select bind:value={templateApplyMode}><option value="replace">Replace current fields</option><option value="merge">Merge with current fields</option></select></label></div>
                  {#if selectedTemplateId}<div class="monitor-template-preview">{#each templates.find((template) => template.id === selectedTemplateId)?.fields ?? [] as field}<div><span><strong>{field.name}</strong><code>{field.path}</code></span><small>{primitiveLabels[(Object.entries(primitiveValues).find(([, value]) => value === field.primitive)?.[0] ?? 'text') as FieldPrimitive]}</small></div>{/each}</div><button type="button" class="monitor-button monitor-button--primary" on:click={onApplyTemplate}>Apply template to draft →</button>{/if}
                {/if}
              </div>
            {:else}
              <div class="monitor-fields-toolbar"><p>Enter nested JSON paths directly. Use Tab to move through each row; no nested-field builder required.</p><button class="monitor-button monitor-button--quiet" type="button" on:click={onAddField} disabled={draft.fields.length >= 50}>＋ Add field</button></div>
              <div class="monitor-field-list">
                {#each draft.fields as field, index (field.key)}
                  <div class="monitor-field-card">
                    <div class="monitor-field-card__top"><span>FIELD {String(index + 1).padStart(2, '0')}</span>{#if draft.fields.length > 1}<button type="button" class="monitor-remove-link" on:click={() => onRemoveField(field.key)}>Remove</button>{/if}</div>
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

