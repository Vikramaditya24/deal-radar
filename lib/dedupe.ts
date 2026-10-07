import { getDomain } from "tldts";
export type Identity = {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  synthetic: boolean;
};
export function normalizedName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(llc|incorporated|inc|limited|ltd|corp|corporation)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function normalizedPhone(value: string | null) {
  if (!value) return null;
  const digits = value.split(/(?:ext\.?|x)\s*\d+/i)[0].replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits || null;
}
export function canonicalDomain(value: string) {
  const host = new URL(
    value.includes("://") ? value : `https://${value}`,
  ).hostname
    .toLowerCase()
    .replace(/^www\./, "");
  return getDomain(host, { allowPrivateDomains: true }) || host;
}
export function trigrams(value: string) {
  const text = `  ${normalizedName(value)} `;
  return new Set(
    Array.from({ length: Math.max(0, text.length - 2) }, (_, i) =>
      text.slice(i, i + 3),
    ),
  );
}
export function trigramSimilarity(a: string, b: string) {
  const x = trigrams(a),
    y = trigrams(b);
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return x.size + y.size ? (2 * shared) / (x.size + y.size) : 0;
}
export function jaroWinkler(a: string, b: string) {
  a = normalizedName(a);
  b = normalizedName(b);
  if (a === b) return a ? 1 : 0;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1),
    ax = Array(a.length).fill(false),
    bx = Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++)
    for (
      let j = Math.max(0, i - range);
      j < Math.min(b.length, i + range + 1);
      j++
    )
      if (!bx[j] && a[i] === b[j]) {
        ax[i] = bx[j] = true;
        matches++;
        break;
      }
  if (!matches) return 0;
  const aa = [...a].filter((_, i) => ax[i]),
    bb = [...b].filter((_, i) => bx[i]);
  let transpositions = 0;
  aa.forEach((c, i) => {
    if (c !== bb[i]) transpositions++;
  });
  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) /
    3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] && a[prefix] === b[prefix]) prefix++;
  return jaro > 0.7 ? jaro + prefix * 0.1 * (1 - jaro) : jaro;
}
const sharedDomains = new Set([
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "yelp.com",
  "google.com",
  "wixsite.com",
  "wordpress.com",
  "business.site",
]);
export function identityConflicts(a: Identity, b: Identity) {
  const conflicts: string[] = [];
  if (
    a.domain &&
    a.domain === b.domain &&
    a.name !== a.domain &&
    b.name !== b.domain &&
    jaroWinkler(a.name, b.name) < 0.55
  )
    conflicts.push("Different business names on a shared domain");
  if (a.synthetic !== b.synthetic)
    conflicts.push("Synthetic and real records must remain separate");
  if (a.domain && b.domain && a.domain !== b.domain)
    conflicts.push("Different business domains");
  if (a.city && b.city && normalizedName(a.city) !== normalizedName(b.city))
    conflicts.push("Different cities");
  if (a.state && b.state && a.state.toLowerCase() !== b.state.toLowerCase())
    conflicts.push("Different states");
  return conflicts;
}
export function matchIdentity(a: Identity, b: Identity) {
  const similarity = jaroWinkler(a.name, b.name),
    conflicts = identityConflicts(a, b);
  const sameDomain =
    !!a.domain && a.domain === b.domain && !sharedDomains.has(a.domain);
  const samePhone =
    !!a.phone && normalizedPhone(a.phone) === normalizedPhone(b.phone);
  const sameGeo =
    !!a.city &&
    !!a.state &&
    !conflicts.some((c) => /cities|states/.test(c)) &&
    !!b.city &&
    !!b.state;
  const corroborated =
    sameDomain ||
    samePhone ||
    (!!a.email && a.email.toLowerCase() === b.email?.toLowerCase());
  let rule = "";
  if (sameDomain) rule = "Same canonical domain";
  else if (samePhone && similarity >= 0.92) rule = "Phone and similar name";
  else if (
    similarity >= 0.95 &&
    trigramSimilarity(a.name, b.name) >= 0.8 &&
    sameGeo &&
    corroborated
  )
    rule = "Fuzzy name, geography and corroboration";
  else if (similarity >= 0.88 && trigramSimilarity(a.name, b.name) >= 0.6)
    rule = "Similar name; needs review";
  return rule
    ? {
        rule,
        similarity,
        conflicts,
        automatic: !conflicts.length && !rule.includes("review"),
      }
    : null;
}
export class IdentityIndex {
  private values = new Map<string, Identity>();
  private blocks = new Map<string, Set<string>>();
  add(value: Identity) {
    this.values.set(value.id, value);
    const keys = [
      value.domain ? `d:${value.domain}` : "",
      value.phone ? `p:${normalizedPhone(value.phone)}` : "",
      ...[...trigrams(value.name)].map((t) => `t:${t}`),
    ].filter(Boolean);
    for (const key of keys) {
      const bucket = this.blocks.get(key) || new Set();
      bucket.add(value.id);
      this.blocks.set(key, bucket);
    }
  }
  candidates(value: Identity) {
    const counts = new Map<string, number>();
    const keys = [
      value.domain ? `d:${value.domain}` : "",
      value.phone ? `p:${normalizedPhone(value.phone)}` : "",
      ...[...trigrams(value.name)].map((t) => `t:${t}`),
    ].filter(Boolean);
    for (const key of keys)
      for (const id of this.blocks.get(key) || [])
        counts.set(
          id,
          (counts.get(id) || 0) + (key.startsWith("t:") ? 1 : 1000),
        );
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([id]) => this.values.get(id)!);
  }
}
