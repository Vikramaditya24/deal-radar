import {
  factsSchema,
  evidenceSchema,
  sourceSchema,
  thesisCriteriaSchema,
  type Facts,
  type Evidence,
} from "../lib/contracts";
const observedAt = Date.UTC(2026, 9, 1);
const industries = [
  {
    name: "HVAC Services",
    suffix: "Heating & Air",
    services: [
      "Commercial HVAC maintenance",
      "Emergency repairs",
      "Equipment installation",
    ],
  },
  {
    name: "Industrial Services",
    suffix: "Industrial Maintenance",
    services: ["Preventive maintenance", "Equipment repair", "Plant support"],
  },
  {
    name: "Commercial Cleaning",
    suffix: "Facility Care",
    services: [
      "Recurring facility cleaning",
      "Floor care",
      "Post-construction cleaning",
    ],
  },
  {
    name: "Precision Manufacturing",
    suffix: "Precision Works",
    services: ["CNC machining", "Short-run production", "Quality inspection"],
  },
  {
    name: "Pest Control",
    suffix: "Pest Solutions",
    services: [
      "Commercial pest management",
      "Property inspections",
      "Recurring treatment plans",
    ],
  },
  {
    name: "Landscaping",
    suffix: "Landscape Services",
    services: [
      "Commercial grounds maintenance",
      "Irrigation service",
      "Seasonal landscaping",
    ],
  },
  {
    name: "Managed IT",
    suffix: "Technology Services",
    services: ["Managed IT support", "Network maintenance", "Cloud migration"],
  },
  {
    name: "Specialty Distribution",
    suffix: "Supply Company",
    services: [
      "Industrial supplies",
      "Local delivery",
      "Inventory replenishment",
    ],
  },
  {
    name: "Fire Safety",
    suffix: "Fire Protection",
    services: [
      "Fire system inspection",
      "Extinguisher servicing",
      "Compliance documentation",
    ],
  },
  {
    name: "Plumbing Services",
    suffix: "Plumbing & Mechanical",
    services: [
      "Commercial plumbing",
      "Scheduled maintenance",
      "Emergency repairs",
    ],
  },
];
const places = [
  ["Columbus", "OH", "Buckeye"],
  ["Charlotte", "NC", "Piedmont"],
  ["Indianapolis", "IN", "Crossroads"],
  ["Pittsburgh", "PA", "Allegheny"],
  ["Richmond", "VA", "James River"],
  ["Cincinnati", "OH", "Queen City"],
  ["Nashville", "TN", "Cumberland"],
  ["Louisville", "KY", "Bluegrass"],
  ["Greenville", "SC", "Upstate"],
  ["Kansas City", "MO", "Heartland"],
  ["Madison", "WI", "Badger"],
  ["Tulsa", "OK", "Prairie"],
  ["Des Moines", "IA", "Midland"],
  ["Birmingham", "AL", "Red Mountain"],
  ["Grand Rapids", "MI", "Great Lakes"],
];
export const sampleThesis = thesisCriteriaSchema.parse({
  industries: [
    "HVAC Services",
    "Industrial Services",
    "Fire Safety",
    "Plumbing Services",
  ],
  geographies: ["OH", "NC", "IN", "PA", "VA"],
  revenueMinCents: 200_000_000,
  revenueMaxCents: 800_000_000,
  currency: "USD",
  minYears: 15,
  mustHaves: ["Recurring maintenance services"],
  dealBreakers: ["Franchise"],
});
export type SampleBusiness = {
  key: string;
  name: string;
  domain: string;
  facts: Facts;
  evidence: Evidence[];
  sources: ReturnType<typeof sourceSchema.parse>[];
  fixtureHtml: string;
  contactHtml: string;
  aboutHtml: string;
};
export function sampleBusinesses(): SampleBusiness[] {
  return Array.from({ length: 150 }, (_, i) => {
    const industry = industries[i % industries.length];
    const [city, state, prefix] = places[Math.floor(i / industries.length)];
    const name = `${prefix} ${industry.suffix}`;
    const domain = `${prefix.toLowerCase().replaceAll(" ", "-")}-${(i % industries.length) + 1}.example`;
    const url = `https://${domain}`;
    const foundedYear = 1968 + ((i * 7) % 53);
    const email = i % 7 === 0 ? null : `hello@${domain}`;
    const phone =
      i % 9 === 0
        ? null
        : `+1-202-555-${String(100 + (i % 100)).padStart(4, "0")}`;
    const revenueCents =
      i % 6 === 0 ? null : (1_200_000 + ((i * 713_000) % 9_800_000)) * 100;
    const facts = factsSchema.parse({
      industry: industry.name,
      city,
      state,
      country: "US",
      revenueCents,
      currency: revenueCents === null ? null : "USD",
      foundedYear: i % 11 === 0 ? null : foundedYear,
      services: industry.services,
      email,
      phone,
      contactPage: i % 5 === 0 ? null : `${url}/contact`,
      teamSizeHint:
        i % 4 === 0 ? null : `${8 + (i % 28)}–${15 + (i % 28)} employees`,
      techHints: [],
    });
    const assertions: [
      string,
      string | number | string[],
      string,
      string | null,
    ][] = [
      [
        "industry",
        industry.name,
        `We provide ${industry.name.toLowerCase()}.`,
        url,
      ],
      ["geography", `${city}, ${state}, US`, `Serving ${city}, ${state}.`, url],
      ["services", industry.services, industry.services.join("; "), url],
    ];
    if (facts.foundedYear !== null)
      assertions.push([
        "foundedYear",
        foundedYear,
        `Founded in ${foundedYear}.`,
        `${url}/about`,
      ]);
    if (email)
      assertions.push([
        "email",
        email,
        `Contact us at ${email}.`,
        `${url}/contact`,
      ]);
    if (phone)
      assertions.push(["phone", phone, `Call ${phone}.`, `${url}/contact`]);
    if (facts.contactPage)
      assertions.push([
        "contactPage",
        facts.contactPage,
        "Contact our team.",
        facts.contactPage,
      ]);
    if (facts.teamSizeHint)
      assertions.push([
        "teamSizeHint",
        facts.teamSizeHint,
        `Our team includes ${facts.teamSizeHint}.`,
        `${url}/about`,
      ]);
    if (revenueCents !== null)
      assertions.push([
        "revenueCents",
        revenueCents,
        "Illustrative annual revenue supplied in the synthetic dataset; not a website finding.",
        null,
      ]);
    const evidence = assertions.map(([field, value, excerpt, sourceUrl], n) =>
      evidenceSchema.parse({
        id: `fixture-${i + 1}-${n + 1}`,
        field,
        value,
        confidence: field === "revenueCents" ? 0.65 : 0.9,
        sourceUrl,
        excerpt,
        observedAt,
        method: "synthetic_fixture",
        synthetic: true,
        selected: true,
      }),
    );
    const family =
      i % 3 === 0 ? `Family-owned since ${foundedYear}.` : "Locally operated.";
    const succession =
      i % 17 === 0
        ? "Our founder is exploring a planned leadership transition."
        : "";
    const history =
      facts.foundedYear === null ? "" : `Founded in ${foundedYear}.`;
    return {
      key: `business-${String(i + 1).padStart(3, "0")}`,
      name,
      domain,
      facts,
      evidence,
      sources: [
        sourceSchema.parse({
          label: `synthetic-demo:row:${i + 1}`,
          kind: "synthetic",
          sourceUrl: null,
          observedAt,
          original: {
            name,
            industry: industry.name,
            state,
            synthetic: true,
            reportedRevenueCents: revenueCents,
          },
        }),
      ],
      fixtureHtml: `<!doctype html><html><head><title>${name}</title></head><body><h1>${name}</h1><p>Serving ${city}, ${state}.</p><p>${industry.services.join(". ")}.</p><a href="/about">About us</a><a href="/contact">Contact</a></body></html>`,
      aboutHtml: `<html><body><h1>About ${name}</h1><p>${history} ${family} ${succession}</p>${facts.teamSizeHint ? `<p>Our team includes ${facts.teamSizeHint}.</p>` : ""}</body></html>`,
      contactHtml: `<html><body><h1>Contact ${name}</h1>${email ? `<a href="mailto:${email}">${email}</a>` : ""}${phone ? `<a href="tel:${phone}">${phone}</a>` : ""}</body></html>`,
    };
  });
}
