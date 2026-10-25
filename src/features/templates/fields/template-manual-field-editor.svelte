<svelte:options runes={true} />
<script lang="ts">
  import type { FieldDefinition, Primitive } from '../../../lib/client/template-types';
  import { Button } from '../../../components/ui/button/index.js';
  import { Input } from '../../../components/ui/input/index.js';
  import { Label } from '../../../components/ui/label/index.js';
  import * as Select from '../../../components/ui/select/index.js';
  import { Plus, Trash2 } from '@lucide/svelte';

  type PrimitiveOption = { value: Primitive; label: string };

  let { fields, primitiveOptions, onAddField, onRemoveField, onUpdateField }: {
    fields: FieldDefinition[];
    primitiveOptions: PrimitiveOption[];
    onAddField: () => void;
    onRemoveField: (index: number) => void;
    onUpdateField: (index: number, key: keyof FieldDefinition, value: string | number) => void;
  } = $props();
</script>

<section class="mt-5 border-t pt-5">
  <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
    <div class="space-y-1">
      <h3 class="text-base font-semibold">Define fields manually</h3>
      <p class="max-w-2xl text-sm text-muted-foreground">Add a field and provide its JSON path and interpretation type. Nested paths use dot notation.</p>
    </div>
    <Button type="button" onclick={onAddField}><Plus class="mr-1 size-4" /> Add field</Button>
  </div>

  <div class="space-y-3">
    {#each fields as field, index (index)}
      <div class="grid min-w-0 grid-cols-1 items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(9rem,.7fr)_auto]">
        <div class="grid min-w-0 gap-2">
          <Label for={`template-field-name-${index}`}>Field name</Label>
          <Input id={`template-field-name-${index}`} value={field.name} oninput={(event) => onUpdateField(index, 'name', event.currentTarget.value)} required placeholder="processed_rows" />
        </div>
        <div class="grid min-w-0 gap-2">
          <Label for={`template-field-path-${index}`}>JSON path</Label>
          <Input id={`template-field-path-${index}`} value={field.path} oninput={(event) => onUpdateField(index, 'path', event.currentTarget.value)} required placeholder="backup.processed_rows" />
        </div>
        <div class="grid min-w-0 gap-2">
          <Label>Type</Label>
          <Select.Root type="single" value={String(field.primitive)} onValueChange={(value) => { const numeric = Number(value); if (primitiveOptions.some((option) => Number(option.value) === numeric)) onUpdateField(index, 'primitive', numeric); }}>
            <Select.Trigger class="w-full" aria-label={`Type for field ${index + 1}`}>
              <Select.Value placeholder="Choose type" />
            </Select.Trigger>
            <Select.Content>
              {#each primitiveOptions as option}
                <Select.Item value={String(option.value)} label={option.label}>{option.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <Button variant="outline" size="icon" type="button" aria-label={`Remove field ${index + 1}`} onclick={() => onRemoveField(index)} disabled={fields.length === 1}>
          <Trash2 class="size-4" />
        </Button>
      </div>
    {/each}
  </div>
  <p class="mt-3 text-xs leading-relaxed text-muted-foreground">At least one valid field is required. Advanced assertion, reasoning, and checksum metadata are preserved when editing existing fields.</p>
</section>
