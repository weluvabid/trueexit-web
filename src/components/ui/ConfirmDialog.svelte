<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let title: string;
  export let description: string;
  export let confirmLabel = 'Confirm';
  export let cancelLabel = 'Cancel';
  export let tone: 'danger' | 'primary' = 'primary';
  export let busy = false;

  const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();
  let cancelButton: HTMLButtonElement;
  let confirmButton: HTMLButtonElement;
  let overlay: HTMLDivElement;
  let previousFocus: HTMLElement | null = null;

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButton?.focus();
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = priorOverflow;
      previousFocus?.focus();
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      dispatch('cancel');
      return;
    }
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === cancelButton) {
      event.preventDefault();
      confirmButton?.focus();
    } else if (!event.shiftKey && document.activeElement === confirmButton) {
      event.preventDefault();
      cancelButton?.focus();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="confirm-dialog__backdrop" bind:this={overlay} on:click={(event) => { if (event.target === overlay && !busy) dispatch('cancel'); }} role="presentation">
  <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
    <div class="confirm-dialog__mark" class:confirm-dialog__mark--danger={tone === 'danger'} aria-hidden="true">
      {#if tone === 'danger'}
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5m0 3h.01M10.3 3.9 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5 9.2 17 19 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {/if}
    </div>
    <h2 id="confirm-dialog-title">{title}</h2>
    <p id="confirm-dialog-description">{description}</p>
    <div class="confirm-dialog__actions">
      <button bind:this={cancelButton} class="confirm-dialog__button confirm-dialog__button--quiet" type="button" disabled={busy} on:click={() => dispatch('cancel')}>{cancelLabel}</button>
      <button bind:this={confirmButton} class="confirm-dialog__button" class:confirm-dialog__button--danger={tone === 'danger'} class:confirm-dialog__button--primary={tone === 'primary'} type="button" disabled={busy} on:click={() => dispatch('confirm')}>{busy ? 'Working…' : confirmLabel}</button>
    </div>
  </section>
</div>

<style>
  .confirm-dialog__backdrop { position:fixed; z-index:200; inset:0; display:grid; place-items:center; padding:20px; background:rgb(17 16 27 / 42%); backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); }
  .confirm-dialog { width:min(100%, 440px); padding:27px; border:1px solid var(--color-border, #e4e2eb); border-radius:22px; background:var(--color-surface, #fff); color:var(--color-text, #17171f); box-shadow:0 28px 90px rgb(12 10 30 / 24%); animation:confirm-dialog-enter 160ms ease-out; }
  .confirm-dialog__mark { display:grid; width:42px; height:42px; place-items:center; margin-bottom:20px; border:1px solid color-mix(in srgb, var(--color-accent, #7051d8) 24%, var(--color-border, #e4e2eb)); border-radius:13px; background:color-mix(in srgb, var(--color-accent, #7051d8) 10%, var(--color-surface, #fff)); color:var(--color-accent, #7051d8); }
  .confirm-dialog__mark svg { width:21px; height:21px; }
  .confirm-dialog__mark--danger { border-color:color-mix(in srgb, var(--color-error, #c43f4b) 25%, var(--color-border, #e4e2eb)); background:color-mix(in srgb, var(--color-error, #c43f4b) 9%, var(--color-surface, #fff)); color:var(--color-error, #c43f4b); }
  .confirm-dialog h2 { margin:0 0 10px; font-size:21px; line-height:1.2; letter-spacing:-.04em; font-weight:700; }
  .confirm-dialog p { margin:0; color:var(--color-text-secondary, #626171); font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
  .confirm-dialog__actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:9px; margin-top:27px; }
  .confirm-dialog__button { display:inline-flex; min-height:43px; align-items:center; justify-content:center; padding:0 15px; border:1px solid transparent; border-radius:11px; font-size:12px; font-weight:700; cursor:pointer; }
  .confirm-dialog__button:disabled { cursor:wait; opacity:.6; }
  .confirm-dialog__button--quiet { border-color:var(--color-border, #e4e2eb); background:var(--color-surface, #fff); color:var(--color-text-secondary, #626171); }
  .confirm-dialog__button--primary { background:var(--color-accent, #7051d8); color:white; }
  .confirm-dialog__button--danger { background:var(--color-error, #c43f4b); color:white; }
  @keyframes confirm-dialog-enter { from { opacity:0; transform:translateY(5px) scale(.99); } to { opacity:1; transform:translateY(0) scale(1); } }
  @media (max-width:480px) { .confirm-dialog { padding:22px; border-radius:18px; } .confirm-dialog__actions { display:grid; grid-template-columns:1fr 1fr; } }
  @media (prefers-reduced-motion:reduce) { .confirm-dialog { animation:none; } }
</style>
