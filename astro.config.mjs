import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import authkit from '@workos/authkit-astro';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    svelte(),
    authkit({
      errorRedirect: '/login',
      protectedRoutes: ['/monitors(.*)', '/templates(.*)', '/settings(.*)'],
    })
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
