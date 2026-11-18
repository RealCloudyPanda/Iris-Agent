#!/usr/bin/env node
// Fails when a line this branch adds (relative to <base>...HEAD) carries an invisible or bidi control character.
// Lines already in the base are never checked, so upstream's existing functional uses stay as they are.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­᠎؜\u{E0000}-\u{E007F}]/gu;

export function codepoint(char) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

export function invisibleIn(text) {
  return [...text.matchAll(INVISIBLE)].map(([char]) => codepoint(char));
}

function unquote(raw) {
  if (!raw.startsWith('"')) return raw;
  const bytes = [];
  const body = raw.slice(1, -1);
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== "\\") { bytes.push(...Buffer.from(body[i])); continue; }
    const next = body[i + 1];
    if (/[0-7]/.test(next)) { bytes.push(parseInt(body.slice(i + 1, i + 4), 8)); i += 3; continue; }
    bytes.push(...Buffer.from({ n: "\n", t: "\t", '"': '"', "\\": "\\" }[next] ?? next));
    i += 1;
  }
  return Buffer.from(bytes).toString("utf8");
}

/** Added lines per file from `git diff -U0` output; binary files carry no `+` lines and so drop out. */
export function addedLines(diff) {
  const found = [];
  let file = null;
  let line = 0;
  for (const text of diff.split("\n")) {
    if (text.startsWith("+++ ")) {
      const target = text.slice(4);
      file = target === "/dev/null" ? null : unquote(target).replace(/^b\//, "");
    } else if (text.startsWith("@@ ")) {
      line = Number(/\+(\d+)/.exec(text)[1]);
    } else if (file && text.startsWith("+")) {
      found.push({ file, line, text: text.slice(1) });
      line += 1;
    }
  }
  return found;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

export function resolveBase(cwd, requested) {
  const candidates = requested ? [requested] : ["origin/companion", "companion"];
  for (const ref of candidates) {
    try {
      git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return ref;
    } catch {}
  }
  throw new Error(`base ref not found: ${candidates.join(" or ")}`);
}

export function findInvisibleChars({ cwd = process.cwd(), base } = {}) {
  const ref = resolveBase(cwd, base);
  const diff = git(cwd, ["-c", "core.quotePath=true", "diff", "--no-color", "--no-ext-diff", "--no-textconv",
    "--src-prefix=a/", "--dst-prefix=b/", "-U0", "--diff-filter=ACMR", `${ref}...HEAD`]);
  const findings = [];
  for (const { file, line, text } of addedLines(diff)) {
    for (const point of invisibleIn(text)) findings.push(`${file}:${line}:${point}`);
  }
  return { base: ref, findings };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const { base, findings } = findInvisibleChars({ base: process.argv[2] });
    if (findings.length) {
      console.error(`Invisible or bidi characters in lines added since ${base}:`);
      for (const finding of findings) console.error(finding);
      process.exit(1);
    }
    console.log(`No invisible or bidi characters in lines added since ${base}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
