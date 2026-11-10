import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared-secret gate for POST /api/run.
 * ICB_RUN_TOKEN authorizes callers of this endpoint. It is not a model
 * provider key. When the variable is missing or blank, every request is
 * rejected and the model is not called.
 */

const MAX_AUTHORIZATION_LENGTH = 1024;

type HeaderValue = string | string[] | undefined;

export type HeaderSource = {
  headers?: Record<string, HeaderValue>;
};

function configuredToken(): string | null {
  const raw = process.env.ICB_RUN_TOKEN;
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  if (!token) return null;
  return token;
}

function headerValue(req: HeaderSource, name: string): string | null {
  const headers = req?.headers;
  if (!headers || typeof headers !== "object") return null;

  let value: HeaderValue = undefined;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) {
      value = headers[key];
      break;
    }
  }

  if (Array.isArray(value)) {
    if (value.length !== 1) return null;
    value = value[0];
  }

  if (typeof value !== "string") return null;
  return value;
}

function presentedToken(req: HeaderSource): string | null {
  const header = headerValue(req, "authorization");
  if (header == null) return null;
  if (header.length > MAX_AUTHORIZATION_LENGTH) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match?.[1]) return null;
  return match[1];
}

let warnedMissingConfig = false;

function warnMissingConfig() {
  if (warnedMissingConfig) return;
  warnedMissingConfig = true;
  console.error(
    JSON.stringify({
      type: "icb-runtime-auth",
      message: "ICB_RUN_TOKEN is not configured"
    })
  );
}

/**
 * Compare digests so a length mismatch cannot throw or bail out early.
 * Both digests are fixed length, and timingSafeEqual does not stop at the
 * first differing byte.
 */
export function tokenEquals(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export function authorizeRunRequest(req: HeaderSource): boolean {
  const expected = configuredToken();
  if (!expected) {
    warnMissingConfig();
    return false;
  }

  const presented = presentedToken(req);
  if (presented == null) return false;
  return tokenEquals(presented, expected);
}
