import { NextResponse } from "next/server";
import { z } from "zod";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function success(data: unknown, meta?: unknown) {
  return NextResponse.json(
    { data, ...(meta ? { meta } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export function failure(error: unknown) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Check the supplied fields",
          fieldErrors: z.flattenError(error),
        },
      },
      { status: 400 },
    );
  if (error instanceof ApiError)
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  console.error(
    "Deal Radar server error",
    error instanceof Error
      ? `${error.message}; cause: ${error.cause instanceof Error ? error.cause.message : "unspecified"}`
      : "Unknown error",
  );
  return NextResponse.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message:
          "Database unavailable. Check server configuration and run migrations.",
      },
    },
    { status: 503 },
  );
}
export function query(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys())
    if (params.getAll(key).length > 1)
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "Repeated query parameters are not supported",
      );
  return Object.fromEntries(params);
}
export async function readJson(request: Request, maxBytes = 100_000) {
  if (process.env.VERCEL && !process.env.APP_ORIGIN)
    throw new ApiError(
      503,
      "INVALID_CONFIGURATION",
      "Set APP_ORIGIN to the deployed HTTPS origin",
    );
  if (process.env.APP_ORIGIN) {
    try {
      const configured = new URL(process.env.APP_ORIGIN);
      if (
        configured.origin !== process.env.APP_ORIGIN ||
        !["http:", "https:"].includes(configured.protocol) ||
        (process.env.VERCEL && configured.protocol !== "https:")
      )
        throw new Error();
    } catch {
      throw new ApiError(
        503,
        "INVALID_CONFIGURATION",
        "APP_ORIGIN must be an HTTP(S) origin without a trailing slash or path; Vercel requires HTTPS",
      );
    }
  }
  const requestUrl = new URL(request.url);
  const expected =
    process.env.APP_ORIGIN ||
    `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
  const origin = request.headers.get("origin");
  if (!origin || origin !== expected)
    throw new ApiError(
      403,
      "INVALID_ORIGIN",
      "Use the application origin for writes",
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(
      400,
      "INVALID_CONTENT_TYPE",
      "Expected application/json",
    );
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes)
    throw new ApiError(413, "INPUT_TOO_LARGE", "Request is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}
