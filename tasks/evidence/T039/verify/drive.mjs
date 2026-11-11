import { createRequire } from "node:module";
const require = createRequire("/home/thunderkds/workspace/pets/easy-ui-mcp/package.json");
const { chromium } = require("playwright-core");
const B = "http://localhost:18040";
const out = (k, v) => console.log(`## ${k}\n${typeof v === "string" ? v : JSON.stringify(v, null, 1)}`);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
const p = await ctx.newPage();
const consoleMsgs = []; const dialogs = [];
p.on("console", (m) => consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 160)}`));
p.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });
await p.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
const nav = async (fn) => { await Promise.all([p.waitForNavigation({ waitUntil: "load" }), fn()]); };
const shot = (n) => p.screenshot({ path: `${n}.png`, fullPage: true });
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// A. login page
const r0 = await p.goto(`${B}/login`);
out("A1 login CSP header", r0.headers()["content-security-policy"]);
out("A2 focus on load", await p.evaluate(() => document.activeElement?.id));
await shot("login-m");
await p.fill("#token", "wrong"); await p.press("#token", "Enter");
await p.waitForLoadState();
out("A3 wrong token", { status: "after submit", url: p.url(), alert: await p.locator('[role=alert]').allTextContents(), stillForm: await p.locator("#token").count() });
// B. login ok
await p.fill("#token", "dash-token-cccccccccccccccccccccc"); await p.press("#token", "Enter");
await p.waitForURL(`${B}/`);
await shot("list-m");
out("B1 list headings", await p.locator(".bucket h2").allInnerTexts());
out("B2 count line + cards", { line: await p.locator("p.mono.muted").first().innerText(), cards: await p.locator("li.idea").count(), overflow375: await overflow() });
out("B3 filters details open?", await p.evaluate(() => document.querySelector("details").open));
// summary clamp: height of the 2000-char card summary
out("B4 clamped summary height px (2000-char idea)", await p.evaluate(() => { const c=[...document.querySelectorAll("li.idea")].find(l=>l.innerText.includes("Flaky test triage")); return Math.round(c.querySelector(".clamp").getBoundingClientRect().height); }));
// tap targets <44 at 375
out("B5 interactive elements under 44px tall (375)", await p.evaluate(() => [...document.querySelectorAll("a,button,summary,input")].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && r.height>0 && r.height<43.5 && !e.classList.contains("vh") && !e.classList.contains("skip");}).map(e=>`${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().height)}`)));
// C. click on card body (summary text) opens the idea
const bb = await p.locator("li.idea", { hasText: "Agent trace viewer" }).locator(".clamp").boundingBox(); out("C0 element at click point", await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e.tagName+" "+(e.closest("a")?.getAttribute("href")||"");}, [bb.x+20, bb.y+8])); await nav(() => p.mouse.click(bb.x+20, bb.y+8));
out("C1 click on summary text of a card ->", p.url());
await p.goto(`${B}/`);
// D. chip click stays on its own target
await nav(() => p.locator("li.idea", { hasText: "Markdown notes sync" }).locator("a.chip", { hasText: "notes" }).click());
out("D1 chip click ->", p.url());
out("D2 active chips after tag click", await p.locator(".active a").allInnerTexts());
// E. filters: open, set date with native input, apply
await p.goto(`${B}/`);
await p.locator("summary").click();
await p.fill("#tag", "cli");
await p.fill("#since", "2026-11-01");
await nav(() => p.click(".filters .btn-primary"));
out("E1 after Apply url", p.url());
out("E2 details open + chips", { open: await p.evaluate(() => document.querySelector("details").open), chips: await p.locator(".active a").allInnerTexts(), hrefs: await p.locator(".active a").evaluateAll(a=>a.map(x=>x.getAttribute("href"))) });
await shot("list-filtered-m");
await nav(() => p.locator(".active a", { hasText: "tag: cli" }).click());
out("E3 removed tag chip ->", p.url());
await nav(() => p.locator(".active a", { hasText: "Reset" }).click());
out("E4 Reset ->", p.url());
// F. search with Enter
await p.fill("#q", "release notes"); await nav(() => p.press("#q", "Enter"));
out("F1 search url + chip + cards", { url: p.url(), chips: await p.locator(".active a").allInnerTexts(), cards: await p.locator("li.idea").count(), boxValue: await p.inputValue("#q") });
await p.goto(`${B}/?q=zzzznomatch`);
out("F2 no match", await p.locator(".notice").allInnerTexts());
// G. XSS probe
await p.goto(`${B}/`);
out("G1 XSS probe card text (literal?)", await p.locator("li.idea", { hasText: "script" }).locator("h3").innerText());
out("G2 dialogs fired", dialogs);
out("G3 injected nodes", await p.evaluate(() => ({ scripts: document.querySelectorAll("main script").length, img: document.querySelectorAll("main img").length })));
// H. idea page
await p.goto(`${B}/ideas/changelog-gen`);
await shot("idea-m");
out("H1 idea page", { eyebrow: await p.locator(".eyebrow").innerText(), h2: await p.locator("h2").allInnerTexts(), whyNowCard: await p.locator(".card-hl").count(), overflow375: await overflow() });
out("H2 external links", await p.locator("main a[target=_blank]").evaluateAll(a=>a.map(x=>({text:x.textContent.trim(),href:x.href.slice(0,90),title:x.title?x.title.slice(0,60):"",rel:x.rel}))));
out("H3 plain-text repos", await p.locator("ul.signals li.mono").allInnerTexts());
out("H4 long link text length", await p.evaluate(() => Math.max(...[...document.querySelectorAll(".signals a")].map(a=>a.textContent.trim().length))));
await p.goto(`${B}/ideas/xss-probe`);
out("H5 xss idea page literal title / note", { h1: await p.locator("h1").innerText(), dialogs: dialogs.length });
// I. keyboard order on the list
await p.goto(`${B}/`);
const tabs = [];
for (let i = 0; i < 9; i++) { await p.keyboard.press("Tab"); tabs.push(await p.evaluate(() => { const e=document.activeElement; return `${e.tagName}.${e.className||e.id}:${(e.textContent||e.placeholder||"").trim().slice(0,28)}`; })); }
out("I1 tab order", tabs);
// J. probes
for (const q of ["?since=garbage", "?since=2026-12-01&until=2026-01-01", "?tag=a&tag=b", `?q=${"a".repeat(260)}`, "?tag=%22%3E%3Cscript%3Ealert(1)%3C/script%3E"]) {
  const r = await p.goto(`${B}/${q}`);
  out(`J probe ${q.slice(0,40)}`, { status: r.status(), notices: await p.locator(".notice").allInnerTexts(), chips: (await p.locator(".active a").allInnerTexts()).map(s=>s.slice(0,40)), overflow: await overflow(), dialogs: dialogs.length });
}
const r404 = await p.goto(`${B}/ideas/nope`);
out("J 404 idea", { status: r404.status(), h1: await p.locator("h1").innerText(), link: await p.locator("main a").first().innerText() });
// K. desktop shots
await p.setViewportSize({ width: 1280, height: 800 });
await p.goto(`${B}/`); await shot("list-d");
await p.goto(`${B}/ideas/changelog-gen`); await shot("idea-d");
out("K1 desktop overflow idea", await overflow());
// L. logout
await p.goto(`${B}/`);
await nav(() => p.click('form[action="/logout"] button'));
out("L1 after logout", p.url());
const rr = await p.goto(`${B}/`); out("L2 / after logout", { url: p.url() });
out("CSP violations", await p.evaluate(() => window.__csp));
out("console messages", consoleMsgs);
await b.close();
