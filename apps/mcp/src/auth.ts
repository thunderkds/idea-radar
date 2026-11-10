import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_TOKEN_LENGTH = 32;

/** What a caller may do: `read` calls the read tools; `write` also calls `submit_ideas`. */
export type Role = "read" | "write";

export interface Tokens {
  MCP_TOKEN: string | undefined;
  MCP_WRITE_TOKEN: string | undefined;
  DASHBOARD_TOKEN: string | undefined;
}

/** The reason the tokens are unusable, or undefined when they are fine. Never echoes a token. */
export function checkTokens(tokens: Tokens): string | undefined {
  for (const name of ["MCP_TOKEN", "MCP_WRITE_TOKEN", "DASHBOARD_TOKEN"] as const) {
    const token = tokens[name];
    if (token === undefined || token === "") return `${name} is not set; refusing to start`;
    if (token.length < MIN_TOKEN_LENGTH)
      return `${name} must be at least ${MIN_TOKEN_LENGTH} characters; refusing to start`;
  }
  if (
    tokens.MCP_TOKEN === tokens.MCP_WRITE_TOKEN ||
    tokens.MCP_TOKEN === tokens.DASHBOARD_TOKEN ||
    tokens.MCP_WRITE_TOKEN === tokens.DASHBOARD_TOKEN
  )
    return "MCP_TOKEN, MCP_WRITE_TOKEN and DASHBOARD_TOKEN must all be different; refusing to start";
  return undefined;
}

/** Constant-time check of `Authorization: Bearer <token>`: both sides are hashed first, so the compared buffers have equal length. */
export function bearerMatches(header: string | undefined, expected: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}

/** The caller's role, resolved once per request. Both tokens are always compared, so timing does not reveal which one is close. */
export function roleFor(header: string | undefined, tokens: { read: string; write: string }): Role | undefined {
  const isWrite = bearerMatches(header, tokens.write);
  const isRead = bearerMatches(header, tokens.read);
  return isWrite ? "write" : isRead ? "read" : undefined;
}
