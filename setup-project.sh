#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

chmod +x "$SCRIPT_DIR/setup-project.sh"

mkdir -p \
  "$PROJECT_ROOT/packages/assistant-core/src/prompts" \
  "$PROJECT_ROOT/packages/assistant-core/src/tools" \
  "$PROJECT_ROOT/packages/personal-app/src/app/api/chat" \
  "$PROJECT_ROOT/packages/personal-app/src/components" \
  "$PROJECT_ROOT/packages/backend-api/src/services" \
  "$PROJECT_ROOT/packages/backend-api/src/db" \
  "$PROJECT_ROOT/packages/backend-api/prisma"

cat > "$PROJECT_ROOT/package.json" <<'EOF'
{
  "name": "tinypersonal-hub",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "dev": "pnpm --filter @tinypersonal/personal-app dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "db:generate": "pnpm --filter @tinypersonal/backend-api db:generate",
    "db:migrate": "pnpm --filter @tinypersonal/backend-api db:migrate"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "@prisma/client",
      "@prisma/engines",
      "prisma",
      "sharp"
    ]
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
EOF

cat > "$PROJECT_ROOT/pnpm-workspace.yaml" <<'EOF'
packages:
  - "packages/*"
EOF

cat > "$PROJECT_ROOT/.gitignore" <<'EOF'
node_modules/
.pnpm-store/
.next/
dist/
.env
.env.local
*.log
*.tsbuildinfo
.DS_Store
packages/backend-api/prisma/dev.db*
EOF

cat > "$PROJECT_ROOT/.env.example" <<'EOF'
# AI provider
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

# Database (SQLite is convenient for local development)
DATABASE_URL="file:./dev.db"

# Optional external integrations
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GMAIL_FROM_ADDRESS=
FINANCE_API_KEY=
EOF

cat > "$PROJECT_ROOT/tsconfig.base.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
EOF

cat > "$PROJECT_ROOT/packages/assistant-core/package.json" <<'EOF'
{
  "name": "@tinypersonal/assistant-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ai": "^5.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
EOF

cat > "$PROJECT_ROOT/packages/assistant-core/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
EOF

cat > "$PROJECT_ROOT/packages/assistant-core/src/prompts/base.ts" <<'EOF'
export const BASE_SYSTEM_PROMPT = `You are TinyPersonal Hub, a concise personal assistant.
Clarify ambiguous intent, use only the tools supplied for this request, and never invent tool results.`;

export type PromptContext = {
  locale?: string;
  timezone?: string;
  userName?: string;
};

export function buildContextPrompt(context: PromptContext): string {
  return [
    context.userName && `User: ${context.userName}`,
    context.locale && `Locale: ${context.locale}`,
    context.timezone && `Timezone: ${context.timezone}`,
  ].filter(Boolean).join("\n");
}
EOF

cat > "$PROJECT_ROOT/packages/assistant-core/src/tools/schedule.ts" <<'EOF'
import { tool } from "ai";
import { z } from "zod";

export const scheduleTool = tool({
  description: "Create a calendar item after the user has supplied a title and start time.",
  inputSchema: z.object({
    title: z.string().min(1),
    startsAt: z.string().datetime(),
    durationMinutes: z.number().int().positive().default(30),
  }),
  execute: async (input) => ({
    status: "queued" as const,
    operation: "create-calendar-item" as const,
    input,
  }),
});
EOF

cat > "$PROJECT_ROOT/packages/assistant-core/src/tools/index.ts" <<'EOF'
import { scheduleTool } from "./schedule";

export const toolRegistry = {
  schedule: scheduleTool,
};

export type ToolName = keyof typeof toolRegistry;

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(
    allowed.map((name) => [name, toolRegistry[name]]),
  ) as Partial<typeof toolRegistry>;
}
EOF

cat > "$PROJECT_ROOT/packages/assistant-core/src/orchestrator.ts" <<'EOF'
import { BASE_SYSTEM_PROMPT, buildContextPrompt, type PromptContext } from "./prompts/base";
import { selectTools, type ToolName } from "./tools";

export function createAgentConfig(context: PromptContext, allowedTools: ToolName[]) {
  const contextPrompt = buildContextPrompt(context);

  return {
    system: [BASE_SYSTEM_PROMPT, contextPrompt].filter(Boolean).join("\n\n"),
    tools: selectTools(allowedTools),
  };
}
EOF

cat > "$PROJECT_ROOT/packages/assistant-core/src/index.ts" <<'EOF'
export { createAgentConfig } from "./orchestrator";
export type { PromptContext } from "./prompts/base";
export type { ToolName } from "./tools";
EOF

cat > "$PROJECT_ROOT/packages/backend-api/package.json" <<'EOF'
{
  "name": "@tinypersonal/backend-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@prisma/client": "^6.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "prisma": "^6.2.0",
    "typescript": "^5.7.0"
  }
}
EOF

cat > "$PROJECT_ROOT/packages/backend-api/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
EOF

cat > "$PROJECT_ROOT/packages/backend-api/src/db/client.ts" <<'EOF'
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
EOF

cat > "$PROJECT_ROOT/packages/backend-api/src/services/integrations.ts" <<'EOF'
export type IntegrationName = "google-calendar" | "gmail" | "finance";

export async function integrationHealth(name: IntegrationName) {
  return { name, configured: false, checkedAt: new Date().toISOString() };
}
EOF

cat > "$PROJECT_ROOT/packages/backend-api/src/index.ts" <<'EOF'
export { prisma } from "./db/client";
export { integrationHealth } from "./services/integrations";
export type { IntegrationName } from "./services/integrations";
EOF

cat > "$PROJECT_ROOT/packages/backend-api/prisma/schema.prisma" <<'EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tasks     Task[]
}

model Task {
  id          String    @id @default(cuid())
  title       String
  startsAt    DateTime?
  completedAt DateTime?
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
EOF

cat > "$PROJECT_ROOT/packages/personal-app/package.json" <<'EOF'
{
  "name": "@tinypersonal/personal-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-sdk/openai": "^2.0.0",
    "@tinypersonal/assistant-core": "workspace:*",
    "@tinypersonal/backend-api": "workspace:*",
    "ai": "^5.0.0",
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0"
  }
}
EOF

cat > "$PROJECT_ROOT/packages/personal-app/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
EOF

cat > "$PROJECT_ROOT/packages/personal-app/next-env.d.ts" <<'EOF'
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is generated and maintained by Next.js.
EOF

cat > "$PROJECT_ROOT/packages/personal-app/next.config.ts" <<'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tinypersonal/assistant-core", "@tinypersonal/backend-api"],
};

export default nextConfig;
EOF

cat > "$PROJECT_ROOT/packages/personal-app/postcss.config.mjs" <<'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
EOF

cat > "$PROJECT_ROOT/packages/personal-app/tailwind.config.ts" <<'EOF'
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
EOF

cat > "$PROJECT_ROOT/packages/personal-app/src/app/globals.css" <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }
body { @apply min-h-screen bg-slate-950 text-slate-100 antialiased; }
EOF

cat > "$PROJECT_ROOT/packages/personal-app/src/app/layout.tsx" <<'EOF'
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TinyPersonal Hub",
  description: "A modular personal assistant workspace",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
EOF

cat > "$PROJECT_ROOT/packages/personal-app/src/components/dashboard-card.tsx" <<'EOF'
import type { ReactNode } from "react";

export function DashboardCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-3 font-semibold text-cyan-300">{title}</h2>
      <div className="text-sm text-slate-300">{children}</div>
    </section>
  );
}
EOF

cat > "$PROJECT_ROOT/packages/personal-app/src/app/page.tsx" <<'EOF'
import { DashboardCard } from "@/components/dashboard-card";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">Central Orchestrator</p>
      <h1 className="mt-2 text-4xl font-bold">TinyPersonal Hub</h1>
      <p className="mt-3 max-w-2xl text-slate-400">ผู้ช่วยส่วนตัวแบบ modular สำหรับแชต ตารางเวลา และบริการที่เชื่อมต่อ</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <DashboardCard title="Assistant">AI orchestration พร้อม tool scoping</DashboardCard>
        <DashboardCard title="TinySchedule">พื้นที่สำหรับงานและนัดหมาย</DashboardCard>
        <DashboardCard title="Integrations">เชื่อม Calendar, Gmail และ Finance APIs</DashboardCard>
      </div>
    </main>
  );
}
EOF

cat > "$PROJECT_ROOT/packages/personal-app/src/app/api/chat/route.ts" <<'EOF'
import { openai } from "@ai-sdk/openai";
import { createAgentConfig } from "@tinypersonal/assistant-core";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 30;

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();
  const agent = createAgentConfig(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    ["schedule"],
  );

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4.1-mini"),
    system: agent.system,
    messages: convertToModelMessages(messages),
    tools: agent.tools,
  });

  return result.toUIMessageStreamResponse();
}
EOF

cat > "$PROJECT_ROOT/AGENTS.md" <<'EOF'
# AGENTS.md — TinyPersonal Hub Engineering Guide

## System Overview

`tinypersonal-hub` is a central orchestrator for a modular personal workspace. It accepts human intent through a Next.js interface, converts that intent into a constrained AI plan, and delegates side effects to typed backend services. Keep the system observable and conservative: the model may propose or select an operation, but application code validates input and owns execution.

The repository is a pnpm monorepo with three independently owned packages:

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
- Integrations include Google Forms/Workspace, Gmail, Calendar, and finance providers.
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
- Run `pnpm typecheck` and the relevant tests before handoff. Run Prisma generation after schema changes.
- Do not modify unrelated files, silently introduce a new framework, or perform external writes without user authorization.
- Record architectural decisions that change dependency direction, data ownership, or tool permissions in project documentation.
EOF

echo "TinyPersonal Hub scaffold created at: $PROJECT_ROOT"
echo "Next: cd '$PROJECT_ROOT' && cp .env.example .env && pnpm install && pnpm db:generate && pnpm dev"
