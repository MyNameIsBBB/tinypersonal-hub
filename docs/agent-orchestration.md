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

The scope decision is recorded in both `AuditLog` and `AgentRunTrace`. Adding a tool requires updating its contract, scoping policy, and routing eval cases.

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

Raw tool arguments, tool output payloads, prompts, passwords, tokens, Vault data, and private display values must not be stored in traces. Traces are exposed through owner-scoped `GET /api/chat/traces`.

## Evaluation

The initial eval suite contains 50 Thai/English routing prompts. It reports intent and exact tool-selection accuracy. The framework also supports argument validity, confirmation-policy correctness, and execution success; these remain `null` until observations are supplied by integration or live-model eval runners.

## Compatibility

The refactor preserves the existing public tool names and API response shapes. Contract renaming into domain-qualified names such as `calendar.listEvents` should be handled as a separate migration with compatibility tests rather than combined with structural refactoring.
