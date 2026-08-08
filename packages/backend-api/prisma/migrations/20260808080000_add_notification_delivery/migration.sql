CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "NotificationDelivery_idempotencyKey_channel_key" ON "NotificationDelivery"("idempotencyKey", "channel");
CREATE INDEX "NotificationDelivery_createdAt_idx" ON "NotificationDelivery"("createdAt");
