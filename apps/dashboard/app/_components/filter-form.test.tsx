import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FilterForm } from "./filter-form";

describe("FilterForm", () => {
  it("is a GET form to the tier page with the four filters", () => {
    const html = renderToStaticMarkup(<FilterForm tier="trending" filters={{}} />);
    assert.match(html, /<form[^>]*action="\/tiers\/trending"[^>]*method="get"|<form[^>]*method="get"[^>]*action="\/tiers\/trending"/);
    for (const name of ["language", "topic", "collection", "window"]) assert.match(html, new RegExp(`name="${name}"`));
    assert.match(html, /<label for="filter-collection">OSS Insight collection<\/label>/);
  });
  it("fills the inputs from the URL filters", () => {
    const html = renderToStaticMarkup(<FilterForm tier="lowkey" filters={{ language: "Go", topic: "cli", collection: "Web Framework" }} />);
    assert.match(html, /name="language"[^>]*value="Go"|value="Go"[^>]*name="language"/);
    assert.match(html, /value="cli"/);
    assert.match(html, /value="Web Framework"/);
  });
  it("selects 7 days by default and 30 days when asked", () => {
    assert.match(renderToStaticMarkup(<FilterForm tier="lowkey" filters={{}} />), /<option value="7d" selected="">/);
    assert.match(renderToStaticMarkup(<FilterForm tier="lowkey" filters={{ window: "30d" }} />), /<option value="30d" selected="">/);
  });
  it("keeps an unknown window in the list so the API can answer it with its own message", () => {
    const html = renderToStaticMarkup(<FilterForm tier="lowkey" filters={{ window: "90d" }} />);
    assert.match(html, /<option value="90d" selected="">90d<\/option>/);
  });
  it("resets to the tier page without any filter", () => {
    const html = renderToStaticMarkup(<FilterForm tier="medium" filters={{ language: "Go", cursor: "abc" }} />);
    assert.match(html, /<a [^>]*href="\/tiers\/medium"[^>]*>Reset<\/a>/);
  });
  it("escapes markup in a filter value", () => {
    const html = renderToStaticMarkup(<FilterForm tier="lowkey" filters={{ topic: '"><script>x</script>' }} />);
    assert.doesNotMatch(html, /<script/);
  });
});
