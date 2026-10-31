import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ideaGroupKey } from "./grouping.js";
import { groupingConfig } from "./scoring.js";

describe("ideaGroupKey (T026 AC 1)", () => {
  it("gives two repos of one idea the same key whatever the order and case of their topics", () => {
    const a = ideaGroupKey(["Vector-Database", "RAG", "llm"], ["python", "fastapi"]);
    const b = ideaGroupKey(["llm", "rag", "vector-database"], ["fastapi", "python"]);
    assert.ok(a);
    assert.equal(a, b);
  });

  it("drops generic topics, so awesome-lists and event tags do not make a group", () => {
    assert.equal(ideaGroupKey(["awesome", "hacktoberfest", "github", "Hacktoberfest2025"], ["python"]), null);
    assert.equal(ideaGroupKey(["awesome", "rag", "hacktoberfest"], ["python"]), ideaGroupKey(["rag"], ["python"]));
  });

  it("keeps the 2 most specific topics: more hyphen parts first, then longer, then alphabetical", () => {
    // vector-database (2 parts) and llm-agents (2 parts, shorter) beat the one-word topics
    const key = ideaGroupKey(["python", "ai", "llm-agents", "vector-database", "machine"], []);
    assert.equal(key, ideaGroupKey(["vector-database", "llm-agents"], []));
    assert.notEqual(key, ideaGroupKey(["vector-database", "ai"], []));
    // same specificity: the alphabetically first wins
    assert.equal(ideaGroupKey(["bbbb", "aaaa", "cccc"], []), ideaGroupKey(["aaaa", "bbbb"], []));
  });

  it("adds the primary stack tag: a framework before a language, so a node and a python repo of one idea differ", () => {
    const topics = ["rag", "vector-database"];
    assert.equal(ideaGroupKey(topics, ["node", "express"]), ideaGroupKey(topics, ["express"]));
    assert.notEqual(ideaGroupKey(topics, ["python"]), ideaGroupKey(topics, ["node"]));
    assert.notEqual(ideaGroupKey(topics, ["python", "fastapi"]), ideaGroupKey(topics, ["python"]));
    assert.notEqual(ideaGroupKey(topics, ["python"]), ideaGroupKey(topics, []));
  });

  it("returns null when no topic is left, even with a stack tag (a stack alone is not an idea)", () => {
    assert.equal(ideaGroupKey([], ["python", "fastapi"]), null);
    assert.equal(ideaGroupKey(["", "  "], []), null);
  });

  it("ignores blank and repeated topics", () => {
    assert.equal(ideaGroupKey([" RAG ", "rag", ""], ["go"]), ideaGroupKey(["rag"], ["go"]));
  });
});

describe("groupingConfig (T026 AC 2)", () => {
  it("has 2 leaders per group, a generic-topic list and leader ranking weights", () => {
    assert.equal(groupingConfig.leadersPerGroup, 2);
    assert.ok(groupingConfig.genericTopics.includes("awesome"));
    assert.ok(groupingConfig.genericTopics.includes("hacktoberfest"));
    assert.ok(groupingConfig.genericTopics.includes("github"));
    assert.ok(groupingConfig.leaderWeights.score > 0 && groupingConfig.leaderWeights.commits30d > 0);
  });
});
