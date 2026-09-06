ALTER TABLE "PendingAction" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "PendingAction_pending_dedupe_key"
ON "PendingAction"("ownerKey", "sessionId", "toolName", "dedupeKey")
WHERE "status" = 'PENDING' AND "dedupeKey" IS NOT NULL;
