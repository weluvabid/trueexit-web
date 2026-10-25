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
      <TemplateFieldRow
        field={field}
        index={index}
        {primitiveOptions}
        canRemove={fields.length > 1}
        {onRemoveField}
        {onUpdateField}
      />
    {/each}
  </div>
  <p class="mt-3 text-xs leading-relaxed text-muted-foreground">At least one valid field is required. Advanced assertion, reasoning, and checksum metadata are preserved when editing existing fields.</p>
</section>
