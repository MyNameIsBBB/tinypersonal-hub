CREATE TABLE "CodingJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerKey" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userMessageId" TEXT NOT NULL,
  "inputJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" DATETIME,
  "resultJson" TEXT,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "completedAt" DATETIME
);
CREATE INDEX "CodingJob_status_createdAt_idx" ON "CodingJob"("status", "createdAt");
CREATE INDEX "CodingJob_ownerKey_sessionId_createdAt_idx" ON "CodingJob"("ownerKey", "sessionId", "createdAt");
