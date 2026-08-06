-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "folder" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "embeddingJson" TEXT,
    "scheduleItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageDriver" TEXT NOT NULL DEFAULT 'local',
    "storagePath" TEXT NOT NULL,
    "publicUrl" TEXT,
    "checksumSha256" TEXT NOT NULL,
    "noteId" TEXT,
    "scheduleItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VaultSecret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accountIdentifier" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "encryptedTotpSeed" TEXT,
    "totpIv" TEXT,
    "totpAuthTag" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Note_folder_idx" ON "Note"("folder");

-- CreateIndex
CREATE INDEX "Note_scheduleItemId_idx" ON "Note"("scheduleItemId");

-- CreateIndex
CREATE INDEX "MediaAsset_noteId_idx" ON "MediaAsset"("noteId");

-- CreateIndex
CREATE INDEX "MediaAsset_scheduleItemId_idx" ON "MediaAsset"("scheduleItemId");

-- CreateIndex
CREATE INDEX "VaultSecret_serviceName_idx" ON "VaultSecret"("serviceName");

-- CreateIndex
CREATE INDEX "VaultSecret_category_idx" ON "VaultSecret"("category");
