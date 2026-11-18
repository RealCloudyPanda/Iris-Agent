// Spike B: real Codex image turn through MausBot's own routes (isolated dev server). Logs timings and frame kinds, never image bytes.
// Usage: OMB_DATA_DIR=<scratch> OMB_PORT=19980 node --experimental-strip-types server/dev-server.ts, then node spike-b.mjs http://127.0.0.1:19980 out.png
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const [base, imgPath] = process.argv.slice(2);
const t0 = performance.now(), ms = () => Math.round(performance.now() - t0);
const j = async (r) => { const b = await r.text(); try { return [r.status, JSON.parse(b)]; } catch { return [r.status, b]; } };
let [st, made] = await j(await fetch(`${base}/api/bots`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Spike Codex", modelSelection: { instanceId: "codex", model: "gpt-6.1-sol" }, settings: { approvalMode: "ask" } }) }));
const bot = made.bot ?? made; console.log(ms(), "create bot", st, bot.id, JSON.stringify(bot.modelSelection), bot.approvalMode, "(must be ask)");
[st, made] = await j(await fetch(`${base}/api/attachments?uploadId=${randomUUID()}`, { method: "POST", headers: { "content-type": "image/png" }, body: readFileSync(imgPath) }));
console.log(ms(), "upload", st, JSON.stringify(made));
const text = `What is the ticket code shown in this screenshot, and what error is shown? Answer in two short lines. Do not run any tools.\n\n<attached-image path="${made.path}" name="screenshot.png" />`;
const sendId = randomUUID(), ac = new AbortController();
const events = await fetch(`${base}/api/events?screens=off`, { signal: ac.signal });
const reader = events.body.getReader(), dec = new TextDecoder();
let buf = "", sent = false, firstDelta = null, reply = "", kinds = {};
const timer = setTimeout(() => { console.log(ms(), "TIMEOUT"); ac.abort(); }, 240000);
try {
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = raw.split("\n").filter(l => l.startsWith("data:")).map(l => l.replace(/^data: ?/, "")).join("\n"); if (!data) continue;
      let f; try { f = JSON.parse(data); } catch { continue; }
      if (f.kind === "hello" && !sent) {
        sent = true;
        const [s2, r2] = await j(await fetch(`${base}/api/bots/${bot.id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, threadId: bot.threadId, sendId }) }));
        console.log(ms(), "send", s2, JSON.stringify(r2).slice(0, 200));
        continue;
      }
      const ev = f.kind === "runtime" ? f.event : null;
      if (ev && ev.threadId === bot.threadId) {
        kinds[ev.type] = (kinds[ev.type] || 0) + 1;
        if (ev.type === "content.delta" && ev.streamKind === "assistant_text") { firstDelta ??= ms(); reply += ev.delta; }
        if (ev.type === "item.completed" && ev.itemType === "assistant_text") reply = ev.text;
        if (ev.type === "request.opened") console.log(ms(), "APPROVAL REQUESTED", JSON.stringify(ev).slice(0, 300));
        if (ev.type === "turn.completed") { console.log(ms(), "turn.completed ok=", ev.ok, ev.error ?? ""); throw "done"; }
      }
    }
  }
} catch (e) { if (e !== "done") console.log(ms(), "stream end", String(e)); }
clearTimeout(timer); ac.abort();
console.log("first assistant delta at ms:", firstDelta); console.log("event types:", JSON.stringify(kinds)); console.log("REPLY:\n" + reply);
