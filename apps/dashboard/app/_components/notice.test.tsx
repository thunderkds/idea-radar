import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Notice } from "./notice";

describe("Notice", () => {
  it("is a warn alert with the title in bold and the message under it", () => {
    const html = renderToStaticMarkup(<Notice title="API unreachable">Start it with pnpm api.</Notice>);
    assert.match(html, /class="gm-notice gm-notice--warn" role="alert"/);
    assert.match(html, /<strong>API unreachable<\/strong><div>Start it with pnpm api\.<\/div>/);
    assert.match(html, /<svg/);
  });
  it("renders only the title when there is no message", () => {
    const html = renderToStaticMarkup(<Notice title="Nothing here" />);
    assert.match(html, /<strong>Nothing here<\/strong><\/div>/);
  });
  it("escapes markup in the message", () => {
    const html = renderToStaticMarkup(<Notice title="Bad filter">{"<script>alert(1)</script>"}</Notice>);
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /&lt;script&gt;/);
  });
});
