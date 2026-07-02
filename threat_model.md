# Threat Model

## Project Overview

GalaxyBots.ai is a public internet-facing monorepo application deployed on Replit autoscale. The production application is primarily the Express 5 API server in `artifacts/api-server` and the GalaxyBots web frontend in `artifacts/galaxybots`, backed by PostgreSQL/Drizzle and multiple external integrations (OpenAI, billing providers, email/SMS, SSO, webhooks, object storage, partner APIs). The client is untrusted; production security depends on server-side authentication, authorization, tenant isolation, and safe handling of outbound fetch/browser automation.

This threat model assumes `NODE_ENV=production`, TLS is terminated by the platform, and only production-reachable code paths matter. Mockup/dev sandbox artifacts are out of scope unless production reachability is demonstrated.

## Assets

- **User accounts and sessions** — JWT bearer tokens, httpOnly cookies, SSO completion codes, stakeholder portal tokens, SCIM tokens, developer/platform API keys. Compromise enables impersonation or privileged API access.
- **Tenant data** — client records, conversations, bot memories, proposals, ROI reports, approvals, knowledge-base content, compliance records, CRM/extraction data, and prospecting data. Cross-tenant disclosure or tampering is a primary risk.
- **Privileged automation capabilities** — bot tools, outbound webhook delivery, browser automation, OCR/extraction jobs, platform/admin APIs, scheduler jobs, and integration credentials. Abuse can turn the app into an attack pivot.
- **Secrets and external credentials** — database URL, JWT signing secret, credential-encryption key, billing/webhook secrets, SSO secrets, provider tokens. Leakage or misuse can break trust boundaries far beyond a single tenant.
- **Audit and business records** — approvals, billing data, compliance exports, security/guardian incidents, usage logs, and share links. Exposure can leak sensitive business information or enable repudiation.

## Trust Boundaries

- **Browser / API boundary** — all frontend and public client requests enter through `artifacts/api-server/src/app.ts`; every protected route must enforce authentication and authorization server-side.
- **Authenticated tenant / platform-admin boundary** — ordinary users should remain tenant-scoped; explicit RLS bypass and platform keys must stay tightly controlled.
- **Public / authenticated boundary** — selected routes are intentionally unauthenticated via `PUBLIC_SUFFIXES` and `PUBLIC_PREFIX_SUFFIXES` in `artifacts/api-server/src/app.ts`; these routes require special scrutiny because they run on a public deployment.
- **API / database boundary** — PostgreSQL row-level security and AsyncLocalStorage tenant context are relied on to prevent cross-tenant access. Pre-auth and bypass queries are especially sensitive.
- **API / external service boundary** — the server sends requests to OpenAI, partner APIs, SSO endpoints, webhooks, email/SMS providers, object storage, and browser-visited URLs. User-controlled destinations can create SSRF, exfiltration, or credential misuse risk.
- **User / stakeholder / partner / developer / platform identities** — the app supports multiple credential types (JWT, stakeholder tokens, API keys, SCIM, SSO), so confused-deputy and credential-mixup bugs are relevant.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/**`
- **Highest-risk code areas:** public route allowlist in `app.ts`; `middleware/auth.ts`; `middleware/tenant.ts`; `routes/liberator/**`; `routes/auth/**`; `routes/platform/**`; `services/platform/**`; `tools/**`
- **Public surfaces:** billing webhooks, SSO routes, partner/webhook endpoints, shared proposal/ROI routes, developer docs/changelog endpoints, Liberator public routes, stakeholder client-portal auth flow
- **Dev-only / usually ignore:** `artifacts/mockup-sandbox/**`, presentation/user-guide artifacts, local scripts/tests unless they expose production code paths

## Current Scan Notes (2026-07-02)

- Confirmed exploitable credential-boundary failures in the stakeholder client-portal flow, SCIM disable/revocation behavior, and Piratemonster MCP `x-platform-key` handling.
- Confirmed a production-seeded default partner credential on the public Bingolingo partner surface; re-scan any startup seeders and public partner routes whenever partner onboarding changes.
- Confirmed redirect-following SSRF in Liberator and webhook-delivery flows. For future scans, treat any outbound request guarded only by preflight hostname validation as suspicious unless redirects are disabled or the final destination is revalidated.
- Public micro-tools remain a standing anonymous cost-abuse surface because they invoke paid LLM operations behind a public prefix with only coarse IP limiting.
- Areas reviewed and not currently promoted to findings in this scan: pipeline/lead webhook secret validation, developer webhook-test redirect handling, share-token proposal/ROI routes, and core SAML/OIDC state/nonce validation.

## Threat Categories

### Spoofing

The application accepts multiple credential types: user JWTs, cookies, stakeholder portal tokens, developer API keys, platform keys, SCIM bearer tokens, and SSO assertions/codes. Production security requires every protected route to validate the correct credential type, bind it to the intended tenant, and prevent credential confusion between public, stakeholder, developer, partner, and admin flows.

### Tampering

Attackers can submit arbitrary request bodies, query parameters, URLs, webhook payloads, and tool inputs. The system must enforce server-side validation, keep share/public tokens unguessable, and ensure public routes cannot create, modify, delete, or trigger sensitive jobs without explicit authorization.

### Information Disclosure

The main disclosure risk is cross-tenant or public exposure of sensitive tenant data through public endpoints, RLS-bypass queries, share links, logs, exports, and AI/browser extraction features. Public routes must never expose stored tenant data unless possession of a strong secret token is the intended authorization mechanism.

### Denial of Service

The platform exposes expensive operations: LLM calls, browser automation, extraction jobs, webhook fan-out, exports, and search/analytics endpoints. Public or weakly authenticated endpoints must not allow anonymous users to exhaust compute, third-party quotas, or worker capacity.

### Elevation of Privilege

Privilege escalation would occur if a tenant user, stakeholder, developer key holder, or unauthenticated user can reach platform-admin capabilities, bypass tenant scoping, or invoke powerful integrations/tools beyond their allowed scope. All explicit `withBypassRLS` paths, public route exemptions, and machine-to-machine credentials must be narrowly constrained.
