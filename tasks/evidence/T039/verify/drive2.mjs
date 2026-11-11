import { createRequire } from "node:module";
const require = createRequire("/home/thunderkds/workspace/pets/easy-ui-mcp/package.json");
const { chromium } = require("playwright-core");
const B = "http://localhost:18040";
const out = (k, v) => console.log(`## ${k}\n${typeof v === "string" ? v : JSON.stringify(v)}`);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
const p = await ctx.newPage();
const nav = async (fn) => { await Promise.all([p.waitForNavigation({ waitUntil: "load" }), fn()]); };
await p.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective)); });
await p.goto(`${B}/login`); await p.fill("#token", "dash-token-cccccccccccccccccccccc"); await nav(() => p.press("#token", "Enter"));
// keyboard toggles Filters
await p.focus("summary"); await p.keyboard.press("Enter");
out("P1 Enter on Filters toggles open", await p.evaluate(() => document.querySelector("details").open));
await p.keyboard.press("Space");
out("P2 Space toggles closed again", await p.evaluate(() => document.querySelector("details").open));
// Search button keeps active filters (filters panel is open when active, but check the hidden-inputs case with q only)
await p.goto(`${B}/?tag=cli&since=2026-11-01`);
await p.fill("#q", "env"); await nav(() => p.click(".search .btn"));
out("P3 Search with active filters keeps them", p.url());
out("P3b chips", await p.locator(".active a").allInnerTexts());
// closed-details case: reach it by clearing tag chip then check Search keeps nothing odd
await p.goto(`${B}/?q=release`);
out("P4 q only: details closed", await p.evaluate(() => !document.querySelector("details").open));
// breakpoint widths
for (const w of [719, 720, 1024]) { await p.setViewportSize({ width: w, height: 800 }); await p.goto(`${B}/`); out(`P5 width ${w}`, await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, open: document.querySelector("details")?.open }))); }
// open filters at 720 and 375: grid columns
await p.setViewportSize({ width: 720, height: 800 }); await p.goto(`${B}/`); await p.locator("summary").click();
out("P6 filters grid at 720", await p.evaluate(() => getComputedStyle(document.querySelector(".filters")).gridTemplateColumns));
await p.setViewportSize({ width: 375, height: 812 }); await p.goto(`${B}/`); await p.locator("summary").click();
out("P7 filters grid at 375", await p.evaluate(() => getComputedStyle(document.querySelector(".filters")).gridTemplateColumns));
// very narrow 320 with open filters
await p.setViewportSize({ width: 320, height: 700 }); await p.goto(`${B}/?tag=cli&since=2026-11-01&until=2026-11-30`);
out("P8 320px with all filters active: overflow px", await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
await p.screenshot({ path: "p8-320.png", fullPage: true });
// browser back/forward keeps state
await p.setViewportSize({ width: 375, height: 812 });
await p.goto(`${B}/?tag=notes`); await p.goto(`${B}/ideas/medium-one`); await p.goBack();
out("P9 back restores filtered list", { url: p.url(), chips: await p.locator(".active a").allInnerTexts() });
// text zoom: 200% font scale via CSS zoom emulation (device scale factor not text zoom) -> use page zoom
await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
out("P10 200% root font: overflow px", await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
// wrong methods
const ck = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join("; ");
for (const [m, path] of [["POST", "/"], ["PUT", "/ideas/medium-one"], ["POST", "/ideas/medium-one"], ["GET", "/logout"]]) {
  const r = await fetch(B + path, { method: m, headers: { cookie: ck }, redirect: "manual" });
  console.log(`## P11 ${m} ${path}\n${r.status} ${r.headers.get("location") ?? ""}`);
}
const r = await fetch(`${B}/?q=x`, { headers: { cookie: ck } });
out("P12 headers on list", { csp: (r.headers.get("content-security-policy") || "").slice(0, 60), cache: r.headers.get("cache-control"), ctype: r.headers.get("content-type") });
const body = await r.text();
const m = /<style>([\s\S]*?)<\/style>/.exec(body)[1];
const { createHash } = await import("node:crypto");
out("P13 style hash equals CSP hash", (r.headers.get("content-security-policy") || "").includes(createHash("sha256").update(m).digest("base64")));
out("P14 html has script/style attr", { script: /<script/i.test(body), styleAttr: /\sstyle=/i.test(body) });
out("CSP violations", await p.evaluate(() => window.__csp));
await b.close();
