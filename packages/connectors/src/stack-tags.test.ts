import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveStackTags } from "./stack-tags.js";

describe("deriveStackTags", () => {
  it("package.json: dependencies, devDependencies and peerDependencies map through the table", () => {
    const pkg = JSON.stringify({
      dependencies: { next: "14", react: "18" },
      devDependencies: { vue: "3" },
      peerDependencies: { svelte: "4", express: "4" },
    });
    assert.deepEqual(deriveStackTags({ "package.json": pkg }), ["express", "next", "node", "react", "svelte", "vue"]);
  });

  it("package.json: unknown dependencies give only the language tag", () => {
    assert.deepEqual(deriveStackTags({ "package.json": '{"dependencies":{"left-pad":"1"}}' }), ["node"]);
  });

  it("requirements.txt: ignores comments, extras, versions, case and underscores", () => {
    const txt = "# web\nFastAPI[all]==0.110\nDjango>=4 # orm\nflask\n-r other.txt\n\n";
    assert.deepEqual(deriveStackTags({ "requirements.txt": txt }), ["django", "fastapi", "flask", "python"]);
  });

  it("pyproject.toml: PEP 621 array (single and multi line) and poetry table", () => {
    const pep = `[project]\nname = "x"\ndescription = "uses flask"\ndependencies = [\n  "fastapi>=0.1",\n  'uvicorn',\n]\n`;
    assert.deepEqual(deriveStackTags({ "pyproject.toml": pep }), ["fastapi", "python"]);
    const poetry = `[tool.poetry.dependencies]\npython = "^3.11"\nDjango = "^4"\n`;
    assert.deepEqual(deriveStackTags({ "pyproject.toml": poetry }), ["django", "python"]);
    assert.deepEqual(deriveStackTags({ "pyproject.toml": '[project]\ndependencies = ["flask"]' }), ["flask", "python"]);
  });

  it("go.mod: block and single-line require; gin by module path", () => {
    const block = "module x\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgolang.org/x/sys v0.1.0 // indirect\n)\n";
    assert.deepEqual(deriveStackTags({ "go.mod": block }), ["gin", "go"]);
    assert.deepEqual(deriveStackTags({ "go.mod": "module x\nrequire github.com/gin-gonic/gin v1.9.1\n" }), ["gin", "go"]);
    assert.deepEqual(deriveStackTags({ "go.mod": "module x\nrequire github.com/other/gin v1\n" }), ["go"]);
  });

  it("Cargo.toml: dependency table keys, inline and sub-table forms; not package metadata", () => {
    const toml = `[package]\nname = "tokio-fan"\n\n[dependencies]\ntokio = { version = "1", features = ["full"] }\n\n[dependencies.axum]\nversion = "0.7"\n`;
    assert.deepEqual(deriveStackTags({ "Cargo.toml": toml }), ["axum", "rust", "tokio"]);
    assert.deepEqual(deriveStackTags({ "Cargo.toml": '[package]\nname = "tokio"\n' }), ["rust"]);
  });

  it("pom.xml and build.gradle: spring by group or artifact id", () => {
    const pom = "<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>";
    assert.deepEqual(deriveStackTags({ "pom.xml": pom }), ["java", "spring"]);
    const gradle = "dependencies {\n  implementation 'org.springframework.boot:spring-boot-starter:3.2.0'\n  testImplementation \"junit:junit:4.13\"\n}";
    assert.deepEqual(deriveStackTags({ "build.gradle": gradle }), ["java", "spring"]);
    assert.deepEqual(deriveStackTags({ "build.gradle": "implementation 'junit:junit:4.13'" }), ["java"]);
  });

  it("combines manifests and dedupes tags", () => {
    const tags = deriveStackTags({
      "package.json": '{"dependencies":{"react":"18"}}',
      "requirements.txt": "flask\n",
      "pyproject.toml": '[project]\ndependencies = ["flask"]',
    });
    assert.deepEqual(tags, ["flask", "node", "python", "react"]);
  });

  it("invalid or odd input is ignored, never thrown", () => {
    assert.deepEqual(deriveStackTags({ "package.json": "{not json" }), []);
    assert.deepEqual(deriveStackTags({ "package.json": "[1,2]" }), []);
    assert.deepEqual(deriveStackTags({ "package.json": '{"dependencies":["react"]}' }), ["node"]);
    assert.doesNotThrow(() => deriveStackTags({ "Cargo.toml": "[[[ = = \n]]]", "pyproject.toml": "\u0000", "go.mod": "require (" }));
    assert.deepEqual(deriveStackTags({ "package.json": 42, "go.mod": null }), []);
    assert.deepEqual(deriveStackTags({}), []);
    assert.deepEqual(deriveStackTags({ "README.md": "# next react" }), []);
  });
});
