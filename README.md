# TrueExit Web

The web frontend for TrueExit.

TrueExit Web is a Progressive Web App (PWA) built with Astro, Svelte 5, and TypeScript. It provides the web interface for the TrueExit platform.

## Technology Stack

| Technology      | Purpose                                           |
| --------------- | ------------------------------------------------- |
| Astro           | Application framework and server-rendered routes  |
| Svelte 5        | Interactive UI components                         |
| TypeScript      | Static type checking                              |
| Tailwind CSS v4 | Styling                                           |
| shadcn-svelte   | UI component foundation                           |
| Lucide          | Icons                                             |
| WorkOS AuthKit  | Sign-in, secure session cookie, and token refresh |
| Cloudflare      | Server runtime and hosting adapter                |
| Vitest          | Testing                                           |
| ESLint          | Linting                                           |
| Prettier        | Code formatting                                   |

## Prerequisites

- **Node.js:** 22.12.0 or newer
- **npm:** Included with Node.js

## Getting Started

```bash
git clone https://github.com/weluvabid/trueexit-web.git
cd trueexit-web
npm install
cp .env.example .env
```

Set the WorkOS values in `.env`. In the WorkOS dashboard, register `http://localhost:4321/callback` as a redirect URI. Generate `WORKOS_COOKIE_PASSWORD` with `openssl rand -base64 32`. Keep the API key and cookie password server-side; never commit `.env`.

Set `TRUEEXIT_API_BASE_URL` to the base URL of the TrueExit API Worker. For local development this can be `http://127.0.0.1:3000` when the API is running locally. The web app calls only the documented `/v1/me` and `/v1/workspaces` endpoints in this slice.

Run the app and checks:

```bash
npm run dev
npm run check
npm test
npm run build
```

The app uses WorkOS AuthKit's server-side session handling. Access tokens are not written to browser storage or serialized into client UI. Workspace membership is read from the TrueExit API; WorkOS identity alone does not grant workspace access.
