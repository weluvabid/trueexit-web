<script lang="ts">
  let {
    canManage,
    saving,
    onCreate,
  }: {
    canManage: boolean;
    saving: boolean;
    onCreate: () => void;
  } = $props();
</script>

<header class="template-page__header">
  <div>
    <p class="template-eyebrow">REUSABLE FIELD DEFINITIONS</p>
    <h1 id="template-heading">Templates</h1>
    <p class="template-muted">Start monitors with reusable fields. Templates never remain linked to monitors after creation.</p>
  </div>
  {#if canManage}
    <button class="template-button template-button--primary" type="button" onclick={onCreate} disabled={saving}>
      New template <span aria-hidden="true">＋</span>
    </button>
  {/if}
</header>
