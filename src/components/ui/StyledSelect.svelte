<script lang="ts">
  export type SelectOption = { value: string; label: string };

  let {
    label,
    value,
    options = [],
    onChange
  }: {
    label: string;
    value: string;
    options?: SelectOption[];
    onChange?: (value: string) => void;
  } = $props();

  let open = $state(false);
  const selected = $derived(options.find((option) => option.value === value) ?? options[0]);

  function choose(option: SelectOption) {
    onChange?.(option.value);
    open = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false;
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      open = true;
    }
  }
</script>

<div class="styled-select" class:styled-select--open={open} onkeydown={handleKeydown}>
  <button class="styled-select__trigger" type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onclick={() => open = !open}>
    <span>{selected?.label ?? 'Select…'}</span>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
  </button>
  {#if open}
    <div class="styled-select__menu" role="listbox" aria-label={label}>
      {#each options as option (option.value)}
        <button type="button" class="styled-select__option" class:styled-select__option--selected={option.value === value} role="option" aria-selected={option.value === value} onclick={() => choose(option)}>
          <span>{option.label}</span>
          {#if option.value === value}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .styled-select { position: relative; min-width: 0; }
  .styled-select__trigger { display: flex; width: 100%; min-width: 132px; min-height: 42px; align-items: center; justify-content: space-between; gap: 16px; padding: 0 12px; border: 1px solid var(--color-border, #302d3b); border-radius: 11px; background: var(--color-surface-secondary, #171720); color: var(--color-text, #f4f2fa); font: inherit; font-size: 11px; font-weight: 550; text-align: left; cursor: pointer; transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease; }
  .styled-select__trigger:hover, .styled-select--open .styled-select__trigger { border-color: color-mix(in srgb, var(--color-accent, #a78bfa) 60%, var(--color-border, #302d3b)); }
  .styled-select__trigger:focus-visible, .styled-select__option:focus-visible { outline: 2px solid var(--color-accent, #a78bfa); outline-offset: 2px; }
  .styled-select__trigger svg, .styled-select__option svg { width: 15px; height: 15px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .styled-select__menu { position: absolute; z-index: 60; top: calc(100% + 6px); left: 0; width: max(100%, 170px); max-height: 260px; overflow: auto; padding: 5px; border: 1px solid var(--color-border, #302d3b); border-radius: 12px; background: var(--color-surface, #111118); box-shadow: 0 16px 42px rgb(0 0 0 / 28%); }
  .styled-select__option { display: flex; width: 100%; min-height: 34px; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 9px; border: 0; border-radius: 8px; background: transparent; color: var(--color-text-secondary, #b5b1c2); font: inherit; font-size: 11px; text-align: left; cursor: pointer; }
  .styled-select__option:hover, .styled-select__option--selected { background: color-mix(in srgb, var(--color-accent, #a78bfa) 13%, transparent); color: var(--color-text, #f4f2fa); }
  @media (max-width: 760px) { .styled-select__trigger { width: 100%; } .styled-select__menu { width: 100%; } }
  @media (prefers-reduced-motion: reduce) { .styled-select__trigger { transition: none; } }
</style>
