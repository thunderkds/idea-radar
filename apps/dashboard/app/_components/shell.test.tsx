import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { Shell } from "./shell";

const at = (pathname: string) =>
  renderToStaticMarkup(
    <PathnameContext.Provider value={pathname}>
      <Shell>
        <p>page body</p>
      </Shell>
    </PathnameContext.Provider>,
  );

describe("Shell", () => {
  it("has a top bar with the brand, a Menu button for the drawer, a sidebar and the main region", () => {
    const html = at("/");
    assert.match(html, /<header class="topbar">/);
    assert.match(html, /<a class="brand" href="\/">/);
    assert.match(html, /<button[^>]*aria-expanded="false"[^>]*aria-controls="sidebar"[^>]*>Menu<\/button>/);
    assert.match(html, /<aside id="sidebar" class="sidebar" aria-label="Main navigation">/);
    assert.match(html, /<main id="main" class="main"><p>page body<\/p><\/main>/);
  });
  it("starts with the drawer closed", () => {
    assert.match(at("/"), /data-nav-open="false"/);
  });
  it("links the sidebar to the three tiers", () => {
    const html = at("/");
    for (const path of ["/tiers/trending", "/tiers/medium", "/tiers/lowkey"]) assert.match(html, new RegExp(`class="gm-sidenav__item"[^>]*href="${path}"|href="${path}"[^>]*class="gm-sidenav__item"`));
  });
  it("marks Lowkey as current at / and the matching tier on a tier page", () => {
    assert.match(at("/"), /aria-current="page"[^>]*>(<[^>]*>)*Lowkey/);
    const medium = at("/tiers/medium");
    assert.equal((medium.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(medium, /aria-current="page"[^>]*>(<[^>]*>)*Medium/);
  });
  it("marks no tier as current on a repo page", () => {
    assert.doesNotMatch(at("/repos/42"), /aria-current/);
  });
});
