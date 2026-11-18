#!/usr/bin/env node
// Idle CPU/RSS sampler for the Ask panel budget (docs/ask-panel/DECISIONS.md D37, docs/ask-panel/TEST_PLAN.md).
// Usage: node scripts/bench-ask-idle.mjs --pattern "Iris Agent|openmausbot" --seconds 300 --interval 5
// Every interval it reads `ps -axo pid=,%cpu=,rss=,command=`, sums %CPU and RSS over processes whose command matches
// --pattern (this script's own process is left out), and finally prints one JSON object. macOS and Linux only.
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

export function parseArgs(argv) {
  const opts = { pattern: null, seconds: 300, interval: 5 };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === "--pattern") opts.pattern = value;
    else if (flag === "--seconds") opts.seconds = Number(value);
    else if (flag === "--interval") opts.interval = Number(value);
    else throw new Error(`unknown argument ${flag}`);
    i += 1;
  }
  if (!opts.pattern) throw new Error("--pattern is required");
  if (!(opts.seconds > 0) || !(opts.interval > 0)) throw new Error("--seconds and --interval must be positive numbers");
  return opts;
}

/** One sample from `ps` output: summed %CPU and RSS (KiB) of matching processes, excluding `selfPid`. */
export function sampleFromPs(text, pattern, selfPid = process.pid) {
  let cpu = 0, rssKb = 0, count = 0;
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
    if (!m || Number(m[1]) === selfPid || !pattern.test(m[4])) continue;
    cpu += Number(m[2]);
    rssKb += Number(m[3]);
    count += 1;
  }
  return { cpu, rssKb, count };
}

/** Nearest-rank percentile of a non-empty list. */
export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

const round = n => Math.round(n * 100) / 100;

export function summarize(samples) {
  if (!samples.length) return { samples: 0, meanCpu: null, p95Cpu: null, meanRssMB: null, maxRssMB: null };
  const cpu = samples.map(s => s.cpu), rssMB = samples.map(s => s.rssKb / 1024);
  return {
    samples: samples.length,
    meanCpu: round(cpu.reduce((a, b) => a + b, 0) / cpu.length),
    p95Cpu: round(percentile(cpu, 95)),
    meanRssMB: round(rssMB.reduce((a, b) => a + b, 0) / rssMB.length),
    maxRssMB: round(Math.max(...rssMB)),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pattern = new RegExp(opts.pattern);
  const samples = [];
  const end = Date.now() + opts.seconds * 1000;
  while (Date.now() < end) {
    const { stdout } = await run("ps", ["-axo", "pid=,%cpu=,rss=,command="], { maxBuffer: 16 * 1024 * 1024 });
    samples.push(sampleFromPs(stdout, pattern));
    await new Promise(resolve => setTimeout(resolve, opts.interval * 1000));
  }
  console.log(JSON.stringify(summarize(samples)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
