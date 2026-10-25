<svelte:options runes={true} />
<script lang="ts">
  import * as Select from '@/components/ui/select/index.js';

  let { appearancePreference, onAppearanceChange }: {
    appearancePreference: string;
    onAppearanceChange: (preference: string) => void;
  } = $props();
</script>

<section class="settings-card">
  <div class="settings-card__heading"><div><p class="settings-kicker">PREFERENCES</p><h2>Make TrueExit feel right.</h2><p>Choose how the interface appears on this device. Your preference is stored locally and does not change workspace data.</p></div><span class="settings-card__symbol">◐</span></div>
  <div class="settings-field settings-preference-field">
    <span>Appearance</span>
    <Select.Root type="single" value={appearancePreference} onValueChange={onAppearanceChange}>
      <Select.Trigger aria-label="Appearance preference" class="w-full max-w-sm">
        <Select.Value placeholder="Use system setting" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="system" label="Use system setting">Use system setting</Select.Item>
        <Select.Item value="light" label="Light">Light</Select.Item>
        <Select.Item value="dark" label="Dark">Dark</Select.Item>
      </Select.Content>
    </Select.Root>
    <small>Applies immediately, including the application shell.</small>
  </div>
  <div class="settings-security-note"><strong>Timezone preference outstanding</strong><p>Timezone selection will be added here. Preference persistence and consistent timestamp display are tracked for the backend completion pass.</p></div>
</section>
