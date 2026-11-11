import assert from "node:assert/strict";
import { test } from "node:test";
import { escape, html, raw, safeHttpUrl } from "./html.js";

test("escape turns & < > \" ' into entities", () => {
  assert.equal(
    escape(`<script>alert("x")</script> & 'y'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
  );
});

test("html escapes every interpolation unless it is marked raw, and joins arrays", () => {
  const evil = `"><img src=x onerror=alert(1)>`;
  assert.equal(
    String(html`<p title="${evil}">${evil}</p>`),
    `<p title="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;">&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</p>`,
  );
  assert.equal(
    String(
      html`<ul>
        ${["a", "<b>"].map((x) => html`<li>${x}</li>`)}
      </ul>`,
    ),
    "<ul><li>a</li><li>&lt;b&gt;</li></ul>",
  );
  assert.equal(String(html`<i>${raw("<b>ok</b>")}</i>`), "<i><b>ok</b></i>");
  assert.equal(String(html`${undefined}${null}${5}`), "5");
});

test("safeHttpUrl accepts http and https only and returns the parsed form", () => {
  assert.equal(safeHttpUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeHttpUrl("http://example.com"), "http://example.com/");
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:x",
    "file:///etc/passwd",
    "//example.com",
    "/relative",
    "example.com",
    "",
    "https://",
  ])
    assert.equal(safeHttpUrl(bad), undefined, bad);
});
