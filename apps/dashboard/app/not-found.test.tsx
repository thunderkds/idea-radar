import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "./not-found";

describe("NotFound", () => {
  const html = renderToStaticMarkup(<NotFound />);
  it("says the page was not found", () => {
    assert.match(html, /<h1 class="page-title">Not found<\/h1>/);
    assert.match(html, /&gt; 404/);
  });
  it("links back to the Lowkey landing view", () => {
    assert.match(html, /<a class="gm-link" href="\/">Back to Lowkey repos<\/a>/);
  });
});
