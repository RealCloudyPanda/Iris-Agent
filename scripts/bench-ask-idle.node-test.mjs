import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs, percentile, sampleFromPs, summarize } from "./bench-ask-idle.mjs";

test("parseArgs reads pattern, seconds and interval, with defaults", () => {
  assert.deepEqual(parseArgs(["--pattern", "Iris"]), { pattern: "Iris", seconds: 300, interval: 5 });
  assert.deepEqual(parseArgs(["--pattern", "x", "--seconds", "60", "--interval", "2"]), { pattern: "x", seconds: 60, interval: 2 });
  assert.throws(() => parseArgs([]), /pattern/);
  assert.throws(() => parseArgs(["--pattern", "x", "--seconds", "0"]), /positive/);
});

test("sampleFromPs sums matching processes and skips its own pid", () => {
  const ps = [
    "  101  1.5  20480 /Applications/Iris Agent.app/Contents/MacOS/Iris Agent",
    "  102  0.5  10240 /Applications/Iris Agent.app/Contents/Frameworks/Iris Agent Helper",
    "  103  9.0  99999 /usr/bin/other",
    "  104  7.0  50000 node scripts/bench-ask-idle.mjs --pattern Iris Agent",
    "garbage",
  ].join("\n");
  assert.deepEqual(sampleFromPs(ps, /Iris Agent/, 104), { cpu: 2, rssKb: 30720, count: 2 });
});

test("percentile uses nearest rank", () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([3, 1, 2], 50), 2);
});

test("summarize reports mean and p95 CPU and mean and max RSS in MB", () => {
  const out = summarize([{ cpu: 1, rssKb: 1024 }, { cpu: 3, rssKb: 3072 }]);
  assert.deepEqual(out, { samples: 2, meanCpu: 2, p95Cpu: 3, meanRssMB: 2, maxRssMB: 3 });
  assert.deepEqual(summarize([]), { samples: 0, meanCpu: null, p95Cpu: null, meanRssMB: null, maxRssMB: null });
});
