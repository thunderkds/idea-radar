import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Timeline } from "./timeline";

describe("Timeline", () => {
  it("lists each source with its first and last date", () => {
    const html = renderToStaticMarkup(
      <Timeline entries={[{ source: "github_trending", firstSeenAt: "2026-10-20T08:00:00Z", lastSeenAt: "2026-10-29T08:00:00Z" }]} />,
    );
    assert.match(html, /github_trending/);
    assert.match(html, /2026-10-20 to 2026-10-29/);
  });
  it("keeps the order the API sent, one list item per source", () => {
    const html = renderToStaticMarkup(
      <Timeline
        entries={[
          { source: "ossinsight", firstSeenAt: "2026-10-18T00:00:00Z", lastSeenAt: "2026-10-18T00:00:00Z" },
          { source: "github_trending", firstSeenAt: "2026-10-20T00:00:00Z", lastSeenAt: "2026-10-29T00:00:00Z" },
        ]}
      />,
    );
    assert.equal((html.match(/<li>/g) ?? []).length, 2);
    assert.ok(html.indexOf("ossinsight") < html.indexOf("github_trending"));
  });
  it("shows no data for a date that does not parse", () => {
    const html = renderToStaticMarkup(<Timeline entries={[{ source: "ossinsight", firstSeenAt: "not a date", lastSeenAt: "2026-10-29T00:00:00Z" }]} />);
    assert.match(html, /gm-nodata">no data<\/span> to 2026-10-29/);
  });
  it("says no data when the API sent no timeline or an empty one", () => {
    assert.match(renderToStaticMarkup(<Timeline entries={undefined} />), /gm-nodata">no data</);
    assert.match(renderToStaticMarkup(<Timeline entries={[]} />), /gm-nodata">no data</);
  });
});
