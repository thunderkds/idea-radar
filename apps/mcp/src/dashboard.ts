import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import { PAGE_CSP, ideaPage, listPage, loginPage, messagePage } from "./html.js";
import { isRealDate } from "./index-store.js";
import type { IdeaStore, IdeaSummary } from "./index-store.js";
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
const MAX_QUERY = 200;
const MAX_TAG = 100;
/** The store's search returns at most this many; tag and date filters then narrow them. */
const SEARCH_FETCH = 100;

/** Postgres text cannot hold NUL; drop it from every value that reaches the store. */
const clean = (value: string | null): string => (value ?? "").replaceAll("\u0000", "").trim();

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
    "referrer-policy": "same-origin",
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

  const list = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const params = new URL(req.url ?? "/", "http://localhost").searchParams;
    const notices: string[] = [];
    let q = clean(params.get("q"));
    const tag = clean(params.get("tag")).slice(0, MAX_TAG);
    const dates = { since: clean(params.get("since")), until: clean(params.get("until")) };
    const valid = { since: dates.since, until: dates.until } as Record<"since" | "until", string | undefined>;
    for (const key of ["since", "until"] as const) {
      if (dates[key] !== "" && !isRealDate(dates[key])) {
        notices.push(`${key}: write the date as YYYY-MM-DD`);
        valid[key] = undefined;
      } else if (dates[key] === "") valid[key] = undefined;
    }
    const echo = q;
    if (q.length > MAX_QUERY) {
      notices.push(`search: at most ${MAX_QUERY} characters`);
      q = "";
    }
    let ideas: IdeaSummary[];
    if (q === "") {
      ideas = await store.list({
        tag: tag === "" ? undefined : tag,
        since: valid.since,
        until: valid.until,
        limit: LIST_LIMIT,
      });
    } else {
      const wanted = tag.toLowerCase();
      ideas = (await store.search(q, SEARCH_FETCH))
        .filter(
          (i) =>
            (tag === "" || i.tags.includes(wanted)) &&
            (valid.since === undefined || i.last_seen >= valid.since) &&
            (valid.until === undefined || i.last_seen <= valid.until),
        )
        .slice(0, LIST_LIMIT);
    }
    sendHtml(
      res,
      200,
      listPage({
        ideas,
        q: echo.slice(0, MAX_QUERY),
        tag,
        since: dates.since.slice(0, 10),
        until: dates.until.slice(0, 10),
        notices,
        limit: LIST_LIMIT,
      }),
    );
  };

  const idea = async (res: ServerResponse, rawId: string): Promise<void> => {
    let id: string;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      id = "\u0000";
    }
    const found = id.includes("\u0000") ? undefined : await store.get(id);
    if (found === undefined)
      return sendHtml(res, 404, messagePage("Idea not found", "There is no idea with that id.", true));
    sendHtml(res, 200, ideaPage(found));
  };

  return async (req, res, path) => {
    const ideaId = /^\/ideas\/([^/]+)$/.exec(path)?.[1];
    if (path !== "/login" && path !== "/logout" && path !== "/" && ideaId === undefined) return false;
    try {
      if (path === "/login") await login(req, res);
      else if (path === "/logout") logout(req, res);
      else if (!signedIn(req)) redirect(res, "/login");
      else if (req.method !== "GET") notAllowed(res, "GET", true);
      else if (ideaId !== undefined) await idea(res, ideaId);
      else await list(req, res);
    } catch (err) {
      log(`dashboard error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`);
      if (!res.headersSent)
        sendHtml(res, 500, messagePage("Something went wrong", "Try again in a moment.", signedIn(req)));
    }
    return true;
  };
}
