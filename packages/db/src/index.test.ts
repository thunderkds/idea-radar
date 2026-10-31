import { test } from "node:test";
import assert from "node:assert/strict";
import * as db from "./index.js";

test("T010 exports the label and precision tuning functions, and they round-trip a label sheet", () => {
  for (const name of ["sampleLowkeyForLabelling", "labelSheetCsv", "parseCsv", "parseLabels", "precisionAtK"]) {
    assert.equal(typeof (db as Record<string, unknown>)[name], "function", `${name} is not exported as a function`);
  }
  assert.deepEqual([...db.CSV_HEADER], ["repo_id", "full_name", "score", "url", "label"]);

  const sheet = db.labelSheetCsv([{ repoId: 7, fullName: "o/r", score: 0.5 }]);
  assert.deepEqual(db.parseCsv(sheet)[1], ["7", "o/r", "0.5", "https://github.com/o/r", ""]);
  const filled = sheet.replace(/,\n$/, ",good\n");
  assert.deepEqual([...db.parseLabels(filled)], [[7, true]]);
});
