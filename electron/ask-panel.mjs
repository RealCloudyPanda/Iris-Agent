import { PANEL_THEME } from "./panel-theme.mjs";
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

export function askPanelHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Ask Iris Agent</title><style>
${PANEL_THEME}
*{box-sizing:border-box}html,body{margin:0;background:transparent;overflow:hidden;font:13px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:var(--color-ink)}
#card{display:flex;flex-direction:column;gap:12px;max-height:360px;padding:16px;border:1px solid var(--color-hairline);border-radius:14px;background:var(--color-panel);overflow:auto}
.row{display:flex;gap:8px;align-items:center}.grow{flex:1;min-width:0}
.heading{display:flex;flex-direction:column;gap:4px;min-width:0}.heading strong{font-size:17px;font-weight:600}.heading span{color:var(--color-ink-secondary);font-size:12px}
select,textarea,button{font:inherit;color:var(--color-ink);background:var(--color-inset);border:1px solid var(--color-hairline);border-radius:8px}
select{padding:4px 8px;min-height:32px;max-width:100%}textarea{width:100%;resize:none;padding:12px;min-height:64px;max-height:110px}
textarea::placeholder{color:var(--color-ink-secondary);opacity:1}
button{padding:4px 12px;min-height:32px;border-radius:999px;cursor:pointer;transition:background-color 120ms ease-out}
button:hover:not(:disabled){background:color-mix(in srgb,var(--color-ink) 8%,var(--color-inset))}button:disabled{opacity:.5;cursor:default}
#send{background:var(--color-ink);border-color:var(--color-ink);color:var(--color-panel)}#send:hover:not(:disabled){background:color-mix(in srgb,var(--color-ink) 88%,var(--color-panel))}
:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}
label{display:flex;gap:8px;align-items:center;color:var(--color-ink-secondary)}input{accent-color:var(--color-focus)}
#why{color:var(--color-ink-secondary);font-size:12px;max-width:120px}
#picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;overflow:auto;max-height:150px}
#picker button{display:flex;flex-direction:column;gap:4px;padding:4px;text-align:start;border-radius:8px}#picker img{width:100%;height:70px;object-fit:contain}
#picker button[aria-selected=true]{border-color:var(--color-focus)}#picker span{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
#chip{display:flex;gap:8px;align-items:center}#chip img{height:44px;border-radius:8px;border:1px solid var(--color-hairline)}
#status{color:var(--color-ink-secondary);font-size:12px;min-height:16px}.error#status{color:var(--color-danger)}.needs-you#status{color:var(--color-warning)}
#status:empty::before{content:"Choose a bot, then ask about your screen."}
#status.sending::before,#status.thinking::before{content:"";display:inline-block;width:8px;height:8px;margin-inline-end:8px;border-radius:50%;background:currentColor}
#reply{white-space:pre-wrap;overflow:auto;overflow-wrap:anywhere;user-select:text;max-height:140px;font-size:15px;line-height:22px}#reply:empty{display:none}
#perm{color:var(--color-ink-secondary);font-size:12px}
[hidden]{display:none!important}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
</style></head><body><div id="card" role="dialog" aria-label="Ask Iris Agent">
<div class="heading"><strong>Iris Agent</strong><span>Ask about your screen</span></div>
<div class="row"><select id="bot" class="grow" aria-label="Bot"></select><button id="close" type="button" aria-label="Hide (Esc)">✕</button></div>
<textarea id="q" rows="2" aria-label="Your question" placeholder="What would you like to know?"></textarea>
<div class="row"><label class="grow"><input id="inc" type="checkbox" aria-keyshortcuts="Meta+I"> Include window (⌘I)</label><span id="why"></span><button id="send" type="button">Ask</button></div>
<div id="perm" hidden><span>Screen Recording is off for Iris Agent. Text asks still work.</span> <button id="settings" type="button">Open Privacy settings</button></div>
<div id="picker" role="listbox" aria-label="Windows" hidden></div>
<div id="chip" hidden><img id="shot" alt="Selected window preview"><button id="unchip" type="button" aria-label="Remove window">✕</button></div>
<div class="row"><span id="status" class="grow" role="status" aria-live="polite"></span><button id="open" type="button" hidden>Open chat</button></div>
<div id="reply" aria-live="polite"></div>
</div><script>
const api=window.ask,$=id=>document.getElementById(id);
const bot=$("bot"),q=$("q"),inc=$("inc"),picker=$("picker"),chip=$("chip"),status=$("status"),reply=$("reply");
const STATES={sending:"Sending…",thinking:"Thinking…","needs-you":"Needs you · Open chat",done:"Done",error:"Something went wrong"};
const ERRORS={"image-engine":"This chat's model can't see images. Send without the window or pick a Codex bot.",busy:"Still answering the last ask.","server-down":"Couldn't reach Iris Agent. Check the app and try again.",starting:"Iris Agent is starting.",refused:"The server refused the ask.",moved:"This computer's bots moved to My Cloud.",lost:"Lost the connection; the reply is in the chat.",upload:"The screenshot could not be uploaded.","no-bot":"That bot is gone.",failed:"Couldn't answer. Try again or open the chat."};
let bots=[],busy=false,captured=false,pick=0;
const capable=()=>bots.find(b=>b.id===bot.value)?.imageCapable===true;
function syncToggle(){const ok=capable();inc.disabled=!ok;$("why").textContent=ok?"":"This bot can't see images";if(!ok&&inc.checked){inc.checked=false;toggled()}bot.disabled=busy}
async function loadBots(){const r=await api.listBots();if(!r||r.error){setStatus("error",r?.error||"server-down");return}
 const keep=bot.value;bots=r.bots;bot.replaceChildren(...bots.map(b=>{const o=document.createElement("option");o.value=b.id;o.textContent=b.name;return o}));
 bot.value=bots.some(b=>b.id===keep)?keep:r.selected||"";syncToggle()}
function setStatus(state,error){status.className=state||"";status.textContent=state==="error"?(ERRORS[error]||STATES.error):(STATES[state]||"");
 $("open").hidden=!(state==="needs-you"||state==="done"||(state==="error"&&error==="lost"));busy=state==="sending"||state==="thinking";$("send").disabled=busy;syncToggle()}
async function toggled(){$("perm").hidden=true;picker.hidden=true;if(!inc.checked){pick++;captured=false;chip.hidden=true;await api.clearCapture();return}if(!captured)await showPicker()}
async function showPicker(){const r=await api.pickWindows();if(!inc.checked)return;if(r?.error==="screen-permission"){$("perm").hidden=false;return}
 if(!r||r.error){setStatus("error","failed");return}
 picker.replaceChildren(...r.windows.map(w=>{const b=document.createElement("button");b.type="button";b.setAttribute("role","option");const t=(w.app?w.app+" · ":"")+(w.name||"Untitled window");b.setAttribute("aria-label",t);
  if(w.preselected)b.setAttribute("aria-selected","true");const i=document.createElement("img");i.src=w.thumbnail;i.alt="";const s=document.createElement("span");s.textContent=t;b.append(i,s);
  b.addEventListener("click",()=>choose(w.id));return b}));picker.hidden=false;(picker.querySelector('[aria-selected="true"]')||picker.querySelector("button"))?.focus()}
async function choose(id){const mine=++pick;const r=await api.chooseWindow(id);if(mine!==pick||!inc.checked||r?.error==="stale")return;if(!r||r.error){setStatus("error","failed");return}$("shot").src=r.preview;captured=true;chip.hidden=false;picker.hidden=true;q.focus()}
async function send(){const text=q.value.trim();if(!text||busy||!bot.value)return;reply.textContent="";pick++;const r=await api.send({botId:bot.value,text});
 if(!r?.ok){setStatus("error",r?.error||"failed");return}q.value="";captured=false;chip.hidden=true;inc.checked=false;picker.hidden=true}
api.onUpdate(u=>{if(u.type==="shown"){loadBots();q.focus()}else if(u.type==="status")setStatus(u.state,u.error);else if(u.type==="reply")reply.textContent=u.text;
 else if(u.type==="preview"&&!u.dataUrl){captured=false;chip.hidden=true}});
bot.addEventListener("change",syncToggle);inc.addEventListener("change",toggled);$("send").addEventListener("click",send);
$("unchip").addEventListener("click",async()=>{pick++;captured=false;chip.hidden=true;await api.clearCapture();if(inc.checked)showPicker()});
const hide=()=>{pick++;captured=false;chip.hidden=true;api.close()};$("close").addEventListener("click",hide);$("open").addEventListener("click",()=>api.openChat());$("settings").addEventListener("click",()=>api.openPermissionSettings());
q.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();hide()}else if(e.metaKey&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==="i"&&!inc.disabled){e.preventDefault();inc.checked=!inc.checked;toggled()}});
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
  /** `onHide({ returnFocus })`: true when the panel had focus, so focus may go back to the previous app (D31). */
  const hide = ({ returnFocus = true } = {}) => {
    const focused = Boolean(live() && win.isVisible() && win.isFocused());
    if (live() && win.isVisible()) win.hide();
    onHide({ returnFocus: returnFocus && focused });
  };
  return {
    owns: contents => Boolean(live() && contents === win.webContents),
    visible,
    focused: () => Boolean(visible() && win.isFocused()),
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
