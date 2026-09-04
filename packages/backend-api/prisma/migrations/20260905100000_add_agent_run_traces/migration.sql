CREATE TABLE "AgentRunTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL DEFAULT '[]',
    "allowedToolsJson" TEXT NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "toolCallsJson" TEXT NOT NULL DEFAULT '[]',
    "finalResponse" TEXT,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

CREATE INDEX "AgentRunTrace_ownerKey_createdAt_idx" ON "AgentRunTrace"("ownerKey", "createdAt");
CREATE INDEX "AgentRunTrace_sessionId_createdAt_idx" ON "AgentRunTrace"("sessionId", "createdAt");
CREATE INDEX "AgentRunTrace_status_createdAt_idx" ON "AgentRunTrace"("status", "createdAt");
