// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';
import authkit from '@workos/authkit-astro';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    svelte(),
    // The '/' prefix also matches /login, /callback, and other injected AuthKit routes.
    // Protect the overview in src/pages/index.astro with Astro.locals.auth instead.
    authkit({ errorRedirect: '/login' })
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
