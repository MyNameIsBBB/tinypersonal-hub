CREATE TABLE "ChatGenerationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerKey" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userMessageId" TEXT NOT NULL,
  "inputJson" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" DATETIME,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "completedAt" DATETIME
);
CREATE UNIQUE INDEX "ChatGenerationJob_sessionId_userMessageId_key" ON "ChatGenerationJob"("sessionId", "userMessageId");
CREATE INDEX "ChatGenerationJob_status_createdAt_idx" ON "ChatGenerationJob"("status", "createdAt");
CREATE INDEX "ChatGenerationJob_ownerKey_sessionId_createdAt_idx" ON "ChatGenerationJob"("ownerKey", "sessionId", "createdAt");
