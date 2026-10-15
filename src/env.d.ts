/// <reference types="astro/client" />

interface CloudflareRuntimeEnvironment {
  TRUEEXIT_API_BASE_URL?: string;
}

declare module 'cloudflare:workers' {
  export const env: CloudflareRuntimeEnvironment;
}
