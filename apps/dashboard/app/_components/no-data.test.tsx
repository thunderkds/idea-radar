import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NoData, OrNoData, WarnIcon } from "./no-data";

describe("NoData", () => {
  it("renders the words no data in the dim style", () => {
    assert.equal(renderToStaticMarkup(<NoData />), '<span class="gm-nodata">no data</span>');
  });
});

describe("OrNoData", () => {
  it("shows the text when there is one", () => {
    assert.equal(renderToStaticMarkup(<OrNoData text="Rust" />), "Rust");
  });
  it("shows no data for null, never an empty or zero value", () => {
    assert.match(renderToStaticMarkup(<OrNoData text={null} />), /gm-nodata">no data</);
  });
  it("keeps the string 0 as data", () => {
    assert.equal(renderToStaticMarkup(<OrNoData text="0" />), "0");
  });
});

describe("WarnIcon", () => {
  it("is a decorative SVG hidden from assistive technology", () => {
    const html = renderToStaticMarkup(<WarnIcon />);
    assert.match(html, /^<svg[^>]*aria-hidden="true"/);
  });
});
