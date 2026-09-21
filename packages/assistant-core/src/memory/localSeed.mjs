const BUCKET_SECTIONS = {
  traits: [1, 2, 7, 10, 18],
  motivations: [8, 9, 11, 18],
  frustrations: [4, 5, 11],
  decisionStyle: [5, 6, 9, 12, 13, 15],
  communicationGuidance: [0, 3, 4, 5, 14, 16, 17, 19],
};

const frustrationPattern = /(?:frustrat|avoid|don't|do not|not |ไม่|อย่า|ปัญหา|overwhelm|เสียเวลา|ยืดเยื้อ)/iu;

export function parseLocalProfileSeed(profileText) {
  const sections = new Map();
  let current = null;
  for (const [index, raw] of profileText.split(/\r?\n/).entries()) {
    const line = raw.trim();
    const heading = line.match(/^(\d+)\.\s+([A-Z0-9 /&—_()-]+)$/);
    if (heading) {
      current = Number(heading[1]);
      if (!sections.has(current)) sections.set(current, { lines: [], bullets: [] });
      continue;
    }
    if (current === null || !line) continue;
    const section = sections.get(current);
    section.lines.push(line);
    if (!line.startsWith("- ")) continue;
    const claim = line.slice(2).replace(/^\*\*|\*\*$/g, "").trim();
    if (claim.length >= 8 && claim.length <= 1_000) section.bullets.push({ claim, line: index + 1 });
  }

  const groups = {};
  const globallySeen = new Set();
  for (const [bucket, numbers] of Object.entries(BUCKET_SECTIONS)) {
    const candidates = numbers.flatMap((sectionNumber) =>
      (sections.get(sectionNumber)?.bullets ?? []).map((item) => ({ ...item, section: sectionNumber })),
    );
    const prioritized = bucket === "frustrations"
      ? candidates.filter((item) => frustrationPattern.test(item.claim))
      : candidates;
    groups[bucket] = [];
    for (const item of prioritized) {
      const key = item.claim.toLocaleLowerCase();
      if (globallySeen.has(key)) continue;
      globallySeen.add(key);
      const kind = item.section === 2 || item.section === 18
        ? "inferred_pattern"
        : item.section === 1 ? "fact" : "preference";
      groups[bucket].push({
        ...item,
        kind,
        confidence: kind === "fact" ? 0.9 : kind === "inferred_pattern" ? 0.65 : 0.8,
        memoryType: kind === "fact"
          ? "FACT"
          : kind === "inferred_pattern"
            ? "INFERRED_PATTERN"
            : item.section === 6
              ? "PROJECT"
              : item.section === 10 ? "RELATIONSHIP" : "PREFERENCE",
      });
      if (groups[bucket].length === 12) break;
    }
  }

  const summaryParts = sections.get(18)?.bullets.map((item) => item.claim) ?? [];
  return {
    summary: summaryParts.join(" ").slice(0, 2_000) || "Imported local user profile seed.",
    groups,
  };
}
