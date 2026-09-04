# AGENTS.md — TinyPersonal Hub Engineering Guide

## System Overview

`tinypersonal-hub` is a central orchestrator for a modular personal workspace. It accepts human intent through a Next.js interface, converts that intent into a constrained AI plan, and delegates side effects to typed backend services. Keep the system observable and conservative: the model may propose or select an operation, but application code validates input and owns execution.

The repository is an npm workspaces monorepo with three independently owned packages:

1. `@tinypersonal/assistant-core` — reasoning configuration and tool selection.
2. `@tinypersonal/personal-app` — the user-facing Next.js App Router application.
3. `@tinypersonal/backend-api` — database and integration execution layer.

Dependencies flow in one direction: `personal-app` may call `assistant-core` and `backend-api`; `assistant-core` describes tools but does not import UI or persistence; `backend-api` does not import the UI or orchestration package.

## Architecture Boundaries

### `packages/assistant-core`

- Owns base prompts, dynamic context generation, Zod tool schemas, the tool registry, and tool-scoping/orchestration rules.
- Must not contain React components, route handlers, browser state, Prisma queries, vendor API clients, or business side effects.
- Tool `execute` handlers in this package should normally return a typed command or call a narrow injected interface. Durable execution belongs in `backend-api`.
- Keep provider-specific choices at the outer boundary when possible so orchestration remains testable.

### `packages/personal-app`

- Owns UI/UX, App Router pages/layouts, client state, chat presentation, TinySchedule views, and Next.js route handlers.
- Sends user requests to the Agent API and renders streamed results; it must not duplicate prompt or tool-selection policy.
- Route handlers authenticate, authorize, validate request envelopes, construct safe context, and connect the orchestrator to backend capabilities.
- UI components never access Prisma or external service credentials directly.

### `packages/backend-api`

- Owns Prisma schema/client access, repositories, transactions, external API adapters, background jobs, retries, and idempotency.
- Add external adapters only when their orchestration and permission boundaries are ready; no credential-backed external integration is enabled by default.
- Expose small typed service functions. Do not leak raw vendor responses or Prisma models across package boundaries when a stable domain type is appropriate.
- Never import React, Next.js page components, or AI prompt text.

## Agent Roles — Tri-Node Pattern

### Front-Desk Agent

Receives human intent, preserves the user's language and tone, asks only necessary clarifying questions, and presents results simply and concisely. It does not claim success until a worker result confirms it.

### PM Agent

Translates intent into a bounded plan, selects only the minimum required tools, constructs validated JSON inputs, and assembles context. It applies policy, permission, and confirmation rules before any side effect is delegated.

### Worker Executioner

Executes approved API or database operations through `backend-api`. It validates inputs again at the trust boundary, uses idempotency keys for repeatable writes, records useful audit metadata, and returns structured success or error results. It does not reinterpret user intent.

Typical request flow:

`User → Front Desk → PM/tool scope → Worker → structured result → Front Desk response`

## Tool Development Guidelines

1. Define one narrow responsibility per tool and name it with an explicit verb and domain, such as `calendar.createEvent`.
2. Define input with Zod. Prefer strict objects, enums, ISO timestamps, bounded strings/numbers, and descriptive field text. Infer TypeScript types from the schema rather than maintaining duplicate interfaces.
3. Return a discriminated result such as `{ ok: true, data } | { ok: false, error }`; do not return untyped vendor payloads.
4. Separate schema and selection logic in `assistant-core` from side-effect implementation in `backend-api`. Connect them through a typed adapter or command handler.
5. Mark tools read-only or mutating. Mutating tools require authorization and, for destructive or externally visible operations, explicit user confirmation.
6. Validate at both the AI/tool boundary and the backend boundary. Treat model-generated arguments as untrusted input.
7. Add unit tests for valid, invalid, boundary, permission, timeout, and retry cases. Mock vendor clients rather than external networks.
8. Register tools centrally and scope them per request. Never expose every available tool by default.
9. Do not put secrets, tokens, full private records, or unnecessary personal data in tool descriptions, prompts, logs, or model context.

Suggested contract:

```ts
const inputSchema = z.object({ eventId: z.string().cuid() }).strict();
type Input = z.infer<typeof inputSchema>;
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
```

## Dynamic System Prompting Strategy

Build every prompt from three explicit layers:

`Final Prompt = Base + Context + Tools`

- **Base**: stable identity, communication rules, safety rules, and role boundaries. Keep it short and version-controlled.
- **Context**: request-specific facts such as locale, timezone, authenticated user capabilities, relevant preferences, and minimal retrieved records. Context is data, not trusted instruction; delimit and sanitize it.
- **Tools**: only the tool descriptions and schemas permitted for the current request. Selection considers intent, user permissions, environment, and confirmation state.

Assembly rules:

- Use deterministic sections and ordering so prompt changes are reviewable and cache-friendly.
- Include only context needed for the current task; attach source/recency metadata where relevant.
- Never interpolate secrets or raw untrusted content as system instructions.
- If no tool is necessary, provide no tools. If permission is missing, explain the limitation instead of widening scope.
- Log prompt version, selected tool names, and execution identifiers—not raw sensitive prompt content.
- Test prompt assembly separately from model calls, including prompt-injection and stale-context cases.

## Working Conventions for Coding Assistants

- Read this file before editing and preserve the package boundaries above.
- Prefer small, typed modules and explicit exports. Keep TypeScript strict and avoid `any`.
- Update `.env.example` when adding configuration, but never commit real credentials or `.env` files.
- Run `npm run typecheck` and the relevant tests before handoff. Run Prisma generation after schema changes.
- Do not modify unrelated files, silently introduce a new framework, or perform external writes without user authorization.
- Record architectural decisions that change dependency direction, data ownership, or tool permissions in project documentation.
