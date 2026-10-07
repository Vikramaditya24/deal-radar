import { describe, it, expect } from "vitest";
import {
  normalizedName,
  normalizedPhone,
  canonicalDomain,
  jaroWinkler,
  trigramSimilarity,
  matchIdentity,
  type Identity,
} from "../lib/dedupe";
import {
  importSchema,
  parseImport,
  planImport,
  mergeAssertions,
} from "../lib/ingest";
import { sampleBusinesses } from "../data/sample";
const identity = (patch: Partial<Identity> = {}): Identity => ({
  id: "a",
  name: "Acme HVAC LLC",
  domain: "acme.com",
  phone: "+1 202 555 0101",
  city: "Columbus",
  state: "OH",
  email: null,
  synthetic: false,
  ...patch,
});
describe("conservative business dedupe", () => {
  it("normalizes legal suffixes, international digits and registrable domains", () => {
    expect(normalizedName("Ácme, Inc.")).toBe("acme");
    expect(normalizedPhone("(202) 555-0101 ext. 25")).toBe("12025550101");
    expect(canonicalDomain("https://www.service.acme.co.uk/contact")).toBe(
      "acme.co.uk",
    );
  });
  it("scores a transposition and limits fuzzy names", () => {
    expect(jaroWinkler("Martha", "Marhta")).toBeGreaterThan(0.95);
    expect(trigramSimilarity("Acme HVAC LLC", "Acme HVAC Inc")).toBe(1);
    expect(jaroWinkler("", "")).toBe(0);
  });
  it("merges consistent domain identities but surfaces geography conflicts", () => {
    expect(
      matchIdentity(identity(), identity({ id: "b", name: "Acme HVAC Inc" }))
        ?.automatic,
    ).toBe(true);
    expect(
      matchIdentity(identity(), identity({ id: "b", city: "Charlotte" }))
        ?.automatic,
    ).toBe(false);
  });
  it("never automatically merges synthetic with real or unrelated names on one domain", () => {
    expect(
      matchIdentity(identity(), identity({ synthetic: true }))?.automatic,
    ).toBe(false);
    expect(
      matchIdentity(identity(), identity({ name: "Zebra Dentistry" }))
        ?.automatic,
    ).toBe(false);
  });
  it("parses quoted CSV, rejects bad rows and requires currency for revenue", () => {
    const p = parseImport(
      importSchema.parse({
        kind: "csv",
        content:
          'company,url,revenue,currency\n"Acme, Services",https://acme.com,2000000,USD\nBad,http://127.0.0.1,2000000,USD\nMissing,https://missing.com,2000000,\n',
      }),
    );
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].name).toBe("Acme, Services");
    expect(p.errors).toHaveLength(2);
  });
  it("reconciles repeated fixture URLs and keeps a reviewed conflicting cluster conservative", () => {
    const fixture = sampleBusinesses()[0];
    const p = parseImport(
      importSchema.parse({
        kind: "urls",
        content: `https://${fixture.domain}\nhttps://www.${fixture.domain}`,
      }),
    );
    const plan = planImport(p.rows, [], {});
    expect(plan[1].targetId).toBe("row:1");
    const c = parseImport(
      importSchema.parse({
        kind: "csv",
        content:
          "name,website,city,state\nAcme HVAC,https://acme.com,Columbus,OH\nAcme HVAC,https://acme.com,Charlotte,NC\nAcme HVAC,https://acme.com,Columbus,OH",
      }),
    );
    const reviewed = planImport(c.rows, [], { "row:2": "row:1" });
    expect(reviewed[2].targetId).toBe(null);
    expect(reviewed[2].candidates[0].conflicts).toContain("Different cities");
  });
  it("retains stronger evidence and stores conflicting import assertions", () => {
    const old = sampleBusinesses()[1].evidence.find(
      (e) => e.field === "foundedYear",
    )!;
    const incoming = { ...old, id: "new", confidence: 0.65, value: 2020 };
    const merged = mergeAssertions([{ ...old }], [incoming]);
    expect(merged.find((e) => e.id === old.id)?.selected).toBe(true);
    expect(merged.find((e) => e.id === "new")?.selected).toBe(false);
  });
});
