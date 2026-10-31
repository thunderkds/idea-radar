import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RepoDetail } from "../../_components/repo-detail";
import RepoPage from "./page";

describe("Repo page", () => {
  it("renders the repo detail for the id in the path", async () => {
    const el = await RepoPage({ params: Promise.resolve({ id: "42" }) });
    assert.equal(el.type, RepoDetail);
    assert.deepEqual(el.props, { id: "42" });
  });
});
