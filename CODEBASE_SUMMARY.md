# TinyPersonal Hub — Codebase Summary

> สรุปจากการตรวจโค้ด ณ วันที่ 5 กันยายน 2026

## ภาพรวม

TinyPersonal Hub คือ personal workspace แบบ self-hosted ที่รวม AI chat, ตารางเวลา, notes, encrypted vault, web search, push notifications และการส่งงานเขียนโค้ดให้ Codex ไว้ในเว็บแอปเดียว ระบบออกแบบให้ AI เป็นผู้ตีความและเสนอคำสั่ง ส่วน application code เป็นผู้ตรวจ input, ขอการยืนยัน และทำ side effect จริง

โปรเจกต์เป็น TypeScript monorepo ใช้ npm workspaces และแบ่งเป็น 3 packages:

| Package                        | หน้าที่หลัก                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `@tinypersonal/assistant-core` | system prompt, Zod contracts, tool metadata/registry และ agent configuration            |
| `@tinypersonal/personal-app`   | Next.js UI, API routes, auth, chat streaming และการเชื่อม orchestration เข้ากับ backend |
| `@tinypersonal/backend-api`    | Prisma/SQLite, domain services, encryption, jobs, audit และ external integrations       |

Dependency flow ที่ตั้งใจไว้คือ:

```text
personal-app ──> assistant-core
      │
      └────────> backend-api
```

## Tech stack

- Node.js 22+, npm 11 และ TypeScript แบบ strict
- Next.js 16 App Router, React 19 และ Tailwind CSS 3
- Vercel AI SDK 7 และ Google Gemini (`gemini-3.5-flash-lite` เป็นค่าเริ่มต้น)
- Prisma 6 กับ SQLite
- Zod สำหรับ request และ tool schema validation
- Vitest สำหรับ unit tests
- Web Push สำหรับ browser notifications
- SearXNG สำหรับ self-hosted web search
- Docker/Docker Compose, PM2, cron/systemd และ Tailscale Funnel สำหรับ runtime/operations

## โครงสร้างสำคัญ

```text
tinypersonal-hub/
├── packages/
│   ├── assistant-core/
│   │   └── src/
│   │       ├── prompts/       # base prompt + dynamic context
│   │       ├── tools/         # tool definitions/registry
│   │       ├── contracts.ts   # shared Zod schemas
│   │       └── orchestrator.ts
│   ├── backend-api/
│   │   ├── prisma/            # SQLite schema + migrations
│   │   └── src/
│   │       ├── db/            # Prisma client
│   │       ├── security/      # vault encryption
│   │       └── services/      # domain services, jobs, audit, integrations
│   └── personal-app/
│       ├── public/            # PWA assets/service worker
│       └── src/
│           ├── app/           # pages + route handlers
│           ├── components/    # chat/workspace/schedule UI
│           └── lib/           # auth, rate limit, validation, chat helpers
├── scripts/                   # workers, notifications, briefing, backup, ops
├── config/searxng/            # search configuration
├── docker-compose.yml
├── Dockerfile
└── RUNNING.md                 # คู่มือรันและ deploy
```

## ฟีเจอร์หลัก

### AI workspace

- หน้า `/`, `/ai` และ `/os` ใช้ `AIExperience` เป็น UI หลัก
- เก็บ chat sessions/messages ลง SQLite และรองรับ custom system prompt ราย session
- จำกัด model context ไว้ที่ 16 ข้อความและประมาณ 24,000 ตัวอักษร พร้อมย่อ historical tool output และตัดภาพเก่าออก
- รองรับ streaming response, voice-mode formatting และ browser vision context แบบ metadata (URL/title)
- request จากหน้าเว็บถูก enqueue เป็น `ChatGenerationJob`; worker ภายในจึงค่อยเรียก Gemini เพื่อให้ request ไม่ต้องผูกกับ connection เดิม
- มี general chat ประจำวันและ morning briefing ตาม timezone `Asia/Bangkok`

### Schedule

- รองรับ `EVENT`, `TASK`, `ROUTINE`
- สถานะ `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- priority ตั้งแต่ `LOW` ถึง `URGENT`
- recurring routine แบบ daily/weekly/monthly/yearly และขยาย occurrence ตามช่วงเวลา
- มี calendar UI, routine form, REST endpoints และ scheduled push notifications

### Notes

- CRUD notes พร้อม tags, folder และการเชื่อมกับ schedule item
- มี `searchText` และ optional embedding ในฐานข้อมูล
- รองรับ semantic-like tool retrieval ผ่าน deterministic vector service

### Vault

- เก็บ password และ TOTP seed แบบเข้ารหัส authenticated encryption
- การค้นหาจาก AI คืนเฉพาะ metadata ไม่ส่ง secret/ciphertext ให้ model
- การ reveal secret ต้องใช้ step-up password แยกต่างหาก
- pending action ที่มี secret ถูก seal ก่อนบันทึกลงฐานข้อมูล

### Web และ integrations

- ค้นเว็บผ่าน SearXNG และ scrape หน้า public HTTP/HTTPS
- web scraper มี private-network protection เพื่อลดความเสี่ยง SSRF

### Codex delegation

- AI สามารถเสนอส่งงาน repository/build/test/deploy ให้ host-side Codex worker
- งานถูกเก็บใน `CodingJob`, มี queue, lease, progress log, retry สูงสุด 3 ครั้ง และผลลัพธ์กลับเข้า chat
- repository และ credentials ของ Codex อยู่ฝั่ง host ไม่ถูก mount เข้า app container โดยตรง; container สื่อสารผ่าน Unix socket

## Request flow ของ AI

```text
ผู้ใช้ส่งข้อความ
  -> Next.js ตรวจ session และ rate limit
  -> บันทึกข้อความ + enqueue ChatGenerationJob
  -> chat worker claim งาน
  -> สร้าง Base + Context + Tools prompt
  -> Gemini ตอบโดยตรงหรือเรียก tool
  -> read-only tool ทำงานและคืนผลได้ทันที
  -> mutating tool สร้าง PendingAction อายุ 15 นาที
  -> ผู้ใช้พิมพ์ “ยืนยัน” หรือ “ยกเลิก”
  -> backend execute/deny action และเขียน AuditLog
  -> บันทึก assistant response กลับเข้า session
```

## Security และ safety controls

- Production auth ใช้ signed session cookie; API token ใช้กับ internal/automation endpoints
- password comparison ใช้ timing-safe comparison
- request bodies และ tool inputs ตรวจด้วย strict Zod schemas
- chat จำกัด 30 requests ต่อนาทีต่อ owner (in-memory rate limiter)
- side effects จาก AI เช่นแก้ schedule/note/vault และ delegate coding ต้องผ่าน confirmation
- audit metadata กรอง key ที่สื่อถึง password, secret, token, OTP, ciphertext และ authorization
- Vault ใช้ master key จาก environment; ถ้ากุญแจหายจะถอดข้อมูลเดิมไม่ได้
- PWA รองรับ offline page และ push subscription

## Database models

| กลุ่ม                | Models                                                   |
| -------------------- | -------------------------------------------------------- |
| Identity/legacy task | `User`, `Task`                                           |
| Workspace            | `ScheduleItem`, `Note`, `VaultSecret`                    |
| Chat                 | `ChatSession`, `ChatMessage`                             |
| Controlled execution | `PendingAction`, `AuditLog`                              |
| Background jobs      | `ChatGenerationJob`, `CodingJob`                         |
| Notifications/search | `NotificationDelivery`, `PushSubscription`, `ToolVector` |

SQLite เหมาะกับ personal/single-node deployment ตามรูปแบบปัจจุบัน แต่ queue claiming และ in-memory rate limiting ไม่ได้ออกแบบมาสำหรับ horizontal scale หลาย instance

## API surface

- `/api/auth/session` — login/logout/session
- `/api/chat`, `/api/chat/sessions`, `/api/chat/messages` — chat lifecycle
- `/api/confirm/[id]` — approve/deny pending action
- `/api/schedule`, `/api/schedule/[id]` — schedule CRUD
- `/api/notes`, `/api/notes/[id]` — notes CRUD
- `/api/vault`, `/api/vault/[id]`, `/api/vault/[id]/reveal` — vault CRUD/reveal
- `/api/notifications/push` — push subscription
- `/api/jobs/chat`, `/api/jobs/coding` — background workers
- `/api/jobs/morning-briefing`, `/api/jobs/schedule-notifications` — scheduled automation
- `/api/integrations`, `/api/health`, `/api/version` — operational endpoints

## การรันและตรวจสอบ

```bash
npm ci
cp .env.example .env
cp .env packages/backend-api/.env
cp .env packages/personal-app/.env.local
npm run db:generate
npm run dev
```

คำสั่งหลัก:

```bash
npm run typecheck
npm test
npm run build
npm run docker:up
npm run search:up
npm run briefing:run
```

รายละเอียด production, Docker, PM2, Tailscale Funnel, backup/restore และ systemd อยู่ใน `RUNNING.md`

## Test coverage ที่มีอยู่

มี unit tests สำหรับ:

- shared contracts และ Codex task schema
- schedule recurrence/operations
- vault cryptography
- audit/confirmation execution
- Codex/Jarvis safety classification
- server authentication
- chat context window, message merge และ confirmation parsing

ยังไม่พบ integration/E2E tests สำหรับ API routes, Prisma migrations, browser UI, background-worker lifecycle หรือ external integrations

ผลตรวจ ณ วันที่จัดทำเอกสาร:

- `npm test` ผ่านทั้งหมด: 13 test files, 56 tests
- `npm run typecheck` ผ่านครบทั้ง 3 workspaces หลัง regenerate Next route types

## ข้อสังเกตทางสถาปัตยกรรม

1. **ภาพรวมตรงกับ Tri-Node pattern ค่อนข้างดี** — prompt/tool selection, UI/API และ durable execution แยก package กัน และ mutation มี confirmation + audit
2. **Chat route ถูกแยกแล้ว** — `route.ts` เหลือเฉพาะ HTTP exports ส่วน controller, request context, agent runner, adapters, confirmation, persistence และ response stream แยกเป็นโมดูล server-only
3. **Tool contract มี source of truth เดียวแล้ว** — ชื่อ, description, mutation flag, backend command และ Zod input schema อยู่ใน `assistant-core/src/tools/definitions.ts`; executable adapters import schema ชุดเดียวกัน
4. **มี deterministic tool scoping แล้ว** — general request ได้ zero tools และแต่ละ domain เปิดเฉพาะ read/mutation tools ที่สัมพันธ์กับ intent พร้อม baseline eval 50 prompts
5. **Credential-backed external integration ถูกปิดไว้ก่อน** — Google Calendar, Gmail และ finance API key ถูกถอดออกจาก config แล้ว; self-hosted web search ยังเป็น capability ภายในที่เปิดแยกได้
6. **ข้อมูลบาง field ยังเก็บเป็น JSON string** — recurrence, tags, embeddings, message payload และ job result ยืดหยุ่นดีสำหรับ SQLite แต่เสีย database-level validation และ queryability
7. **มี model ที่ดูเป็น legacy** — `User`/`Task` แยกจาก owner-key-based workspace และ `ScheduleItem`; ควรยืนยันการใช้งานก่อนเพิ่ม feature ใหม่หรือวางแผน migration cleanup
8. **rate limit เป็น process-local** — ใช้ได้กับ single instance แต่ไม่สม่ำเสมอเมื่อ scale หลาย process/container

## ลำดับปรับปรุงที่แนะนำ

1. เพิ่ม API integration tests ครอบคลุม auth, owner isolation, confirmation expiry/idempotency และ job retry
2. ขยาย eval จาก deterministic routing ไปสู่ argument validity, confirmation policy และ execution success กับ live/model fixtures
3. เพิ่ม integration/E2E coverage ให้หน้า Agent Trace ที่ `/traces` รวมถึง filter, empty state และสถานะ run ที่กำลังทำงาน
4. เพิ่ม permission-aware tool scoping นอกเหนือจาก intent-based scoping ปัจจุบัน
5. เพิ่ม E2E smoke test สำหรับ chat, schedule, notes และ vault reveal
6. เพิ่ม external integration ใหม่เมื่อ core orchestration, permission model และ integration tests พร้อม
7. ทบทวน legacy `User`/`Task` models และจัดทำ migration plan หากไม่ได้ใช้แล้ว

## จุดเริ่มอ่านโค้ด

- `AGENTS.md` — architecture rules และ package boundaries
- `packages/assistant-core/src/prompts/base.ts` — persona, routing และ tool policy
- `packages/assistant-core/src/orchestrator.ts` — prompt/tool assembly
- `packages/personal-app/src/app/api/chat/route.ts` — end-to-end chat orchestration
- `packages/backend-api/src/services/auditService.ts` — confirmation และ side-effect dispatch
- `packages/backend-api/prisma/schema.prisma` — durable data model
- `packages/personal-app/src/components/AIExperience.tsx` — main client experience
- `RUNNING.md` — setup, deployment และ operations
