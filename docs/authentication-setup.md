# Authentication setup

TrueExit uses WorkOS AuthKit through the official Astro integration. The integration owns the sign-in, sign-up, callback, session validation/refresh, and sign-out routes; the application must not implement a parallel cookie or token format.

## Required local configuration

1. Copy `.env.example` to `.env`.
2. Set `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` from the WorkOS environment you intend to use.
3. Generate `WORKOS_COOKIE_PASSWORD` with `openssl rand -base64 32`. Keep it secret and stable for the environment; do not commit `.env`.
4. Register `http://localhost:4321/callback` as a WorkOS Redirect URI. Configure the appropriate sign-out redirect in WorkOS if the dashboard requires it.
5. Start Astro with `npm run dev`. The local development origin is `http://localhost:4321`.

All WorkOS variables are server-only and intentionally have no `PUBLIC_` prefix. Do not put tokens in browser storage, rendered HTML, URLs, or logs. The SDK seals the session cookie and handles its PKCE-bound callback flow and refresh behavior.

## Route behavior

- `/`, `/monitors`, `/templates`, and `/settings` require a valid AuthKit session. Anonymous HTML navigation is redirected to `/login`.
- `/login` and `/signup` start the hosted AuthKit flow; `/callback` completes it; `/logout` ends the application and WorkOS session. These routes are injected by the SDK.
- The shell displays the authenticated email and a sign-out action. It does not treat the email or any client-provided identifier as authorization.

## Scope and verification boundary

This phase establishes browser authentication and protects the application routes. It does **not** yet implement the same-origin BFF endpoints that forward a session-derived access token to the TrueExit API, nor does it load `/v1/me` or workspaces. Do not add protected API data fetches until that server-side boundary is implemented. The API continues to enforce its own bearer-token and resource authorization checks.

Before production, verify sign-in, callback state/PKCE validation, session refresh and expiry, sign-out, cookie flags, missing/invalid WorkOS configuration, and protected-route behavior against a real WorkOS test environment. Cookie-authenticated state-changing BFF endpoints must later enforce same-origin/Origin checks and a deliberate CSRF strategy.
