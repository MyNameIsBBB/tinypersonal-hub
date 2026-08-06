import { prisma } from "../db/client";
import { decryptSecret, encryptSecret } from "../security/vaultCrypto";

export type VaultMetadata = {
  id: string; serviceName: string; category: string; accountIdentifier: string;
  url: string | null; notes: string | null; createdAt: Date; updatedAt: Date;
};
export type VaultSearchMetadata = Omit<VaultMetadata, "notes">;

export type VaultRevealAuthorization = {
  actorId: string;
  reason: string;
  verify(): Promise<boolean>;
};

const contextFor = (serviceName: string, accountIdentifier: string) => `${serviceName}\0${accountIdentifier}`;

export async function createVaultSecret(input: {
  serviceName: string; category: string; accountIdentifier: string; password: string;
  url?: string; notes?: string; totpSeed?: string;
}): Promise<VaultMetadata> {
  const context = contextFor(input.serviceName, input.accountIdentifier);
  const password = encryptSecret(input.password, context);
  const totp = input.totpSeed ? encryptSecret(input.totpSeed, `${context}\0totp`) : null;
  const record = await prisma.vaultSecret.create({ data: {
    serviceName: input.serviceName, category: input.category,
    accountIdentifier: input.accountIdentifier,
    encryptedPassword: password.ciphertext, iv: password.iv, authTag: password.authTag,
    encryptedTotpSeed: totp?.ciphertext, totpIv: totp?.iv, totpAuthTag: totp?.authTag,
    url: input.url, notes: input.notes,
  } });
  const { encryptedPassword: _, iv: __, authTag: ___, encryptedTotpSeed: ____, totpIv: _____, totpAuthTag: ______, ...metadata } = record;
  return metadata;
}

export async function searchVaultMetadata(query: string): Promise<VaultSearchMetadata[]> {
  const records = await prisma.vaultSecret.findMany({
    where: { OR: [
      { serviceName: { contains: query } }, { category: { contains: query } },
      { accountIdentifier: { contains: query } }, { url: { contains: query } },
    ] },
    select: { id: true, serviceName: true, category: true, accountIdentifier: true, url: true, createdAt: true, updatedAt: true },
    take: 30,
  });
  return records;
}

export async function revealVaultSecret(id: string, authorization: VaultRevealAuthorization) {
  if (!authorization.reason.trim() || !(await authorization.verify())) throw new Error("Step-up authentication required");
  const record = await prisma.vaultSecret.findUniqueOrThrow({ where: { id } });
  const context = contextFor(record.serviceName, record.accountIdentifier);
  return {
    password: decryptSecret({ ciphertext: record.encryptedPassword, iv: record.iv, authTag: record.authTag }, context),
    totpSeed: record.encryptedTotpSeed && record.totpIv && record.totpAuthTag
      ? decryptSecret({ ciphertext: record.encryptedTotpSeed, iv: record.totpIv, authTag: record.totpAuthTag }, `${context}\0totp`)
      : null,
  };
}

export async function updateVaultMetadata(id: string, input: {
  serviceName?: string; category?: string; accountIdentifier?: string;
  url?: string | null; notes?: string | null;
}): Promise<VaultMetadata> {
  const record = await prisma.vaultSecret.findUniqueOrThrow({ where: { id } });
  const serviceName = input.serviceName ?? record.serviceName;
  const accountIdentifier = input.accountIdentifier ?? record.accountIdentifier;
  const oldContext = contextFor(record.serviceName, record.accountIdentifier);
  const newContext = contextFor(serviceName, accountIdentifier);
  const passwordPlaintext = decryptSecret({ ciphertext: record.encryptedPassword, iv: record.iv, authTag: record.authTag }, oldContext);
  const password = encryptSecret(passwordPlaintext, newContext);
  const totpPlaintext = record.encryptedTotpSeed && record.totpIv && record.totpAuthTag
    ? decryptSecret({ ciphertext: record.encryptedTotpSeed, iv: record.totpIv, authTag: record.totpAuthTag }, `${oldContext}\0totp`)
    : null;
  const totp = totpPlaintext ? encryptSecret(totpPlaintext, `${newContext}\0totp`) : null;
  const updated = await prisma.vaultSecret.update({ where: { id }, data: {
    serviceName, accountIdentifier, category: input.category,
    url: input.url, notes: input.notes,
    encryptedPassword: password.ciphertext, iv: password.iv, authTag: password.authTag,
    encryptedTotpSeed: totp?.ciphertext, totpIv: totp?.iv, totpAuthTag: totp?.authTag,
  } });
  const { encryptedPassword: _, iv: __, authTag: ___, encryptedTotpSeed: ____, totpIv: _____, totpAuthTag: ______, ...metadata } = updated;
  return metadata;
}

export async function deleteVaultSecret(id: string): Promise<void> {
  await prisma.vaultSecret.delete({ where: { id } });
}
