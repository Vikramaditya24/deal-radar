import { cookies } from "next/headers";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, databaseConfig } from "./db";
import { workspaces } from "./schema";
const cookieName = "deal-radar-session";
export function sessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  if (!configured && (process.env.VERCEL || !databaseConfig().local))
    throw new Error("Hosted use requires SESSION_SECRET");
  return configured || "deal-radar-local-development-only-secret";
}
function hash(token: string) {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}
export async function getWorkspace() {
  const db = await getDb();
  if (databaseConfig().local) {
    const id = "local-workspace";
    await db
      .insert(workspaces)
      .values({
        id,
        sessionTokenHash: hash("local-workspace"),
        createdAt: Date.now(),
      })
      .onConflictDoNothing();
    return id;
  }
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.sessionTokenHash, hash(token)))
      .limit(1);
    if (workspace) return workspace.id;
  }
  const newToken = randomBytes(32).toString("hex");
  const id = randomUUID();
  await db
    .insert(workspaces)
    .values({ id, sessionTokenHash: hash(newToken), createdAt: Date.now() });
  jar.set(cookieName, newToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return id;
}
