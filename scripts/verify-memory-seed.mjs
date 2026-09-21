import { PrismaClient } from "@prisma/client";

const ownerKey = process.env.MEMORY_SEED_OWNER_KEY?.trim()
  || (process.env.APP_AUTH_USERNAME?.trim().toLowerCase() ? `user:${process.env.APP_AUTH_USERNAME.trim().toLowerCase()}` : "");
if (!ownerKey) throw new Error("Cannot verify memory seed without an owner key");
const prisma = new PrismaClient();

try {
  const [snapshot, importedMemories] = await Promise.all([
    prisma.userModelSnapshot.findFirst({ where: { ownerKey }, orderBy: { version: "desc" }, select: { version: true, source: true } }),
    prisma.personalMemory.count({ where: { ownerKey, source: "IMPORTED_PROFILE_LOCAL" } }),
  ]);
  if (!snapshot || importedMemories === 0) throw new Error("Production memory seed is missing");
  console.log(`Verified User Model v${snapshot.version} (${snapshot.source}, ${importedMemories} imported memories)`);
} finally {
  await prisma.$disconnect();
}
