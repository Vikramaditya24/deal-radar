import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { z } from "zod";
import type {
  ThesisCriteria,
  Facts,
  Evidence,
  signalSchema,
  sourceSchema,
  mergeSchema,
  scoreSchema,
  draftSchema,
  jobProgressSchema,
} from "./contracts";
export const workspaces = sqliteTable("workspace", {
  id: text("id").primaryKey(),
  sessionTokenHash: text("session_token_hash").notNull().unique(),
  demoLoadedAt: integer("demo_loaded_at"),
  createdAt: integer("created_at").notNull(),
});
export const theses = sqliteTable(
  "thesis",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(1),
    criteria: text("criteria_json", { mode: "json" })
      .$type<ThesisCriteria>()
      .notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("thesis_workspace_idx").on(t.workspaceId)],
);
export const leads = sqliteTable(
  "lead",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain"),
    normalizedPhone: text("normalized_phone"),
    stage: text("stage", { enum: ["New", "Contacted", "Replied", "Meeting"] })
      .notNull()
      .default("New"),
    synthetic: integer("synthetic", { mode: "boolean" })
      .notNull()
      .default(false),
    enrichmentStatus: text("enrichment_status", {
      enum: ["pending", "running", "completed", "partial", "blocked", "failed"],
    })
      .notNull()
      .default("pending"),
    revision: integer("revision").notNull().default(1),
    facts: text("facts_json", { mode: "json" }).$type<Facts>().notNull(),
    evidence: text("evidence_json", { mode: "json" })
      .$type<Evidence[]>()
      .notNull(),
    signals: text("signals_json", { mode: "json" })
      .$type<z.infer<typeof signalSchema>[]>()
      .notNull(),
    sources: text("sources_json", { mode: "json" })
      .$type<z.infer<typeof sourceSchema>[]>()
      .notNull(),
    mergeHistory: text("merge_history_json", { mode: "json" })
      .$type<z.infer<typeof mergeSchema>[]>()
      .notNull(),
    score: text("score_json", { mode: "json" }).$type<z.infer<
      typeof scoreSchema
    > | null>(),
    drafts: text("drafts_json", { mode: "json" })
      .$type<z.infer<typeof draftSchema>[]>()
      .notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("lead_workspace_stage_idx").on(t.workspaceId, t.stage),
    index("lead_workspace_domain_idx").on(t.workspaceId, t.domain),
    index("lead_workspace_phone_idx").on(t.workspaceId, t.normalizedPhone),
  ],
);
export const enrichmentJobs = sqliteTable(
  "enrichment_job",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "completed", "cancelled", "failed"],
    }).notNull(),
    progress: text("progress_json", { mode: "json" })
      .$type<z.infer<typeof jobProgressSchema>>()
      .notNull(),
    total: integer("total").notNull(),
    completed: integer("completed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    blocked: integer("blocked").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("job_workspace_idx").on(t.workspaceId)],
);
export const suppressions = sqliteTable(
  "suppression",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["lead", "domain", "email", "phone"],
    }).notNull(),
    normalizedValue: text("normalized_value").notNull(),
    reason: text("reason").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("suppression_workspace_kind_value_idx").on(
      t.workspaceId,
      t.kind,
      t.normalizedValue,
    ),
  ],
);
