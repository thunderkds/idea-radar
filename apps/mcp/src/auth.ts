import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_TOKEN_LENGTH = 32;

/** The reason the token is unusable, or undefined when it is fine. Never echoes the token. */
export function checkToken(token: string | undefined): string | undefined {
  if (token === undefined || token === "") return "MCP_TOKEN is not set; refusing to start";
  if (token.length < MIN_TOKEN_LENGTH)
    return `MCP_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters; refusing to start`;
  return undefined;
}

/** Constant-time check of `Authorization: Bearer <token>`: both sides are hashed first, so the compared buffers have equal length. */
export function bearerMatches(header: string | undefined, expected: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}
