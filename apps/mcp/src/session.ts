import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ir_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const mac = (secret: string, exp: string): string =>
  createHmac("sha256", secret).update(`dashboard-session:${exp}`).digest("hex");

/** Constant-time exact comparison: both sides are hashed first, so the compared buffers have equal length. */
export function tokenMatches(given: string, expected: string): boolean {
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}

/** `<expiry in unix seconds>.<hmac>`; the HMAC is keyed by the dashboard token, which never appears in the value. */
export function createSession(secret: string, nowMs: number): string {
  const exp = String(Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS);
  return `${exp}.${mac(secret, exp)}`;
}

/** True for an unexpired value signed with this token. Rotating the token makes every old value fail. */
export function verifySession(secret: string, value: string | undefined, nowMs: number): boolean {
  if (value === undefined) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = value.slice(0, dot);
  if (!/^\d{1,12}$/.test(exp)) return false;
  const given = Buffer.from(value.slice(dot + 1), "utf8");
  const expected = Buffer.from(mac(secret, exp), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(exp) * 1000 > nowMs;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
