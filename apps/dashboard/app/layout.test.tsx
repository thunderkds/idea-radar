import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { renderToStaticMarkup } from "react-dom/server";

// layout.tsx imports CSS for Next's bundler; Node cannot load .css, so these imports become no-ops here.
require.extensions[".css"] = () => undefined;

let Layout: typeof import("./layout").default;
let metadata: typeof import("./layout").metadata;
before(async () => {
  ({ default: Layout, metadata } = await import("./layout"));
});

describe("RootLayout", () => {
  const render = () =>
    renderToStaticMarkup(
      <PathnameContext.Provider value="/">
        <Layout>
          <p>page body</p>
        </Layout>
      </PathnameContext.Provider>,
    );
  it("is an English dark-page document with a skip link to the main region", () => {
    const html = render();
    assert.match(html, /^<html lang="en">/);
    assert.match(html, /<body class="gm-page">/);
    assert.match(html, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  });
  it("wraps the page in the shell", () => {
    const html = render();
    assert.match(html, /<header class="topbar">/);
    assert.match(html, /<main id="main" class="main"><p>page body<\/p><\/main>/);
  });
  it("sets the page title", () => {
    assert.equal(metadata.title, "Idea Radar");
  });
});
