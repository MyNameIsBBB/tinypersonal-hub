-- Preserve legacy Task records in their original table. New tasks are owner-scoped.
CREATE TABLE "WorkTask" (
 "id" TEXT NOT NULL PRIMARY KEY, "ownerKey" TEXT NOT NULL, "title" TEXT NOT NULL,
 "description" TEXT, "requirements" TEXT, "status" TEXT NOT NULL DEFAULT 'TODO',
 "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "deadline" DATETIME, "startAt" DATETIME,
 "progressNote" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL, "completedAt" DATETIME
);
CREATE INDEX "WorkTask_ownerKey_status_deadline_idx" ON "WorkTask"("ownerKey", "status", "deadline");
CREATE TABLE "TaskChecklistItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "taskId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "isCompleted" BOOLEAN NOT NULL DEFAULT false, "order" INTEGER NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME,
 CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TaskChecklistItem_taskId_order_idx" ON "TaskChecklistItem"("taskId", "order");
