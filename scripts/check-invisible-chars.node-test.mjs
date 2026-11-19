import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { addedLines, findInvisibleChars, invisibleIn } from "./check-invisible-chars.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-invisible-chars.mjs");
const ZWSP = String.fromCodePoint(0x200b);
const RLO = String.fromCodePoint(0x202e);
const TAG_A = String.fromCodePoint(0xe0041);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);

function fixtureRepo(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "invisible-chars-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Fixture");
  git("config", "commit.gpgsign", "false");
  const write = (name, content) => writeFileSync(path.join(dir, name), content);
  const commit = (message) => { git("add", "-A"); git("commit", "-q", "-m", message); };
  write("upstream.ts", `export const joiner = "a${ZWSP}b";\nexport const plain = 1;\n`);
  write("untouched.ts", `export const mark = "${RLO}";\n`);
  commit("upstream");
  git("checkout", "-q", "-b", "feature");
  return { dir, git, write, commit };
}

function run(dir, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });
}

test("names each invisible or bidi codepoint, including tag characters", () => {
  assert.deepEqual(invisibleIn(`a${ZWSP}b${RLO}c${TAG_A}${SOFT_HYPHEN}`), ["U+200B", "U+202E", "U+E0041", "U+00AD"]);
  const more = [0x034f, 0x206a, 0x206b, 0x206c, 0x206d, 0x206e, 0x206f, 0x2028, 0x2029];
  assert.deepEqual(invisibleIn(more.map((point) => String.fromCodePoint(point)).join("x")),
    ["U+034F", "U+206A", "U+206B", "U+206C", "U+206D", "U+206E", "U+206F", "U+2028", "U+2029"]);
  assert.deepEqual(invisibleIn("plain ascii, émoji 🙂 and ‘quotes’"), []);
});

test("reads added lines with their new-file line numbers", () => {
  const diff = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -3,0 +4,2 @@", "+one", "+two", "@@ -9 +11 @@", "-old", "+new"].join("\n");
  assert.deepEqual(addedLines(diff), [
    { file: "x", line: 4, text: "one" },
    { file: "x", line: 5, text: "two" },
    { file: "x", line: 11, text: "new" },
  ]);
});

test("an added line that begins with ++ is content, not a file header", () => {
  const diff = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -1,0 +2,2 @@", "+++ sneaky", "+--- also content",
    "diff --git a/y b/y", "new file mode 100644", "--- /dev/null", "+++ b/y", "@@ -0,0 +1 @@", "+fine"].join("\n");
  assert.deepEqual(addedLines(diff), [
    { file: "x", line: 2, text: "++ sneaky" },
    { file: "x", line: 3, text: "--- also content" },
    { file: "y", line: 1, text: "fine" },
  ]);
});

test("catches an invisible character on an added line that begins with ++", (t) => {
  const repo = fixtureRepo(t);
  repo.write("upstream.ts", `export const joiner = "a${ZWSP}b";\nexport const plain = 1;\n++ "${ZWSP}";\n`);
  repo.write("new.md", `++ hidden ${RLO}\n`);
  repo.commit("header lookalikes");
  const result = run(repo.dir, "main");
  assert.equal(result.status, 1);
  assert.deepEqual(result.stderr.trim().split("\n").slice(1).sort(), ["new.md:1:U+202E", "upstream.ts:3:U+200B"]);
});

test("passes when the branch adds only clean lines, even to files that already hold invisible characters", (t) => {
  const repo = fixtureRepo(t);
  repo.write("upstream.ts", `export const joiner = "a${ZWSP}b";\nexport const plain = 2;\n`);
  repo.write("new.ts", "export const fine = true;\n");
  repo.commit("clean change");
  const result = run(repo.dir);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(findInvisibleChars({ cwd: repo.dir }).findings, []);
});

test("fails listing file:line:codepoint for added and modified files, skipping unchanged and binary files", (t) => {
  const repo = fixtureRepo(t);
  repo.write("upstream.ts", `export const joiner = "a${ZWSP}b";\nexport const plain = 1;\nexport const sneaky = "x${TAG_A}";\n`);
  repo.write("new.ts", `// ok\nconst label = "${RLO}evil";\nconst hy = "soft${SOFT_HYPHEN}hyphen";\n`);
  repo.write("blob.bin", Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(ZWSP)]));
  repo.commit("dirty change");
  const result = run(repo.dir, "main");
  assert.equal(result.status, 1);
  const listed = result.stderr.trim().split("\n").slice(1).sort();
  assert.deepEqual(listed, ["new.ts:2:U+202E", "new.ts:3:U+00AD", "upstream.ts:3:U+E0041"]);
});

test("defaults to the upstream pin, then origin/main, then main", (t) => {
  const repo = fixtureRepo(t);
  repo.write("new.ts", `const z = "${ZWSP}";\n`);
  repo.commit("dirty");
  assert.equal(findInvisibleChars({ cwd: repo.dir }).base, "main");
  repo.git("update-ref", "refs/remotes/origin/main", "HEAD");
  const viaOrigin = findInvisibleChars({ cwd: repo.dir });
  assert.equal(viaOrigin.base, "origin/main");
  assert.deepEqual(viaOrigin.findings, []);
});

test("exits 2 when the base ref does not exist", (t) => {
  const repo = fixtureRepo(t);
  const result = run(repo.dir, "no-such-ref");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /base ref not found: no-such-ref/);
});
