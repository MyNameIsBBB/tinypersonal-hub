export type LocalSeedBucket = "traits" | "motivations" | "frustrations" | "decisionStyle" | "communicationGuidance";
export type LocalSeedItem = {
  claim: string;
  line: number;
  section: number;
  kind: "fact" | "preference" | "inferred_pattern";
  confidence: number;
  memoryType: "FACT" | "PREFERENCE" | "PROJECT" | "RELATIONSHIP" | "INFERRED_PATTERN";
};
export type LocalProfileSeed = {
  summary: string;
  groups: Record<LocalSeedBucket, LocalSeedItem[]>;
};
export function parseLocalProfileSeed(profileText: string): LocalProfileSeed;
