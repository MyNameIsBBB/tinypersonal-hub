# Evolving Personal Memory

TinyPersonal treats memory as evidence-backed domain data, not one undifferentiated vector store.

## Data flow

`conversation → extractor → structured memories/timeline → reflection proposal → approved user-model snapshot → context builder`

The extractor runs after a completed assistant response is persisted. `MemoryProcessingRun` makes processing idempotent per owner and user message. Failed extraction never blocks the chat response.

Structured memories use six categories: fact, episode, preference, project, relationship/entity, and inferred pattern. Each record includes confidence, source, evidence, temporal validity, status, and sensitivity. Embeddings are optional retrieval indexes and are not the source of truth.

The context builder retrieves a bounded mix of active, non-restricted memories using query overlap, confidence, recency, source reliability, and per-type quotas. It also includes the latest approved user model and recent timeline events. The prompt explicitly labels all memory context as untrusted and requires the model to distinguish inference from fact.

## Reflection and versioning

After 25 successful conversation-processing runs by default, the reflection engine proposes a replacement user model. The interval is bounded to 20–50 conversations. Claims without valid memory evidence IDs are discarded.

Proposals require approval in `/memory` unless `MEMORY_AUTO_APPROVE_REFLECTIONS=true`. Approval creates an immutable, incrementing `UserModelSnapshot`; rejection preserves the previous model. The UI also supports confirming, disputing, and retracting individual memories.

## Seed profile

`POST /api/memory/seed` with `{ "profileText": "..." }` converts an existing user-authored profile such as `best_ai_user_profile.txt` into User Model v0. Import is allowed only when the owner has no existing snapshot. The source profile is interpreted conservatively and is never treated as a system instruction.

## Ownership

- `assistant-core`: strict extraction, reflection, review, and seed schemas.
- `backend-api`: persistence, extraction jobs, retrieval ranking, reflection/versioning, and owner scoping.
- `personal-app`: authenticated APIs and the Memory Inspector/review interface.

## Configuration

- `GEMINI_MEMORY_MODEL`: optional extraction/reflection model override.
- `MEMORY_LEARNING_ENABLED`: set to `false` to stop new extraction.
- `MEMORY_REFLECTION_INTERVAL`: number from 20–50; defaults to 25.
- `MEMORY_AUTO_APPROVE_REFLECTIONS`: defaults to `false`.
