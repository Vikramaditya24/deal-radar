export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    const fields = body.error?.fieldErrors;
    const details = fields
      ? [
          ...(fields.formErrors || []),
          ...Object.values(fields.fieldErrors || {}).flat(),
        ].join("; ")
      : "";
    throw new Error(
      [body.error?.message || "Request failed", details]
        .filter(Boolean)
        .join(": "),
    );
  }
  return body.data as T;
}
export function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
