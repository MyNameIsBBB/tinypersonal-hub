# Agent Orchestration Architecture

## Decision

Chat orchestration is split into small server-only modules under `packages/personal-app/src/app/api/chat`. The route file only exports HTTP handlers from the controller.

```text
route.ts
  -> controller.ts
      -> request-context.ts
      -> confirmation-handler.ts
      -> agent-runner.ts
          -> context-builder.ts
          -> tool-adapter-factory.ts
          -> persistence.ts
          -> response-stream.ts
```

Tool contracts have one source of truth in `packages/assistant-core/src/tools/definitions.ts`. Each contract owns its public name, description, Zod input schema, mutation classification, and backend command. Executable adapters import those contracts and only add execution behavior.

## Tool scoping

`scopeToolsForMessage` performs deterministic, conservative first-pass routing:

- Unknown/general requests receive no tools.
- A recognized domain receives its read tool.
- Mutation tools are added only when create/update/delete language is present.
- Explicit multi-domain requests receive the union of those scoped tools.
- Coding requests receive only Codex delegation; coding status remains a controller fast path.
- Short explicit retry/follow-up messages may inherit the most recent recognized domain; unrelated general replies do not inherit tools.
- Read intents for schedules, notes, Vault metadata, and web data force their scoped read tool in the first model step. Later steps return to automatic selection so the model can summarize the fresh result.

The scope decision is recorded in both `AuditLog` and `AgentRunTrace`. Adding a tool requires updating its contract, scoping policy, and routing eval cases.

Historical tool calls are always converted to bounded inert text before model-message conversion. This preserves a small result summary without replaying stale or malformed function-turn sequences into strict providers such as Gemini.

## Context policy

The context builder emits bounded, typed context items with source, entity, relevance, confidence, update time, and sensitivity. Domain records remain behind scoped read tools instead of being dumped into every prompt. Private display context is redacted from durable traces.

Future memory sources should use the existing source vocabulary (`session`, `recent-conversation`, `schedule`, `notes`, `projects`, `preferences`, `people`, `retrieved-memory`) and must preserve sensitivity metadata.

Explicit memory questions currently retrieve at most three relevant notes. Tags/folders classify them as project, preference, people, or generic retrieved memory. Retrieved content is bounded, labeled as untrusted context, marked private, and redacted from durable traces.

## Agent traces

Each Gemini run creates an `AgentRunTrace` containing:

- owner/session/message identifiers
- selected intent and allowed tools
- redacted context metadata
- model name and run status
- tool name, execution duration, success/error state, and a non-sensitive summary
- bounded final response, total duration, or error

Raw tool arguments, tool output payloads, prompts, passwords, tokens, Vault data, and private display values must not be stored in traces. Traces are exposed through owner-scoped `GET /api/chat/traces` and the authenticated Agent Trace UI at `/traces`.

Provider stream errors are captured at the `streamText` boundary before conversion to UI chunks. Nested SDK error events are unwrapped into a bounded, credential-redacted message so a timeout, rate limit, or transport failure does not degrade into an unhelpful generic trace error.

## Evaluation

The routing suite contains 50 Thai/English prompts and reports intent plus exact tool-selection accuracy. A separate eight-case capability suite records expected tool arguments, confirmation behavior, and execution outcomes. Arguments are validated against the central Zod tool contracts and compared with the expected semantic fields; confirmation defaults to each contract's mutation policy. Live/model runners can provide the same observation shape without changing the scoring framework.

API integration tests run against a fresh temporary SQLite database assembled from every checked-in migration. They exercise authenticated route handlers and real Prisma services for owner isolation, confirmation expiry, concurrent confirmation idempotency, and the three-attempt retry lifecycle of coding and chat-generation jobs.

## Compatibility

The refactor preserves the existing public tool names and API response shapes. Contract renaming into domain-qualified names such as `calendar.listEvents` should be handled as a separate migration with compatibility tests rather than combined with structural refactoring.
