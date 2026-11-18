import { fileURLToPath } from "node:url";

export const ASK_PANEL = Object.freeze({ width: 480, margin: 24, minHeight: 80, maxHeight: 360 });
const panels = new WeakSet();
export const isAskPanel = win => panels.has(win);

/** Bottom-centre of `workArea`, 480 wide, height clamped to the panel's range (D30). */
export function askPanelBounds(workArea, height) {
  const h = Math.min(ASK_PANEL.maxHeight, Math.max(ASK_PANEL.minHeight, Math.round(height)));
  return {
    x: Math.round(workArea.x + (workArea.width - ASK_PANEL.width) / 2),
    y: Math.round(workArea.y + workArea.height - ASK_PANEL.margin - h),
    width: ASK_PANEL.width,
    height: h,
  };
}

const LIGHT = "--panel:#f7f7f7;--border:#0000001f;--ink:#0d0d0d;--ink2:#444;--accent:#0b62c4;--warning:#8a5a00;--danger:#c02b3a;--field:#fff";

export function askPanelHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Ask MausBot</title><style>
:root{color-scheme:dark light;--panel:#161616;--border:#ffffff22;--ink:#fcfcfc;--ink2:#fcfcfcbf;--accent:#4aa3ff;--warning:#ffb340;--danger:#ff6b7a;--field:#0b0b0b}
@media (prefers-color-scheme: light){:root{${LIGHT}}}
*{box-sizing:border-box}html,body{margin:0;background:transparent;overflow:hidden;font:13px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:var(--ink)}
#card{display:flex;flex-direction:column;gap:8px;max-height:360px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--panel)}
.row{display:flex;gap:8px;align-items:center}.grow{flex:1;min-width:0}
select,textarea,button{font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--border);border-radius:8px}
select{padding:4px 6px}textarea{width:100%;resize:none;padding:8px;min-height:40px;max-height:110px}
button{padding:4px 10px;cursor:pointer}button:disabled{opacity:.5;cursor:default}
#send{background:var(--accent);border-color:var(--accent);color:#fff}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
label{display:flex;gap:6px;align-items:center;color:var(--ink2)}
#why{color:var(--ink2);font-size:12px}
#picker{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;overflow:auto;max-height:150px}
#picker button{display:flex;flex-direction:column;gap:2px;padding:4px;text-align:left}#picker img{width:100%;height:70px;object-fit:contain}
#picker span{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
#chip{display:flex;gap:6px;align-items:center}#chip img{height:44px;border-radius:4px;border:1px solid var(--border)}
#status{color:var(--ink2)}.error#status{color:var(--danger)}.needs-you#status{color:var(--warning)}
#reply{white-space:pre-wrap;overflow:auto;overflow-wrap:anywhere;user-select:text;max-height:140px}
[hidden]{display:none!important}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
</style></head><body><div id="card" role="dialog" aria-label="Ask MausBot">
<div class="row"><select id="bot" class="grow" aria-label="Bot"></select><button id="close" type="button" aria-label="Hide (Esc)">✕</button></div>
<textarea id="q" rows="2" aria-label="Your question" placeholder="Ask… (Enter sends, Shift+Enter for a new line)"></textarea>
<div class="row"><label class="grow"><input id="inc" type="checkbox" aria-keyshortcuts="Meta+I"> Include window (⌘I)</label><span id="why"></span><button id="send" type="button">Send</button></div>
<div id="perm" hidden><span>Screen Recording is off for MausBot. Text asks still work.</span> <button id="settings" type="button">Open Privacy settings</button></div>
<div id="picker" role="listbox" aria-label="Windows" hidden></div>
<div id="chip" hidden><img id="shot" alt="Selected window preview"><button id="unchip" type="button" aria-label="Remove window">✕</button></div>
<div class="row"><span id="status" class="grow" role="status" aria-live="polite"></span><button id="open" type="button" hidden>Open chat</button></div>
<div id="reply" aria-live="polite"></div>
</div><script>
const api=window.ask,$=id=>document.getElementById(id);
const bot=$("bot"),q=$("q"),inc=$("inc"),picker=$("picker"),chip=$("chip"),status=$("status"),reply=$("reply");
const STATES={sending:"Sending…",thinking:"Thinking…","needs-you":"Needs you · Open chat",done:"Done",error:"Something went wrong"};
const ERRORS={busy:"Still answering the last ask.","server-down":"MausBot's server is not reachable.",starting:"MausBot is starting.",refused:"The server refused the ask.",moved:"This computer's bots moved to My Cloud.",lost:"Lost the connection; the reply is in the chat.",upload:"The screenshot could not be uploaded.","no-bot":"That bot is gone.",failed:"The turn failed."};
let bots=[],busy=false,captured=false;
const capable=()=>bots.find(b=>b.id===bot.value)?.imageCapable===true;
function syncToggle(){const ok=capable();inc.disabled=!ok;$("why").textContent=ok?"":"This bot can't see images";if(!ok&&inc.checked){inc.checked=false;toggled()}bot.disabled=busy}
async function loadBots(){const r=await api.listBots();if(!r||r.error){setStatus("error",r?.error||"server-down");return}
 const keep=bot.value;bots=r.bots;bot.replaceChildren(...bots.map(b=>{const o=document.createElement("option");o.value=b.id;o.textContent=b.name;return o}));
 bot.value=bots.some(b=>b.id===keep)?keep:r.selected||"";syncToggle()}
function setStatus(state,error){status.className=state||"";status.textContent=state==="error"?(ERRORS[error]||STATES.error):(STATES[state]||"");
 $("open").hidden=!(state==="needs-you"||state==="done"||(state==="error"&&error==="lost"));busy=state==="sending"||state==="thinking";$("send").disabled=busy;syncToggle()}
async function toggled(){$("perm").hidden=true;picker.hidden=true;if(!inc.checked){captured=false;chip.hidden=true;await api.clearCapture();return}if(!captured)await showPicker()}
async function showPicker(){const r=await api.pickWindows();if(!inc.checked)return;if(r?.error==="screen-permission"){$("perm").hidden=false;return}
 if(!r||r.error){setStatus("error","failed");return}
 picker.replaceChildren(...r.windows.map(w=>{const b=document.createElement("button");b.type="button";b.setAttribute("role","option");b.setAttribute("aria-label",w.name||"Window");
  const i=document.createElement("img");i.src=w.thumbnail;i.alt="";const s=document.createElement("span");s.textContent=w.name||"Untitled window";b.append(i,s);
  b.addEventListener("click",()=>choose(w.id));return b}));picker.hidden=false;picker.querySelector("button")?.focus()}
async function choose(id){const r=await api.chooseWindow(id);if(!r||r.error){setStatus("error","failed");return}$("shot").src=r.preview;captured=true;chip.hidden=false;picker.hidden=true;q.focus()}
async function send(){const text=q.value.trim();if(!text||busy||!bot.value)return;reply.textContent="";const r=await api.send({botId:bot.value,text});
 if(!r?.ok){setStatus("error",r?.error||"failed");return}q.value="";captured=false;chip.hidden=true;inc.checked=false;picker.hidden=true}
api.onUpdate(u=>{if(u.type==="shown"){loadBots();q.focus()}else if(u.type==="status")setStatus(u.state,u.error);else if(u.type==="reply")reply.textContent=u.text;
 else if(u.type==="preview"&&!u.dataUrl){captured=false;chip.hidden=true}});
bot.addEventListener("change",syncToggle);inc.addEventListener("change",toggled);$("send").addEventListener("click",send);
$("unchip").addEventListener("click",async()=>{captured=false;chip.hidden=true;await api.clearCapture();if(inc.checked)showPicker()});
$("close").addEventListener("click",()=>api.close());$("open").addEventListener("click",()=>api.openChat());$("settings").addEventListener("click",()=>api.openPermissionSettings());
q.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();api.close()}else if(e.metaKey&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==="i"&&!inc.disabled){e.preventDefault();inc.checked=!inc.checked;toggled()}});
new ResizeObserver(()=>api.fit(Math.ceil($("card").getBoundingClientRect().height))).observe($("card"));
</script></body></html>`;
}

/** The focusable Ask panel, made on first show, then hidden and shown. Esc hides it; a running ask continues. */
export function createAskPanel({ BrowserWindow, screen, onHide = () => {} }) {
  let win = null, area = null, height = ASK_PANEL.minHeight, page = null;
  const live = () => win && !win.isDestroyed();

  function create() {
    page ??= `data:text/html;charset=utf-8,${encodeURIComponent(askPanelHtml())}`;
    const target = new BrowserWindow({
      type: "panel", ...askPanelBounds(area, height), frame: false, transparent: true, backgroundColor: "#00000000",
      focusable: true, skipTaskbar: true, hasShadow: false, resizable: false, movable: false, minimizable: false,
      maximizable: false, fullscreenable: false, show: false, hiddenInMissionControl: true,
      webPreferences: {
        contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true,
        preload: fileURLToPath(new URL("./ask-panel-preload.cjs", import.meta.url)),
      },
    });
    panels.add(target);
    target.excludedFromShownWindowsMenu = true;
    target.setAlwaysOnTop(true, "screen-saver");
    target.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    target.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    target.webContents.on("will-navigate", event => event.preventDefault());
    target.webContents.on("did-finish-load", () => { if (win === target) target.webContents.send("ask:update", { type: "shown" }); });
    target.on("closed", () => { if (win === target) win = null; });
    target.loadURL(page).catch(() => {});
    return target;
  }

  const visible = () => Boolean(live() && win.isVisible());
  const show = () => {
    area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    if (!live()) win = create();
    else win.webContents.send("ask:update", { type: "shown" });
    win.setBounds(askPanelBounds(area, height));
    win.show();
    win.focus();
  };
  const hide = () => {
    if (live() && win.isVisible()) win.hide();
    onHide();
  };
  return {
    owns: contents => Boolean(live() && contents === win.webContents),
    visible,
    show,
    hide,
    toggle: () => (visible() && win.isFocused() ? hide() : show()),
    fit(next) {
      height = next;
      if (live() && area) win.setBounds(askPanelBounds(area, height));
    },
    send(channel, payload) { if (live()) win.webContents.send(channel, payload); },
    close() {
      if (live()) win.destroy();
      win = null;
    },
  };
}
