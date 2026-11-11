import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import { PAGE_CSP, listPage, loginPage, messagePage } from "./html.js";
import type { IdeaStore } from "./index-store.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSession,
  readCookie,
  tokenMatches,
  verifySession,
} from "./session.js";

/** The list shows this many ideas; tag, date and search filters narrow it down. */
export const LIST_LIMIT = 50;
const MAX_FORM_BYTES = 8 * 1024;

/** Answers dashboard routes; resolves false for any other path so the caller can carry on. */
export type DashboardHandler = (req: IncomingMessage, res: ServerResponse, path: string) => Promise<boolean>;

const first = (value: string | string[] | undefined): string | undefined =>
  (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();

function sendHtml(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": PAGE_CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(body);
}

const redirect = (res: ServerResponse, location: string, headers: Record<string, string> = {}): void => {
  res.writeHead(303, { location, "cache-control": "no-store", ...headers });
  res.end();
};

function isHttps(req: IncomingMessage): boolean {
  return first(req.headers["x-forwarded-proto"]) === "https" || (req.socket as TLSSocket).encrypted === true;
}

function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** A browser form post from another site is refused: `Sec-Fetch-Site` must be same-origin (or absent), and `Origin`, when sent, must name this host. */
function isSameOrigin(req: IncomingMessage): boolean {
  const site = first(req.headers["sec-fetch-site"]);
  if (site !== undefined && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false; // "null" and anything that is not a URL
  }
  return host === req.headers.host || host === first(req.headers["x-forwarded-host"]);
}

/** The posted form, or undefined when the body is over the limit. */
function readForm(req: IncomingMessage): Promise<URLSearchParams | undefined> {
  return new Promise((resolveForm, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_FORM_BYTES) return resolveForm(undefined);
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => resolveForm(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))));
  });
}

export function createDashboard(
  store: IdeaStore,
  token: string,
  log: (line: string) => void,
  now: () => number = Date.now,
): DashboardHandler {
  const signedIn = (req: IncomingMessage): boolean =>
    verifySession(token, readCookie(req.headers.cookie, SESSION_COOKIE), now());

  const notAllowed = (res: ServerResponse, allow: string, isIn: boolean): void =>
    sendHtml(res, 405, messagePage("Not allowed", "This page does not accept that request.", isIn), { allow });

  const login = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method === "GET") return sendHtml(res, 200, loginPage());
    if (req.method !== "POST") return notAllowed(res, "GET, POST", false);
    if (!isSameOrigin(req))
      return sendHtml(res, 403, messagePage("Refused", "Cross-site requests are not allowed.", false));
    const form = await readForm(req);
    if (form === undefined)
      return sendHtml(res, 413, messagePage("Too large", "That request is too large.", false), { connection: "close" });
    if (!tokenMatches(form.get("token") ?? "", token)) return sendHtml(res, 401, loginPage("Wrong token"));
    redirect(res, "/", { "set-cookie": sessionCookie(createSession(token, now()), SESSION_TTL_SECONDS, isHttps(req)) });
  };

  const logout = (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== "POST") return notAllowed(res, "POST", signedIn(req));
    if (!isSameOrigin(req))
      return sendHtml(res, 403, messagePage("Refused", "Cross-site requests are not allowed.", signedIn(req)));
    redirect(res, "/login", { "set-cookie": sessionCookie("", 0, isHttps(req)) });
  };

  const list = async (res: ServerResponse): Promise<void> => {
    const ideas = await store.list({ limit: LIST_LIMIT });
    sendHtml(res, 200, listPage(ideas));
  };

  return async (req, res, path) => {
    const isIdea = /^\/ideas\/[^/]+$/.test(path);
    if (path !== "/login" && path !== "/logout" && path !== "/" && !isIdea) return false;
    try {
      if (path === "/login") await login(req, res);
      else if (path === "/logout") logout(req, res);
      else if (!signedIn(req)) redirect(res, "/login");
      else if (req.method !== "GET") notAllowed(res, "GET", true);
      else await list(res);
    } catch (err) {
      log(`dashboard error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`);
      if (!res.headersSent)
        sendHtml(res, 500, messagePage("Something went wrong", "Try again in a moment.", signedIn(req)));
    }
    return true;
  };
}
