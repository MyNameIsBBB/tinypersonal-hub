-- CreateTable
CREATE TABLE "PersonalMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "predicate" TEXT,
    "claim" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceSessionId" TEXT,
    "sourceMessageId" TEXT,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "observedAt" DATETIME NOT NULL,
    "lastConfirmedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sensitivity" TEXT NOT NULL DEFAULT 'PRIVATE',
    "searchText" TEXT NOT NULL,
    "embeddingJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "MemoryProcessingRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "extractedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

CREATE TABLE "UserModelSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "modelJson" TEXT NOT NULL,
    "basedOnMemoryIdsJson" TEXT NOT NULL DEFAULT '[]',
    "supersedesId" TEXT,
    "throughRunAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'REFLECTION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserModelProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL,
    "baseSnapshotId" TEXT,
    "proposedModelJson" TEXT NOT NULL,
    "changesJson" TEXT NOT NULL DEFAULT '[]',
    "basedOnMemoryIdsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

CREATE TABLE "RelationshipTimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "PersonalMemory_ownerKey_sourceMessageId_claim_key" ON "PersonalMemory"("ownerKey", "sourceMessageId", "claim");
CREATE INDEX "PersonalMemory_ownerKey_status_type_idx" ON "PersonalMemory"("ownerKey", "status", "type");
CREATE INDEX "PersonalMemory_ownerKey_subject_idx" ON "PersonalMemory"("ownerKey", "subject");
CREATE INDEX "PersonalMemory_ownerKey_updatedAt_idx" ON "PersonalMemory"("ownerKey", "updatedAt");
CREATE UNIQUE INDEX "MemoryProcessingRun_ownerKey_sourceMessageId_key" ON "MemoryProcessingRun"("ownerKey", "sourceMessageId");
CREATE INDEX "MemoryProcessingRun_ownerKey_status_createdAt_idx" ON "MemoryProcessingRun"("ownerKey", "status", "createdAt");
CREATE UNIQUE INDEX "UserModelSnapshot_ownerKey_version_key" ON "UserModelSnapshot"("ownerKey", "version");
CREATE INDEX "UserModelSnapshot_ownerKey_createdAt_idx" ON "UserModelSnapshot"("ownerKey", "createdAt");
CREATE INDEX "UserModelProposal_ownerKey_status_createdAt_idx" ON "UserModelProposal"("ownerKey", "status", "createdAt");
CREATE INDEX "RelationshipTimelineEvent_ownerKey_occurredAt_idx" ON "RelationshipTimelineEvent"("ownerKey", "occurredAt");
