// The `ove ai studio` page: a small product around projects. Projects are folders in the out folder; the editor previews one live with
// the Player and edits its own composition file. Self-contained (no build step, no framework, no remote assets). The script uses no
// backticks, ${} or backslashes, so the whole page can live inside this template string.
export const aiStudioPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MotionRender Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#000000;
  --bg-gradient:radial-gradient(circle at 50% -10%,rgba(59,130,246,0.06) 0%,transparent 55%),#000000;
  --panel:#111216;
  --panel-solid:#111216;
  --panel2:#181920;
  --panel2-solid:#181920;
  --line:rgba(255,255,255,0.08);
  --line-hover:rgba(255,255,255,0.16);
  --text:#ededed;
  --muted:#a1a1aa;
  --dim:#82828a;
  --accent:#3b82f6;
  --accent-glow:rgba(59,130,246,0.25);
  --accent2:#818cf8;
  --ok:#10b981;
  --warn:#fbbf24;
  --err:#ef4444;
  --radius:22px;
  --radius-sm:10px;
  --radius-lg:14px;
  --focus-ring:oklab(0.820314 0.0000373721 0.0000163913 / 0.5);
}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:400 15px/1.55 "Geist",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;letter-spacing:-.015em;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased}
:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:999px}::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.24)}
a{color:var(--text);text-decoration:none;transition:color .15s}a:hover{color:#fff}
header.top{display:flex;align-items:center;gap:16px;padding:0 24px;height:64px;border-bottom:1px solid var(--line);background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);flex:none;z-index:10}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;color:var(--text);letter-spacing:-.03em}
.mark{font:800 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#fff;background:rgba(255,255,255,0.1);border:1px solid var(--line);padding:6px 9px;border-radius:6px}
.vpill{font-size:11px;font-weight:600;color:var(--muted);background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:999px;border:1px solid var(--line)}
nav.main{display:flex;gap:4px;background:rgba(255,255,255,0.03);padding:3px;border-radius:999px;border:1px solid var(--line)}
nav.main a{color:var(--muted);padding:6px 14px;border-radius:999px;font-size:13px;font-weight:500;transition:all .15s}
nav.main a:hover{color:var(--text);background:rgba(255,255,255,0.05)}
nav.main a.on{color:#fff;background:rgba(255,255,255,0.1);border:1px solid var(--line)}
.grow{flex:1}
.pbadge{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);background:rgba(255,255,255,0.03);border:1px solid var(--line);padding:4px 10px;border-radius:999px;text-decoration:none;transition:all .15s}
.pbadge:hover{border-color:var(--line-hover);color:var(--text)}
.pdot{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok)}
.busy{display:none;align-items:center;gap:9px;color:var(--muted);font-size:12.5px;max-width:320px;background:rgba(255,255,255,0.04);border:1px solid var(--line);padding:4px 11px;border-radius:999px}
.busy.on{display:flex}.busy span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spin{width:12px;height:12px;border:2px solid rgba(255,255,255,0.15);border-top-color:var(--accent);border-radius:50%;animation:rot .8s linear infinite;flex:none}@keyframes rot{to{transform:rotate(360deg)}}
#app{flex:1;min-height:0;overflow:auto}
.page{max-width:1160px;margin:0 auto;padding:32px 24px 64px}
.hero{margin-bottom:28px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
h1{margin:0 0 6px;font-size:28px;font-weight:700;letter-spacing:-.03em;color:#fff}
h2{margin:0 0 10px;font-size:18px;font-weight:600;letter-spacing:-.02em}
.lead{color:var(--muted);margin:0;font-size:14.5px}
button{font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}
.btn{background:#ffffff;color:#000000;border:0;border-radius:10px;padding:8px 18px;font-weight:600;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,0.3);transition:all 150ms;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.btn:hover{background:#f4f4f5;box-shadow:0 4px 14px rgba(255,255,255,0.22);transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn.sec{background:rgba(255,255,255,0.04);color:var(--text);border:1px solid var(--line);font-weight:500;box-shadow:none}
.btn.sec:hover{background:rgba(255,255,255,0.09);border-color:var(--line-hover);filter:none}
.btn.sm{padding:6px 12px;font-size:13px;border-radius:8px}
.btn.danger{color:#fda4af}.btn.danger:hover{background:rgba(244,63,94,0.15);border-color:rgba(244,63,94,0.3)}
input,textarea,select{width:100%;background:rgba(255,255,255,0.04);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:9px 12px;font:inherit;transition:border-color .15s,box-shadow .15s}
textarea{resize:vertical;min-height:96px;font-size:13.5px}
input:focus,textarea:focus,select:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
input[type=color]{padding:2px;height:36px;width:64px;border-radius:6px}input[type=checkbox]{width:auto}
label.f{display:block;margin:0 0 16px}label.f>span{display:block;color:var(--muted);font-size:12.5px;font-weight:500;margin-bottom:6px}
.bar{display:flex;align-items:center;gap:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:20px}
.card{background:#111216;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:9px;overflow:hidden;display:flex;flex-direction:column;transition:all .25s ease;box-shadow:0 16px 36px -12px rgba(0,0,0,0.6)}
.card:hover{border-color:rgba(255,255,255,0.22);transform:translateY(-3px);box-shadow:0 24px 48px -12px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.08)}
.thumb{aspect-ratio:16/10;background:#090a0f;border-radius:16px;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;position:relative;border:1px solid rgba(255,255,255,0.04)}
.thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s ease}
.card:hover .thumb img{transform:scale(1.03)}
.thumb .ph{color:var(--dim);font-size:12px;display:flex;align-items:center;gap:6px}
.tbadge{position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);color:#fff;font-size:11px;font-weight:600;padding:2px 7px;border-radius:5px;border:1px solid rgba(255,255,255,0.1)}
.abadge{position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);color:var(--muted);font-size:10.5px;font-weight:500;padding:2px 7px;border-radius:5px;border:1px solid rgba(255,255,255,0.1)}
.cardbody{padding:14px 16px 12px;display:flex;flex-direction:column;gap:5px;flex:1}
.cardbody b{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff}
.meta{color:var(--muted);font-size:12.5px;display:flex;align-items:center;gap:6px}
.cardfoot{display:flex;gap:6px;padding:0 14px 14px;border-top:1px solid rgba(255,255,255,0.04);padding-top:10px}
.tag{display:inline-block;font-size:11px;font-weight:500;background:rgba(255,255,255,0.04);border:1px solid var(--line);border-radius:999px;padding:1px 8px;color:var(--muted)}
.tag.ok{color:var(--ok);border-color:rgba(52,211,153,0.3);background:rgba(52,211,153,0.06)}
.empty{text-align:center;padding:70px 24px;border:1px dashed var(--line);border-radius:16px;background:rgba(15,22,34,0.4);color:var(--muted)}
.empty h2{color:var(--text);font-size:20px;margin-bottom:8px}
.empty-icon{font-size:36px;margin-bottom:12px;display:block}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:18px}
.tile{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:14px 12px;text-align:left;color:var(--text);transition:all .15s}
.tile:hover{border-color:var(--line-hover);background:rgba(255,255,255,0.03)}
.tile b{display:block;font-size:14px;margin-bottom:3px;color:#fff}
.tile span{color:var(--muted);font-size:12px;line-height:1.4;display:block}
.tile.on{border-color:var(--accent);background:rgba(45,212,191,0.08);box-shadow:0 0 14px rgba(45,212,191,0.15)}
.tile.on b{color:var(--accent)}
.chips{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 18px}
.chip{background:rgba(255,255,255,0.03);border:1px solid var(--line);color:var(--muted);border-radius:999px;padding:5px 13px;font-size:12.5px;transition:all .15s}
.chip:hover{color:var(--text);border-color:rgba(45,212,191,0.4);background:rgba(45,212,191,0.05);transform:translateY(-1px)}
.drop{border:1px dashed rgba(255,255,255,0.16);border-radius:10px;padding:22px;text-align:center;color:var(--muted);background:var(--panel2);transition:all .15s}
.drop:hover,.drop.over{border-color:var(--accent);color:var(--text);background:rgba(45,212,191,0.04)}
.files{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.files span{background:rgba(255,255,255,0.06);border:1px solid var(--line);border-radius:6px;padding:4px 10px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px}
details{margin:8px 0 20px;background:rgba(255,255,255,0.02);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
details summary{cursor:pointer;color:var(--muted);font-weight:500;user-select:none}
details summary:hover{color:var(--text)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.narrow{max-width:740px}
.err{color:#fda4af;background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.3);border-radius:8px;padding:12px 14px;white-space:pre-wrap;margin:12px 0;font-size:13px}
.note{color:#fef08a;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 14px;font-size:13px;margin:12px 0}
.box-info{color:#a5f3fc;background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.25);border-radius:8px;padding:10px 14px;font-size:13px;margin:12px 0}
.log{background:var(--panel2-solid);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font:12.5px/1.6 ui-monospace,Consolas,monospace;color:#93c5fd;max-height:260px;overflow:auto;white-space:pre-wrap}
.center{max-width:580px;margin:80px auto;text-align:center}
.center .spin{width:40px;height:40px;border-width:3px;margin:0 auto 24px;border-top-color:var(--accent)}
/* creation mode switch */
.mode-switch{display:flex;gap:4px;background:rgba(255,255,255,0.03);border:1px solid var(--line);padding:4px;border-radius:10px;margin-bottom:24px}
.mode-switch button{flex:1;background:transparent;border:0;color:var(--muted);padding:8px 14px;border-radius:8px;font-size:13.5px;font-weight:600;transition:all .15s}
.mode-switch button:hover{color:var(--text)}
.mode-switch button.on{color:#fff;background:rgba(255,255,255,0.1);box-shadow:0 2px 6px rgba(0,0,0,0.3)}
/* editor */
.editor{display:grid;grid-template-columns:minmax(0,1fr) 420px;height:100%;min-height:0}
.stage{display:flex;flex-direction:column;min-width:0;min-height:0;padding:16px 22px;gap:12px;overflow:auto}
.etop{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.back-link{color:var(--muted);font-size:13px;font-weight:500;padding:5px 9px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid var(--line)}
.back-link:hover{color:var(--text);border-color:var(--line-hover)}
.etop input{font-size:17px;font-weight:700;color:#fff;background:transparent;border:1px solid transparent;width:auto;min-width:220px;padding:4px 8px;border-radius:6px}
.etop input:hover,.etop input:focus{border-color:var(--line);background:var(--panel2)}
.saved{color:var(--muted);font-size:12.5px;font-weight:500}
.screen{background:#000;border-radius:14px;overflow:hidden;display:flex;justify-content:center;border:1px solid var(--line);box-shadow:0 8px 30px rgba(0,0,0,0.6);position:relative}
#stage-player{width:100%;max-width:880px}
#stage-player .ove-player{margin:0 auto}
#stage-player canvas{max-height:56vh;margin:0 auto;width:auto!important;max-width:100%;box-shadow:0 0 30px rgba(0,0,0,0.8)}
.xport{display:flex;align-items:center;gap:12px;background:rgba(15,22,34,0.6);border:1px solid var(--line);border-radius:10px;padding:8px 14px}
.xport input[type=range]{flex:1;padding:0;accent-color:var(--accent);height:6px;cursor:pointer}
.xport .t{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12.5px;min-width:96px;text-align:right;font-family:ui-monospace,Consolas,monospace}
.scenes{display:flex;gap:8px;overflow:auto;padding-bottom:4px}
.scenes button{background:rgba(255,255,255,0.03);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:7px 12px;white-space:nowrap;font-size:12.5px;font-weight:500;transition:all .15s}
.scenes button:hover{border-color:rgba(45,212,191,0.4);background:rgba(45,212,191,0.05);transform:translateY(-1px)}
.scenes small{color:var(--dim);margin-left:6px;font-family:ui-monospace,Consolas,monospace}
.side{border-left:1px solid var(--line);background:var(--panel);backdrop-filter:blur(20px);display:flex;flex-direction:column;min-height:0}
.tabs{display:flex;border-bottom:1px solid var(--line);padding:0 8px;gap:2px}
.tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);padding:14px 12px;font-size:13px;font-weight:600;transition:all .15s}
.tabs button:hover{color:var(--text)}
.tabs button.on{color:var(--accent);border-bottom-color:var(--accent)}
.pane{padding:20px;overflow:auto;min-height:0;flex:1}
.hist{border-top:1px solid var(--line);padding:12px 0;display:flex;gap:10px;align-items:flex-start;justify-content:space-between}
.hist b{font-size:13.5px;color:#fff}.hist small{display:block;color:var(--muted);margin-top:2px}
.themes{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.theme{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--panel2);color:var(--text);text-align:left;transition:all .15s}
.theme:hover{border-color:rgba(45,212,191,0.4);transform:translateY(-1px)}
.sw{display:flex;height:24px;border-radius:6px;overflow:hidden;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.4)}
.sw i{flex:1}
.blocklist{display:flex;flex-direction:column;gap:8px}
.block{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--panel2);transition:all .15s}
.block:hover{border-color:var(--line-hover)}
.block b{font-size:13.5px;color:#fff}.block small{display:block;color:var(--muted);margin-top:2px}
.result video,.result img{width:100%;border-radius:10px;border:1px solid var(--line);background:#000;margin-top:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5)}
.cat{margin:28px 0 10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:11.5px;font-weight:700}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#131c2a;border:1px solid #2a3c54;color:#fff;border-radius:10px;padding:11px 18px;z-index:99;max-width:80vw;box-shadow:0 10px 30px rgba(0,0,0,0.6);font-size:13.5px;font-weight:500;animation:toastIn .2s ease}
.toast.bad{background:#2a1117;border-color:#5c1d29;color:#fecdd3}
@keyframes toastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
.modal{position:fixed;inset:0;background:rgba(2,4,8,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:80}.modal>div{background:var(--panel-solid);border:1px solid var(--line);border-radius:14px;padding:24px;width:min(460px,92vw);box-shadow:0 20px 40px rgba(0,0,0,0.8)}
.pills{display:flex;gap:8px;overflow-x:auto;padding:14px 0;margin:16px 0 24px;border-top:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06)}
.pill{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,0.04);color:var(--muted);border:1px solid rgba(255,255,255,0.08);border-radius:999px;padding:6px 14px;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;transition:all .15s}
.pill:hover{color:#fff;background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.18)}
.pill.on{background:#fff;color:#09090b;border-color:#fff;font-weight:600;box-shadow:0 4px 12px rgba(255,255,255,0.25)}
.pill .cnt{font-size:11px;font-weight:600;padding:1px 6px;border-radius:999px;background:rgba(255,255,255,0.12)}
.pill.on .cnt{background:rgba(0,0,0,0.12);color:#09090b}
.bcard{background:#111216;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:10px;display:flex;flex-direction:column;transition:all .25s ease;cursor:pointer;position:relative;box-shadow:0 16px 36px -12px rgba(0,0,0,0.6)}
.bcard:hover{border-color:rgba(255,255,255,0.22);transform:translateY(-4px);box-shadow:0 24px 48px -12px rgba(0,0,0,0.8)}
.bmedia{border-radius:16px;aspect-ratio:16/10;overflow:hidden;position:relative;background:#090a0f;display:flex;align-items:center;justify-content:center}
.bprompt{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:8px 10px;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.45;font-style:italic;margin-top:6px}
.bacts{display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05)}
.bcopy{flex:1;background:rgba(255,255,255,0.05);color:var(--text);border:1px solid rgba(255,255,255,0.1);border-radius:9px;padding:7px 10px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.bcopy:hover{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2)}
.brender{flex:1;background:#fff;color:#09090b;border:1px solid #fff;border-radius:9px;padding:7px 10px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.brender:hover{opacity:.9;transform:translateY(-1px)}
.smodal{position:fixed;inset:0;background:rgba(0,0,0,0.78);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;z-index:90;padding:20px;overflow-y:auto}
.sdialog{background:#111216;border:1px solid rgba(255,255,255,0.12);border-radius:26px;width:min(820px,94vw);max-height:90vh;overflow-y:auto;padding:26px;display:flex;flex-direction:column;gap:18px;position:relative}
.sclose{position:absolute;top:18px;right:18px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--muted);display:flex;align-items:center;justify-content:center;cursor:pointer}
.sclose:hover{background:rgba(255,255,255,0.12);color:#fff}
.sprompt{background:#090a0f;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;font:13px/1.6 ui-monospace,Consolas,monospace;color:#e2e8f0;white-space:pre-wrap;word-break:break-word}
@media (max-width:960px){.editor{grid-template-columns:1fr;height:auto}.side{border-left:0;border-top:1px solid var(--line)}header.top{gap:10px;padding:0 12px}.busy{display:none!important}}
</style></head><body>
<header class="top">
<a class="brand" href="#/"><span class="mark">MR</span> MotionRender <span class="vpill">AI Studio</span></a>
<nav class="main"><a href="#/showcase" data-nav="showcase">Inspiration</a><a href="#/" data-nav="home">Projects</a><a href="#/library" data-nav="library">Library</a><a href="#/settings" data-nav="settings">Settings</a></nav>
<div class="grow"></div>
<a class="pbadge" id="pbadge" href="#/settings"><span class="pdot"></span><span id="pbadgetext">AI Ready</span></a>
<div class="busy" id="busy"><div class="spin"></div><span id="busytext"></span></div>
<a class="btn" href="#/new">+ New Video</a>
</header>
<div id="app"></div>
<script>
var $ = function (s, r) { return (r || document).querySelector(s); };
function h(tag, attrs, kids) {
  var el = document.createElement(tag);
  for (var k in (attrs || {})) { var v = attrs[k]; if (v === false || v == null) continue; if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v); }
  [].concat(kids == null ? [] : kids).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function api(path, body) {
  var opt = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  return fetch(path, opt).then(function (r) { return r.text().then(function (t) { var j = {}; try { j = JSON.parse(t); } catch (e) { j = { error: t }; } if (!r.ok) throw new Error(j.error || r.statusText); return j; }); });
}
function toast(msg, bad) { var t = h('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, bad ? 6000 : 2800); }
function ago(ms) { var s = Math.max(1, Math.round((Date.now() - ms) / 1000)); if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago'; }
function dur(sec) { var m = Math.floor(sec / 60), s = Math.round(sec - m * 60); return m ? m + ':' + (s < 10 ? '0' : '') + s : s + 's'; }
function ask(title, value, ok) {
  var input = h('input', { value: value || '' }), m = h('div', { class: 'modal' }, h('div', null, [h('h2', { text: title }), input, h('div', { class: 'bar', style: 'margin:18px 0 0;justify-content:flex-end' }, [
    h('button', { class: 'btn sec', text: 'Cancel', onclick: function () { m.remove(); } }), h('button', { class: 'btn', text: 'OK', onclick: function () { m.remove(); ok(input.value.trim()); } })])]));
  document.body.appendChild(m); input.focus(); input.select(); input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { m.remove(); ok(input.value.trim()); } if (e.key === 'Escape') m.remove(); });
}
function confirmBox(text, ok) { var m = h('div', { class: 'modal' }, h('div', null, [h('p', { text: text, style: 'font-size:15px;line-height:1.5;margin:0 0 16px' }), h('div', { class: 'bar', style: 'justify-content:flex-end' }, [h('button', { class: 'btn sec', text: 'Cancel', onclick: function () { m.remove(); } }), h('button', { class: 'btn', text: 'Yes, proceed', onclick: function () { m.remove(); ok(); } })])])); document.body.appendChild(m); }

/* provider status polling in top bar */
function updateStatusBadge() {
  api('/api/status').then(function (s) {
    var ptext = $('#pbadgetext'); if (!ptext) return;
    if (s.provider) ptext.textContent = (s.provider.id === 'freellmapi' ? '🚀 FreeLLMAPI · ' : '✨ ' + s.provider.id + ' · ') + s.provider.model;
    else ptext.textContent = '📋 Paste JSON mode';
  }, function () {});
}

/* jobs: one event stream, a promise per job */
var jobs = {}, jobWaiters = {};
function onJob(job) {
  jobs[job.id] = job; var running = Object.keys(jobs).map(function (k) { return jobs[k]; }).filter(function (j) { return j.status === 'running' || j.status === 'queued'; });
  $('#busy').classList.toggle('on', running.length > 0); var last = running[0]; $('#busytext').textContent = last ? (last.messages.length ? last.messages[last.messages.length - 1] : 'Working on ' + last.kind + '…') : '';
  (jobWaiters[job.id] || []).forEach(function (w) { w.progress(job); if (job.status === 'done') w.ok(job); if (job.status === 'error') w.fail(new Error(job.error || 'Failed')); });
  if (job.status === 'done' || job.status === 'error') delete jobWaiters[job.id];
}
function connect() {
  var es = new EventSource('/api/events');
  es.addEventListener('snapshot', function (e) { JSON.parse(e.data).jobs.forEach(onJob); });
  es.addEventListener('job', function (e) { onJob(JSON.parse(e.data)); });
}
function waitJob(job, progress) {
  return new Promise(function (ok, fail) {
    var cur = jobs[job.id] || job; if (cur.status === 'done') return ok(cur); if (cur.status === 'error') return fail(new Error(cur.error));
    (jobWaiters[job.id] = jobWaiters[job.id] || []).push({ ok: ok, fail: fail, progress: progress || function () {} });
    var poll = setInterval(function () { if (!jobWaiters[job.id]) return clearInterval(poll); api('/api/job?id=' + job.id).then(function (r) { onJob(r.job); }, function () {}); }, 3500);
  });
}
function run(path, body, progress) { return api(path, body).then(function (r) { return waitJob(r.job, progress); }).then(function (j) { return j.result; }); }

/* routes */
var app = $('#app'), cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  var hash = location.hash.replace('#', '') || '/', parts = hash.split('/').filter(Boolean), view = parts[0] || 'home';
  document.querySelectorAll('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === (view === 'new' || view === 'p' ? 'home' : view)); });
  app.innerHTML = ''; app.scrollTop = 0;
  var go = { home: home, new: create, library: library, settings: settings, showcase: showcase }[view];
  if (view === 'p' && parts[1]) return editor(decodeURIComponent(parts[1]), parts[2]);
  if (view === 'making' && parts[1]) return making(decodeURIComponent(parts[1]), parts[2]);
  (go || home)();
}
window.addEventListener('hashchange', route);
function fail(el, e) { el.appendChild(h('div', { class: 'err', text: e && e.message ? e.message : String(e) })); }

/* projects dashboard */
function home() {
  var page = h('div', { class: 'page' }); app.appendChild(page);
  var hero = h('div', { class: 'hero' }, [
    h('div', null, [h('h1', { text: 'Your Videos' }), h('p', { class: 'lead', text: 'All your video projects. Click any project to open the live editor, re-style it, or export MP4.' })]),
    h('div', { class: 'bar' }, [h('a', { class: 'btn', href: '#/new', text: '+ New video' })])
  ]);
  page.appendChild(hero);
  api('/api/projects').then(function (r) {
    if (!r.projects.length) {
      page.appendChild(h('div', { class: 'empty' }, [
        h('span', { class: 'empty-icon', text: '🎬' }),
        h('h2', { text: 'No video projects yet' }),
        h('p', { class: 'lead', style: 'margin-bottom:20px', text: 'Describe an idea with AI, or paste composition JSON generated in ChatGPT or Claude.' }),
        h('a', { class: 'btn', href: '#/new', text: 'Create your first video' })
      ]));
      return;
    }
    var grid = h('div', { class: 'grid' }); r.projects.forEach(function (p) { grid.appendChild(card(p)); }); page.appendChild(grid);
    [].reduce.call(grid.querySelectorAll('img'), function (chain, img) { return chain.then(function () { return new Promise(function (ok) { img.onload = img.onerror = ok; img.src = img.getAttribute('data-src'); }); }); }, Promise.resolve());
  }, function (e) { fail(page, e); });
}
function card(p) {
  var open = function () { location.hash = '#/p/' + encodeURIComponent(p.id); };
  var img = h('img', { 'data-src': '/api/thumb?id=' + encodeURIComponent(p.id), alt: '' });
  img.addEventListener('error', function () { img.replaceWith(h('div', { class: 'ph', text: '▶ Preview' })); });
  var aspectLabel = p.width < p.height ? '9:16 vertical' : p.width === p.height ? '1:1 square' : '16:9 wide';
  return h('div', { class: 'card' }, [
    h('div', { class: 'thumb', onclick: open }, [
      img,
      h('span', { class: 'abadge', text: aspectLabel }),
      h('span', { class: 'tbadge', text: '▶ ' + dur(p.seconds) })
    ]),
    h('div', { class: 'cardbody' }, [
      h('b', { text: p.name, title: p.name }),
      h('div', { class: 'meta', text: p.width + '×' + p.height + ' · ' + p.scenes + ' scene(s)' }),
      h('div', { class: 'meta' }, ['Edited ' + ago(p.modified) + ' ', h('span', { class: 'tag' + (p.mode === 'template' ? ' ok' : ''), text: p.mode === 'template' ? 'editable text' : 'custom' })])
    ]),
    h('div', { class: 'cardfoot' }, [
      h('button', { class: 'btn sm', text: 'Open Studio', onclick: open }),
      h('button', { class: 'btn sec sm', text: 'Duplicate', onclick: function () { api('/api/project/duplicate', { id: p.id }).then(function () { toast('Duplicated project'); route(); }, function (e) { toast(e.message, true); }); } }),
      h('button', { class: 'btn sec sm danger', text: 'Delete', onclick: function () { confirmBox('Delete "' + p.name + '"? It moves to .trash folder.', function () { api('/api/project/delete', { id: p.id }).then(function () { toast('Deleted'); route(); }, function (e) { toast(e.message, true); }); }); } })
    ])
  ]);
}

/* inspiration & prompt showcase (prompt-motion style) */
var showcaseItems = [
  { id: 'ui-morph', title: 'Shape Morphing Through UI States', cat: 'Product UI', aspect: '16:9', dur: '12s', fps: 60, author: '@twoclipping', av: 'TC', model: 'Claude Opus 5.5', grad: 'linear-gradient(135deg,#090d16 0%,#1e1b4b 50%,#0f172a 100%)', color: '#818cf8', prompt: 'Make an ultra-clean 12-second SaaS UI animation demonstrating shape morphing across three states: idle state with glowing status indicator, active state where cards expand fluidly with spring physics, and success celebration with kinetic particle pop. Use sleek dark glassmorphism, crisp Inter typography, and subframe motion blur.', summary: 'Fluid state transitions with spring physics, glass cards, and status pill transitions.' },
  { id: 'kinetic-showreel', title: 'Bold Kinetic Typography Showreel', cat: 'Kinetic Type', aspect: '9:16', dur: '15s', fps: 60, author: '@shneural', av: 'SN', model: 'Claude Opus 5.5', grad: 'linear-gradient(135deg,#18181b 0%,#09090b 50%,#27272a 100%)', color: '#2dd4bf', prompt: 'A bold, high-energy 15-second kinetic typography reel. Start with rapid rhythmic cuts on single impactful words, transition into an elastic word cascade, dynamic highlighter swipe on the punchline, and finish with an extruded neon title reveal. Strict 9:16 vertical safe-zones with Edge Neural TTS speech timing.', summary: 'Rhythmic typography cascade with word-level kinetic emphasis and social safe-zone alignment.' },
  { id: 'glass-bento', title: '3D Floating Glass Bento Grid', cat: '3D & WebGL', aspect: '16:9', dur: '10s', fps: 60, author: '@stephanlivera', av: 'SL', model: 'Claude Opus 5.5', grad: 'linear-gradient(135deg,#030712 0%,#111827 50%,#1f2937 100%)', color: '#38bdf8', prompt: 'Create a cinematic 10-second product film featuring an isometric bento grid floating in 3D space with subtle camera push and depth of field. Each glass tile reveals a core feature with frosted glass refraction, glowing border outline, and soft ambient drop shadows.', summary: 'Isometric bento layout with depth-of-field camera push and frosted glass reflections.' },
  { id: 'social-reel', title: 'Viral Social Reel Hook & Captions', cat: 'Social Reels', aspect: '9:16', dur: '15s', fps: 30, author: '@notdwd', av: 'ND', model: 'FreeLLMAPI & Edge TTS', grad: 'linear-gradient(135deg,#09090b 0%,#1c1917 50%,#292524 100%)', color: '#f97316', prompt: 'Generate an irresistible 15-second vertical video designed for TikTok and Instagram Reels. Top third features an attention-grabbing hook badge with animated siren glow, middle has dynamic animated cards, and bottom displays synchronized word-by-word highlighted captions timed exactly to the voiceover.', summary: 'High-retention vertical layout with animated headline hook and synced word captions.' },
  { id: 'analytics-dash', title: 'SaaS Analytics Counter Reveal', cat: 'Product UI', aspect: '16:9', dur: '10s', fps: 60, author: '@motionrender', av: 'MR', model: 'MotionRender Engine', grad: 'linear-gradient(135deg,#052e16 0%,#064e3b 50%,#022c22 100%)', color: '#10b981', prompt: 'Create a polished product feature video showcasing real-time analytics. Numbers rapidly count up with spring easing from 0 to 4.2M users, accompanied by an animated glowing SVG sparkline that draws across the canvas, followed by badge status pills turning green.', summary: 'Spring-eased number counter animations with live animated trendline graph.' },
  { id: 'phone-scroll', title: '3D Phone Mockup Scroll Showcase', cat: '3D & WebGL', aspect: '9:16', dur: '12s', fps: 60, author: '@twoclipping', av: 'TC', model: 'Claude Opus 5.5', grad: 'linear-gradient(135deg,#0a0a0a 0%,#171717 50%,#262626 100%)', color: '#a855f7', prompt: 'A sleek 3D smartphone mockup that tilts toward the camera. The screen displays an interactive mobile app onboarding sequence that scrolls smoothly through 3 cards with subtle parallax, ending with a dynamic download call-to-action card.', summary: 'Parallax device mockup with smooth screen interaction and CTA card entrance.' },
  { id: 'stats-split', title: 'Dual Metric Growth Split-Screen', cat: 'Charts & Data', aspect: '16:9', dur: '8s', fps: 60, author: '@linearuncle', av: 'LU', model: 'Claude Opus 5.5', grad: 'linear-gradient(135deg,#1e1b4b 0%,#31104b 50%,#0f172a 100%)', color: '#f43f5e', prompt: 'A bold data comparison video split down the center. Left column reveals 10x Faster Deployment with an animated circular progress ring; right column shows +320% Revenue with rising bar charts and celebration particles. Crisp monospace data labels.', summary: 'Split-screen data comparison with synchronized progress rings and bar meters.' },
  { id: 'cinematic-logo', title: 'Cinematic Dark Mode Logo Reveal', cat: 'Brand Promos', aspect: '16:9', dur: '6s', fps: 60, author: '@lexnlin', av: 'LL', model: 'Claude Opus 5.5 & MotionRender', grad: 'linear-gradient(135deg,#020617 0%,#0f172a 50%,#1e293b 100%)', color: '#60a5fa', prompt: 'A 6-second broadcast-grade logo intro on deep obsidian black. An ethereal spotlight sweeps across an embossed metallic logo with light leaks and chromatic aberration, followed by a crisp brand tagline fading in with letter-spacing drift and an impact bass hit.', summary: 'Spotlight sweep, chromatic aberration, light leak reflections, and typography fade.' },
  { id: 'quote-reveal', title: 'Distilbook Kinetic Quote Reveal', cat: 'Kinetic Type', aspect: '1:1', dur: '8s', fps: 60, author: '@ajith_io', av: 'AI', model: 'Claude Opus 5.5', grad: 'linear-gradient(135deg,#1c1917 0%,#292524 50%,#0c0a09 100%)', color: '#eab308', prompt: 'Create an editorial 1:1 square animated quote video. Large serif typography renders with typewriter reveal, followed by a warm yellow marker highlighter stroke wiping across the primary concept, ending with an elegant author signature card.', summary: 'Editorial typography styling with marker highlighter wipe and author attribution.' },
  { id: 'product-spotlight', title: 'Minimalist Hardware Product Card', cat: 'Product UI', aspect: '1:1', dur: '10s', fps: 60, author: '@gabrielbuzziv', av: 'GB', model: 'MotionRender Engine', grad: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)', color: '#38bdf8', prompt: 'A clean 10-second square product video for a modern hardware device. Smooth slow-motion scale-in of the product photograph with drop shadow, animated badge chips showing technical specs, and animated price tag.', summary: 'Subtle product zoom, specs pills entry, and dynamic CTA price banner.' },
  { id: 'roadmap-timeline', title: 'Interactive Product Roadmap Timeline', cat: 'Charts & Data', aspect: '16:9', dur: '12s', fps: 30, author: '@gabrielbuzziv', av: 'GB', model: 'Claude Opus 5.5', grad: 'linear-gradient(135deg,#030712 0%,#0f172a 50%,#111827 100%)', color: '#34d399', prompt: 'A timeline progression animation tracking quarterly product milestones. A glowing neon cursor travels across an SVG path, activating step cards one by one with subtle scale pulse and checkmark reveals. Clean date tags and dark mode palette.', summary: 'Animated milestone journey tracking quarterly releases along an animated path.' },
  { id: 'keynote-opener', title: 'Agency Launch Keynote Opener', cat: 'Brand Promos', aspect: '16:9', dur: '14s', fps: 60, author: '@himanshutwtxs', av: 'HT', model: 'Claude Opus 5.5 & MotionRender', grad: 'linear-gradient(135deg,#1c1917 0%,#451a03 50%,#0c0a09 100%)', color: '#fb923c', prompt: 'A high-impact 14-second conference keynote opening video. Cinematic Ken Burns zoom across architectural backdrop imagery, overlaid with huge condensed headline typography, dual-color gradients, and rhythmic camera shake impacts on beat drops.', summary: 'Cinematic keynote sequence with Ken Burns camera moves and high-contrast typography.' }
];

function showcase() {
  var page = h('div', { class: 'page', style: 'max-width:1400px;padding-bottom:80px' }); app.appendChild(page);
  var selCat = 'All', searchVal = '';

  var hero = h('div', { class: 'hero', style: 'margin-bottom:14px' }, [
    h('div', null, [
      h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px' }, [
        h('span', { class: 'tag', style: 'color:#fff;background:rgba(255,255,255,0.06);padding:3px 10px', text: '✨ MotionRender Showcase' }),
        h('span', { class: 'tag ok', text: '● 12 Curated Prompts' })
      ]),
      h('h1', { text: 'Motion Graphics Prompt Library', style: 'font-size:32px;letter-spacing:-0.03em' }),
      h('p', { class: 'lead', style: 'max-width:780px', text: 'Curated motion designs made with Claude Opus 5.5 and MotionRender. Copy prompts directly or render them in your studio.' })
    ]),
    h('div', { class: 'bar' }, [h('a', { class: 'btn', href: '#/new', text: '+ New video' })])
  ]);
  page.appendChild(hero);

  var searchBox = h('input', { placeholder: 'Search prompts, motion styles, UI state animations, or creators…', style: 'max-width:540px;margin-bottom:4px' });
  page.appendChild(searchBox);

  var pillsContainer = h('div', { class: 'pills' });
  page.appendChild(pillsContainer);

  var grid = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:24px' });
  page.appendChild(grid);

  var cats = ['All', 'Product UI', 'Kinetic Type', '3D & WebGL', 'Social Reels', 'Charts & Data', 'Brand Promos'];

  function drawPills() {
    pillsContainer.innerHTML = '';
    cats.forEach(function (c) {
      var count = c === 'All' ? showcaseItems.length : showcaseItems.filter(function (it) { return it.cat === c; }).length;
      var btn = h('button', { class: 'pill' + (selCat === c ? ' on' : ''), onclick: function () { selCat = c; draw(); } }, [
        h('span', { text: c }),
        h('span', { class: 'cnt', text: String(count) })
      ]);
      pillsContainer.appendChild(btn);
    });
  }

  function draw() {
    drawPills();
    grid.innerHTML = '';
    var q = searchVal.toLowerCase().trim();
    var list = showcaseItems.filter(function (it) {
      var matchCat = selCat === 'All' || it.cat === selCat;
      var matchQ = !q || it.title.toLowerCase().indexOf(q) !== -1 || it.prompt.toLowerCase().indexOf(q) !== -1 || it.author.toLowerCase().indexOf(q) !== -1 || it.cat.toLowerCase().indexOf(q) !== -1;
      return matchCat && matchQ;
    });

    if (!list.length) {
      grid.appendChild(h('div', { class: 'empty', style: 'grid-column:1/-1' }, [
        h('h2', { text: 'No matching prompts found' }),
        h('p', { class: 'lead', text: 'Try selecting a different category or clearing search.' })
      ]));
      return;
    }

    list.forEach(function (it) {
      grid.appendChild(bcard(it));
    });
  }

  searchBox.addEventListener('input', function (e) {
    searchVal = e.target.value;
    draw();
  });

  draw();
}

function bcard(it) {
  var openModal = function () { smodal(it); };
  var card = h('div', { class: 'bcard', onclick: openModal });

  var media = h('div', { class: 'bmedia', style: 'background:' + it.grad }, [
    h('div', { style: 'position:absolute;width:120px;height:120px;border-radius:50%;filter:blur(40px);opacity:0.35;background:' + it.color }),
    h('div', { style: 'position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:8px' }, [
      h('span', { style: 'font-size:10.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.35)', text: it.cat }),
      h('div', { style: 'width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px', text: '▶' })
    ]),
    h('span', { class: 'abadge', text: it.cat + ' · ' + it.aspect }),
    h('span', { class: 'tbadge', text: it.dur + ' · ' + it.fps + 'fps' })
  ]);

  var copyBtn = h('button', { class: 'bcopy', text: '📋 Copy Prompt', onclick: function (e) {
    e.stopPropagation();
    navigator.clipboard.writeText(it.prompt).then(function () {
      toast('Prompt copied to clipboard!');
      copyBtn.textContent = '✓ Copied!';
      setTimeout(function () { copyBtn.textContent = '📋 Copy Prompt'; }, 2000);
    });
  } });

  var renderBtn = h('button', { class: 'brender', text: '✨ Render Video', onclick: function (e) {
    e.stopPropagation();
    location.hash = '#/new?prompt=' + encodeURIComponent(it.prompt);
  } });

  var body = h('div', { style: 'padding:14px 6px 4px;display:flex;flex-direction:column;gap:7px;flex:1' }, [
    h('div', { style: 'display:flex;align-items:center;gap:7px;font-size:12px' }, [
      h('span', { style: 'width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#06b6d4);color:#fff;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center', text: it.av }),
      h('span', { style: 'color:var(--muted);font-weight:500', text: it.author }),
      h('span', { style: 'margin-left:auto;font-size:10.5px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.04);padding:2px 7px;border-radius:4px', text: it.model.split(' ')[0] })
    ]),
    h('b', { style: 'font-size:15px;color:#fff;line-height:1.35;margin-top:2px', text: it.title }),
    h('p', { style: 'font-size:12.5px;color:var(--muted);line-height:1.45;margin:0', text: it.summary }),
    h('div', { class: 'bprompt' }, [h('p', { style: 'margin:0', text: '"' + it.prompt.slice(0, 110) + '…"' })]),
    h('div', { class: 'bacts' }, [copyBtn, renderBtn])
  ]);

  card.append(media, body);
  return card;
}

function smodal(it) {
  var m = h('div', { class: 'smodal', onclick: function () { m.remove(); } });
  var dlg = h('div', { class: 'sdialog', onclick: function (e) { e.stopPropagation(); } });

  var close = h('button', { class: 'sclose', text: '✕', onclick: function () { m.remove(); } });

  var head = h('div', null, [
    h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:8px' }, [
      h('span', { style: 'width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#06b6d4);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center', text: it.av }),
      h('div', null, [h('b', { style: 'color:#fff;font-size:14px', text: it.author }), h('div', { style: 'font-size:12px;color:var(--muted)', text: 'Created with ' + it.model })]),
      h('span', { class: 'tag ok', style: 'margin-left:auto', text: it.cat }),
      h('span', { class: 'tag', text: it.aspect })
    ]),
    h('h2', { style: 'font-size:22px;color:#fff;margin:6px 0 0', text: it.title })
  ]);

  var player = h('div', { style: 'border-radius:18px;aspect-ratio:16/9;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:' + it.grad }, [
    h('div', { style: 'position:absolute;width:240px;height:240px;border-radius:50%;filter:blur(54px);opacity:0.35;background:' + it.color }),
    h('div', { style: 'position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center' }, [
      h('div', { style: 'width:56px;height:56px;border-radius:50%;background:#fff;color:#09090b;font-size:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,0.5)', text: '▶' }),
      h('b', { style: 'color:#fff;font-size:15px', text: 'Motion Canvas Preview' }),
      h('span', { style: 'font-size:12px;color:rgba(255,255,255,0.6)', text: it.dur + ' · ' + it.fps + ' FPS · Subframe Motion Blur' })
    ])
  ]);

  var promptSec = h('div', null, [
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, [
      h('b', { style: 'color:#fff;font-size:13.5px', text: 'Prompt & Motion Recipe' }),
      h('button', { class: 'btn sec sm', text: 'Copy Prompt', onclick: function () {
        navigator.clipboard.writeText(it.prompt).then(function () { toast('Prompt copied!'); });
      } })
    ]),
    h('div', { class: 'sprompt', text: it.prompt })
  ]);

  var foot = h('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08)' }, [
    h('span', { style: 'font-size:12.5px;color:var(--muted)', text: 'Audio: Edge Neural TTS with WordBoundary Subtitles' }),
    h('div', { class: 'bar' }, [
      h('button', { class: 'btn sec', text: 'Close', onclick: function () { m.remove(); } }),
      h('button', { class: 'btn', text: '✨ Render in Studio', onclick: function () {
        m.remove(); location.hash = '#/new?prompt=' + encodeURIComponent(it.prompt);
      } })
    ])
  ]);

  dlg.append(close, head, player, promptSec, foot);
  m.appendChild(dlg);
  document.body.appendChild(m);
}

/* create screen with dual mode */
var kinds = [
  ['reel', '📱 Social Reel', 'Vertical 9:16, ~20s. For TikTok, Shorts, Reels'],
  ['product', '⏹️ Product Video', 'Square 1:1, ~18s. For Instagram / LinkedIn feeds'],
  ['promo', '📺 Promo Video', 'Wide 16:9, ~30s. For YouTube, landing pages'],
  ['project', '💼 Case Study', 'Wide 16:9, ~60s. For case studies, deep dives']
];
var examples = [
  'Vertical reel explaining panic attacks and how the 4-7-8 breathing technique stops the spiral',
  'Launch video for a budgeting app called Pocket, highlighting 3 key features and download link',
  'Product card for a luxury hand-poured soy candle with free shipping offer',
  'Event invite for a tech and design meetup in Berlin with RSVP call-to-action'
];

function create() {
  var activeMode = 'ai'; // 'ai' or 'paste'
  var qParam = (location.hash.split('?')[1] || '');
  var qPrompt = new URLSearchParams(qParam).get('prompt');
  var qKind = new URLSearchParams(qParam).get('kind');
  var kind = qKind || 'reel', files = [], page = h('div', { class: 'page narrow' }); app.appendChild(page);

  var modeSwitch = h('div', { class: 'mode-switch' });
  var btnAi = h('button', { class: 'on', text: '✨ Generate with AI' });
  var btnPaste = h('button', { text: '📋 Paste JSON (ChatGPT / Claude)' });
  modeSwitch.append(btnAi, btnPaste);

  var contentAi = h('div');
  var contentPaste = h('div', { style: 'display:none' });

  btnAi.addEventListener('click', function () {
    activeMode = 'ai'; btnAi.classList.add('on'); btnPaste.classList.remove('on');
    contentAi.style.display = 'block'; contentPaste.style.display = 'none';
  });
  btnPaste.addEventListener('click', function () {
    activeMode = 'paste'; btnPaste.classList.add('on'); btnAi.classList.remove('on');
    contentAi.style.display = 'none'; contentPaste.style.display = 'block';
  });

  page.append(h('h1', { text: 'Create New Video' }), h('p', { class: 'lead', style: 'margin-bottom:20px', text: 'Build with your connected AI provider, or paste composition JSON generated in ChatGPT or Claude.' }), modeSwitch, contentAi, contentPaste);

  /* Tab 1: AI Generation */
  var brief = h('textarea', { placeholder: 'What is your video about? Who is it for? Key points or message?', style: 'min-height:120px' });
  if (qPrompt) brief.value = decodeURIComponent(qPrompt);
  var name = h('input', { placeholder: 'Optional. Auto-generated from your brief if left empty' });
  var tiles = h('div', { class: 'tiles' }), fileList = h('div', { class: 'files' }), errBox = h('div');
  var drawTiles = function () {
    tiles.innerHTML = '';
    kinds.forEach(function (k) {
      tiles.appendChild(h('button', { class: 'tile' + (kind === k[0] ? ' on' : ''), onclick: function () { kind = k[0]; drawTiles(); } }, [h('b', { text: k[1] }), h('span', { text: k[2] })]));
    });
  };
  drawTiles();

  var drawFiles = function () {
    fileList.innerHTML = '';
    files.forEach(function (f, i) {
      fileList.appendChild(h('span', { text: f.name + '  ×', style: 'cursor:pointer', onclick: function () { files.splice(i, 1); drawFiles(); } }));
    });
  };
  var picker = h('input', { type: 'file', multiple: true, accept: 'image/*,video/*,audio/*', style: 'display:none', onchange: function () { [].forEach.call(picker.files, function (f) { files.push(f); }); drawFiles(); picker.value = ''; } });
  var drop = h('div', { class: 'drop' }, ['Drag & drop photos or clips here, or ', h('a', { href: '#', text: 'browse files', onclick: function (e) { e.preventDefault(); picker.click(); } }), picker]);
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); [].forEach.call(e.dataTransfer.files, function (f) { files.push(f); }); drawFiles(); });

  var duration = h('input', { type: 'number', min: '3', placeholder: 'Default for kind' });
  var aspect = h('select', null, [['', 'Default for format'], ['9:16', 'Vertical 9:16 (Shorts/Reels)'], ['1:1', 'Square 1:1 (Feed)'], ['16:9', 'Wide 16:9 (Landscape)'], ['4:5', 'Portrait 4:5']].map(function (a) { return h('option', { value: a[0], text: a[1] }); }));
  var voice = h('input', { type: 'checkbox' }); voice.checked = true;
  var modelSelect = h('select', null, [
    ['', 'Auto Router (Managed Default)'],
    ['claude-3-7-sonnet', 'Claude 3.7 Sonnet (Anthropic - Elite Quality)'],
    ['gemini-2.0-flash', 'Gemini 2.0 Flash (Google - Fast Multimodal)'],
    ['deepseek-r1', 'DeepSeek-R1 (Deep Reasoning)'],
    ['qwen2.5-72b', 'Qwen 2.5 72B (Groq - Sub-Second Fast)'],
    ['gpt-4o', 'OpenAI GPT-4o (Multimodal Vision)']
  ].map(function (m) { return h('option', { value: m[0], text: m[1] }); }));
  var review = h('input', { type: 'checkbox' }), full = h('input', { type: 'checkbox' }), go = h('button', { class: 'btn', text: '✨ Generate Video' });

  var langSelect = h('select', null, [
    ['en-US', 'English (US)'],
    ['en-GB', 'English (UK)'],
    ['en-IN', 'English (India)'],
    ['es-ES', 'Spanish (Spain)'],
    ['es-MX', 'Spanish (Mexico)'],
    ['fr-FR', 'French'],
    ['de-DE', 'German'],
    ['hi-IN', 'Hindi'],
    ['ja-JP', 'Japanese'],
    ['zh-CN', 'Chinese (Mandarin)'],
    ['pt-BR', 'Portuguese (Brazil)'],
    ['it-IT', 'Italian'],
    ['ar-SA', 'Arabic']
  ].map(function (l) { return h('option', { value: l[0], text: l[1] }); }));

  var voiceMap = {
    'en-US': [
      ['en-US-AvaNeural', 'Ava (Expressive, Natural) — Female'],
      ['en-US-AndrewNeural', 'Andrew (Warm, Professional) — Male'],
      ['en-US-JennyNeural', 'Jenny (Conversational) — Female'],
      ['en-US-GuyNeural', 'Guy (Clear, Confident) — Male'],
      ['en-US-EmmaNeural', 'Emma (Bright, Engaging) — Female'],
      ['en-US-BrianNeural', 'Brian (Deep, Authoritative) — Male']
    ],
    'en-GB': [
      ['en-GB-RyanNeural', 'Ryan (Dynamic, British) — Male'],
      ['en-GB-SoniaNeural', 'Sonia (Warm, British) — Female']
    ],
    'en-IN': [
      ['en-IN-NeerjaNeural', 'Neerja (Professional, Indian) — Female'],
      ['en-IN-PrabhatNeural', 'Prabhat (Clear, Indian) — Male']
    ],
    'es-ES': [
      ['es-ES-AlvaroNeural', 'Alvaro (Spanish) — Male'],
      ['es-ES-ElviraNeural', 'Elvira (Spanish) — Female']
    ],
    'es-MX': [
      ['es-MX-DaliaNeural', 'Dalia (Mexican Spanish) — Female'],
      ['es-MX-JorgeNeural', 'Jorge (Mexican Spanish) — Male']
    ],
    'fr-FR': [
      ['fr-FR-DeniseNeural', 'Denise (French) — Female'],
      ['fr-FR-HenriNeural', 'Henri (French) — Male']
    ],
    'de-DE': [
      ['de-DE-ConradNeural', 'Conrad (German) — Male'],
      ['de-DE-KatjaNeural', 'Katja (German) — Female']
    ],
    'hi-IN': [
      ['hi-IN-SwaraNeural', 'Swara (Hindi) — Female'],
      ['hi-IN-MadhurNeural', 'Madhur (Hindi) — Male']
    ],
    'ja-JP': [
      ['ja-JP-NanamiNeural', 'Nanami (Japanese) — Female'],
      ['ja-JP-KeitaNeural', 'Keita (Japanese) — Male']
    ],
    'zh-CN': [
      ['zh-CN-XiaoxiaoNeural', 'Xiaoxiao (Chinese) — Female'],
      ['zh-CN-YunjianNeural', 'Yunjian (Chinese) — Male']
    ],
    'pt-BR': [
      ['pt-BR-FranciscaNeural', 'Francisca (Portuguese) — Female'],
      ['pt-BR-AntonioNeural', 'Antonio (Portuguese) — Male']
    ],
    'it-IT': [
      ['it-IT-ElsaNeural', 'Elsa (Italian) — Female'],
      ['it-IT-DiegoNeural', 'Diego (Italian) — Male']
    ],
    'ar-SA': [
      ['ar-SA-ZariyahNeural', 'Zariyah (Arabic) — Female'],
      ['ar-SA-HamedNeural', 'Hamed (Arabic) — Male']
    ]
  };

  var voiceSelect = h('select');
  function updateVoices() {
    voiceSelect.innerHTML = '';
    var list = voiceMap[langSelect.value] || voiceMap['en-US'];
    list.forEach(function (v) {
      voiceSelect.appendChild(h('option', { value: v[0], text: v[1] }));
    });
  }
  langSelect.addEventListener('change', updateVoices);
  updateVoices();

  var voiceBlock = h('div', { class: 'two', style: 'margin:8px 0 12px' }, [
    h('label', { class: 'f' }, [h('span', { text: 'Narration Language' }), langSelect]),
    h('label', { class: 'f' }, [h('span', { text: 'Voice Actor (Edge Neural)' }), voiceSelect])
  ]);
  voice.addEventListener('change', function () {
    voiceBlock.style.display = voice.checked ? '' : 'none';
  });

  var chips = h('div', { class: 'chips' }, examples.map(function (t) {
    return h('button', { class: 'chip', text: t.length > 56 ? t.slice(0, 54) + '…' : t, title: t, onclick: function () { brief.value = t; } });
  }));

  contentAi.append(
    h('label', { class: 'f' }, [h('span', { text: 'Format & Aspect Ratio' }), tiles]),
    h('label', { class: 'f' }, [h('span', { text: 'Video Brief' }), brief]),
    chips,
    h('label', { class: 'f' }, [h('span', { text: 'Media Assets (optional)' }), drop, fileList]),
    h('details', null, [
      h('summary', { text: 'Advanced Settings' }),
      h('div', { style: 'margin-top:14px' }, [
        h('div', { class: 'two' }, [
          h('label', { class: 'f' }, [h('span', { text: 'Creative AI Model' }), modelSelect]),
          h('label', { class: 'f' }, [h('span', { text: 'Project Name' }), name])
        ]),
        h('div', { class: 'two' }, [h('label', { class: 'f' }, [h('span', { text: 'Duration in seconds' }), duration]), h('label', { class: 'f' }, [h('span', { text: 'Aspect Ratio Override' }), aspect])]),
        h('label', { class: 'f' }, [voice, ' Add voiceover narration and captions (Edge Neural Voice, Free)']),
        voiceBlock,
        h('label', { class: 'f' }, [review, ' Automatic review and self-correction pass']),
        h('label', { class: 'f' }, [full, ' Write every layer from scratch (experimental, without templates)'])
      ])
    ]),
    errBox,
    h('div', { style: 'margin-top:16px' }, go)
  );

  go.addEventListener('click', function () {
    errBox.innerHTML = ''; var text = brief.value.trim(); if (!text) { fail(errBox, new Error('Please describe your video in the brief')); return; }
    go.disabled = true; go.textContent = 'Starting…';
    var title = name.value.trim() || text.split(' ').slice(0, 6).join(' ');
    api('/api/project/new', { name: title, kind: kind }).then(function (made) {
      return files.reduce(function (p, f) {
        return p.then(function () {
          return fetch('/api/upload?project=' + encodeURIComponent(made.id) + '&name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f }).then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Upload failed'); }); });
        });
      }, Promise.resolve()).then(function () {
        var body = {
          brief: text,
          kind: kind,
          folder: made.id,
          narration: voice.checked,
          voice: voice.checked ? voiceSelect.value : undefined,
          language: voice.checked ? langSelect.value : undefined,
          review: review.checked,
          full: full.checked
        };
        if (modelSelect.value) body.model = modelSelect.value;
        if (duration.value) body.duration = duration.value;
        if (aspect.value) body.aspect = aspect.value;
        return api('/api/compose', body);
      }).then(function (r) {
        location.hash = '#/making/' + encodeURIComponent(made.id) + '/' + r.job.id;
      });
    }).catch(function (e) { go.disabled = false; go.textContent = '✨ Generate Video'; fail(errBox, e); });
  });

  /* Tab 2: Paste JSON Workflow */
  var pasteBrief = h('textarea', { placeholder: 'Brief for AI prompt generator (e.g. 20-second vertical reel on panic attack recovery)...', style: 'min-height:75px' });
  var pasteKind = h('select', null, [['reel', 'Vertical Reel (9:16)'], ['product', 'Square (1:1)'], ['promo', 'Landscape Promo (16:9)'], ['project', 'Case Study (16:9)']].map(function (k) { return h('option', { value: k[0], text: k[1] }); }));
  var pastePromptBtn = h('button', { class: 'btn sec', text: '📋 Copy AI Prompt Cheatsheet' });
  var pasteInput = h('textarea', { placeholder: 'Paste valid composition JSON starting with { "name": ..., "scenes": [...] } here...', style: 'min-height:160px;font:12.5px/1.5 ui-monospace,Consolas,monospace' });
  var pasteFolder = h('input', { placeholder: 'Optional folder name (e.g. panic-attack-reel)' });
  var pasteGo = h('button', { class: 'btn', text: '⚡ Import & Launch Studio' });
  var pasteErr = h('div');

  pastePromptBtn.addEventListener('click', function () {
    pastePromptBtn.disabled = true; pastePromptBtn.textContent = 'Generating prompt…';
    api('/api/prompt', { brief: pasteBrief.value.trim() || 'A modern promotional video', kind: pasteKind.value, schema: true }).then(function (r) {
      pastePromptBtn.disabled = false; pastePromptBtn.textContent = '📋 Copy AI Prompt Cheatsheet';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(r.prompt).then(function () { toast('Copied prompt cheatsheet to clipboard!'); }, function () { toast('Prompt ready'); });
      } else {
        toast('Prompt ready');
      }
    }, function (e) {
      pastePromptBtn.disabled = false; pastePromptBtn.textContent = '📋 Copy AI Prompt Cheatsheet';
      fail(pasteErr, e);
    });
  });

  pasteGo.addEventListener('click', function () {
    pasteErr.innerHTML = ''; var raw = pasteInput.value.trim();
    if (!raw) { fail(pasteErr, new Error('Please paste your composition JSON first')); return; }
    pasteGo.disabled = true; pasteGo.textContent = 'Importing…';
    api('/api/import', { json: raw, folder: pasteFolder.value.trim() || undefined }).then(function (r) {
      return waitJob(r.job, function (j) {
        if (j.messages.length) pasteGo.textContent = j.messages[j.messages.length - 1];
      });
    }).then(function (done) {
      var projId = (done.result && (done.result.id || done.result.project)) || (done.result && done.result.relative && done.result.relative.split('/')[0]) || pasteFolder.value.trim() || 'imported-video';
      toast('Imported video successfully!');
      location.hash = '#/p/' + encodeURIComponent(projId);
    }).catch(function (e) {
      pasteGo.disabled = false; pasteGo.textContent = '⚡ Import & Launch Studio';
      fail(pasteErr, e);
    });
  });

  contentPaste.append(
    h('div', { class: 'box-info', text: 'Zero-key workflow: Copy the official schema prompt into ChatGPT, Claude or FreeLLMAPI chat, then paste the returned JSON below.' }),
    h('h2', { style: 'margin-top:16px', text: 'Step 1: Get AI Chat Prompt' }),
    h('div', { class: 'two' }, [
      h('label', { class: 'f' }, [h('span', { text: 'Format' }), pasteKind]),
      h('label', { class: 'f' }, [h('span', { text: 'Video Topic' }), pasteBrief])
    ]),
    pastePromptBtn,
    h('h2', { style: 'margin-top:24px', text: 'Step 2: Paste JSON from AI' }),
    h('label', { class: 'f' }, [h('span', { text: 'Composition JSON' }), pasteInput]),
    h('label', { class: 'f' }, [h('span', { text: 'Project Folder Name (optional)' }), pasteFolder]),
    pasteErr,
    h('div', { style: 'margin-top:16px' }, pasteGo)
  );
}

/* live progress */
function making(id, jobId) {
  var log = h('div', { class: 'log' }), title = h('h1', { text: 'Building your video…' });
  var box = h('div', { class: 'center' }, [
    h('div', { class: 'spin' }),
    title,
    h('p', { class: 'lead', style: 'margin-bottom:18px', text: 'Writing scenes, positioning animations, and compiling design tokens. Ready in under a minute.' }),
    log
  ]);
  app.appendChild(box);
  waitJob({ id: jobId }, function (j) {
    log.textContent = j.messages.join(String.fromCharCode(10));
    log.scrollTop = log.scrollHeight;
  }).then(function () {
    location.hash = '#/p/' + encodeURIComponent(id);
  }, function (e) {
    var sp = box.querySelector('.spin'); if (sp) sp.remove();
    title.textContent = 'Could not finish video';
    fail(box, e);
    box.appendChild(h('div', { class: 'bar', style: 'justify-content:center;margin-top:20px' }, [
      h('a', { class: 'btn', href: '#/new', text: 'Try again' }),
      h('button', { class: 'btn sec', text: 'Delete empty folder', onclick: function () { api('/api/project/delete', { id: id }).then(function () { location.hash = '#/'; }); } })
    ]));
  });
}

/* full studio editor */
function editor(id, tabHint) {
  var d, player = null, tab = tabHint || 'edit', box = h('div', { class: 'editor' }), stage = h('div', { class: 'stage' }), side = h('div', { class: 'side' });
  box.append(stage, side); app.appendChild(box); app.style.overflow = 'hidden';
  var destroyed = false;
  cleanup = function () {
    destroyed = true; document.removeEventListener('keydown', keys); app.style.overflow = '';
    if (player) { try { player.destroy(); } catch (e) {} }
  };
  var file = id + '/composition.json';
  var savedNote = h('span', { class: 'saved', text: '✓ Ready' });
  var screen = h('div', { class: 'screen' }, h('div', { id: 'stage-player' }));
  var sceneRow = h('div', { class: 'scenes' });
  var nameInput = h('input', { title: 'Click to rename project' });
  var pills = h('span', { class: 'tag', style: 'margin-left:4px' });

  var playBtn = h('button', { class: 'btn sm', text: '▶ Play' });
  var scrub = h('input', { type: 'range', min: '0', max: '1', value: '0', step: '1' });
  var clock = h('span', { class: 't' });
  var xport = h('div', { class: 'xport' }, [playBtn, scrub, clock]);

  stage.append(
    h('div', { class: 'etop' }, [
      h('a', { class: 'back-link', href: '#/', text: '← Projects' }),
      nameInput,
      pills,
      h('div', { class: 'grow' }),
      savedNote,
      h('button', { class: 'btn sm sec', text: 'Export MP4', onclick: function () { tab = 'export'; drawTabs(); drawPane(); } })
    ]),
    screen,
    xport,
    sceneRow
  );

  function tick(f) {
    scrub.value = String(f);
    clock.textContent = dur(f / d.fps) + ' / ' + dur(d.durationFrames / d.fps) + ' · f' + f;
  }
  playBtn.addEventListener('click', function () {
    if (!player) return;
    if (player.playing) player.pause(); else player.play();
  });
  scrub.addEventListener('input', function () {
    if (player) {
      if (player.playing) player.pause();
      player.seek(Number(scrub.value));
      tick(Number(scrub.value));
    }
  });
  document.addEventListener('keydown', keys);
  function keys(e) {
    if (e.key === ' ' && player && e.target === document.body) { e.preventDefault(); playBtn.click(); }
  }

  var tabs = h('div', { class: 'tabs' }), pane = h('div', { class: 'pane' }); side.append(tabs, pane);
  var names = [['edit', '✍️ Edit'], ['ai', '✨ Ask AI'], ['look', '🎨 Look'], ['history', '🕒 History'], ['export', '🚀 Export']];
  function drawTabs() {
    tabs.innerHTML = '';
    names.forEach(function (n) {
      tabs.appendChild(h('button', { class: tab === n[0] ? 'on' : '', text: n[1], onclick: function () { tab = n[0]; drawTabs(); drawPane(); } }));
    });
  }

  function playerStart(frame) {
    if (player) { try { player.destroy(); } catch (e) {} player = null; }
    $('#stage-player').innerHTML = '';
    return import('/player.js').then(function (m) {
      return m.createPlayer($('#stage-player'), {
        composition: d.source.raw,
        media: d.source.media,
        assetBase: location.origin + d.source.base,
        allowCode: true,
        controls: false
      });
    }).then(function (p) {
      if (destroyed) { p.destroy(); return; }
      player = p; scrub.max = String(Math.max(1, d.durationFrames - 1));
      tick(frame || 0); playBtn.textContent = '▶ Play';
      p.on('frame', function (f) { tick(typeof f === 'number' ? f : p.frame); });
      p.on('play', function () { playBtn.textContent = '⏸ Pause'; });
      p.on('pause', function () { playBtn.textContent = '▶ Play'; });
      p.on('ended', function () { playBtn.textContent = '▶ Play'; });
      p.on('error', function (e) { savedNote.textContent = 'Preview error: ' + (e && e.message ? e.message : e); });
      if (frame) p.seek(frame);
    }).catch(function (e) {
      $('#stage-player').appendChild(h('div', { class: 'err', text: 'Preview player error: ' + e.message }));
    });
  }

  function load(keepFrame) {
    var frame = keepFrame && player ? player.frame : 0;
    return api('/api/project?id=' + encodeURIComponent(id)).then(function (r) {
      d = r; nameInput.value = d.name;
      pills.textContent = d.width + '×' + d.height + ' · ' + d.fps + 'fps';
      drawScenes();
      return playerStart(frame);
    }).then(function () { drawPane(); }, function (e) { pane.innerHTML = ''; fail(pane, e); });
  }

  function drawScenes() {
    sceneRow.innerHTML = '';
    d.scenes.forEach(function (s, idx) {
      var btn = h('button', { onclick: function () { if (player) { player.seek(s.startFrame); tick(s.startFrame); } } }, [
        (idx + 1) + '. ' + s.name,
        h('small', { text: dur(s.durationFrames / d.fps) })
      ]);
      sceneRow.appendChild(btn);
    });
  }

  nameInput.addEventListener('change', function () {
    var v = nameInput.value.trim(); if (!v) { nameInput.value = d.name; return; }
    api('/api/project/rename', { id: id, name: v }).then(function () { d.name = v; savedNote.textContent = '✓ Renamed'; }, function (e) { toast(e.message, true); });
  });

  function save(path, body, note) {
    savedNote.textContent = 'Saving…';
    return api(path, body).then(function () {
      savedNote.textContent = '✓ ' + (note || 'Saved');
      return load(true);
    }, function (e) { savedNote.textContent = 'Error'; toast(e.message, true); throw e; });
  }

  function drawPane() {
    pane.innerHTML = ''; if (!d) return;
    ({ edit: paneEdit, ai: paneAi, look: paneLook, history: paneHistory, export: paneExport }[tab])();
  }

  var themeNames = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'radius', 'headWeight', 'fontDisplay', 'fontBody', 'texture', 'textureColor', 'textureOpacity', 'motion', 'transition', 'layout', 'density'];

  function paneEdit() {
    var fields = [], apply = h('button', { class: 'btn', text: 'Save changes' }), box2 = h('div');
    if (d.mode === 'template') {
      d.variables.filter(function (v) { return themeNames.indexOf(v.name) < 0; }).forEach(function (v) {
        var input, label = v.description ? v.description : v.name.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ');
        if (v.type === 'boolean') { input = h('input', { type: 'checkbox' }); input.checked = !!v.value; }
        else if (v.type === 'color') input = h('input', { type: 'color', value: /^#[0-9a-fA-F]{6}$/.test(v.value) ? v.value : '#000000' });
        else if (v.type === 'number') input = h('input', { type: 'number', value: String(v.value) });
        else if (v.type === 'list') { input = h('textarea', { style: 'min-height:120px;font:12px ui-monospace,Consolas,monospace' }); input.value = JSON.stringify(v.value, null, 2); }
        else { input = h('textarea', { style: 'min-height:' + (String(v.value).length > 60 ? 90 : 42) + 'px' }); input.value = v.value == null ? '' : String(v.value); }
        fields.push({ v: v, input: input });
        box2.appendChild(h('label', { class: 'f' }, [h('span', { text: label }), input]));
      });
      if (!fields.length) box2.appendChild(h('p', { class: 'lead', text: 'This video has no exposed variable fields. Use Ask AI to adjust scene text.' }));
      apply.addEventListener('click', function () {
        var values = {};
        try {
          fields.forEach(function (f) {
            var v = f.v, x = f.input;
            values[v.name] = v.type === 'boolean' ? x.checked : v.type === 'number' ? Number(x.value) : v.type === 'list' ? JSON.parse(x.value) : x.value;
          });
        } catch (e) { toast('A list is not valid JSON: ' + e.message, true); return; }
        save('/api/variables', { id: id, values: values }, 'Saved');
      });
    } else {
      d.texts.forEach(function (t) {
        var input = h('textarea', { style: 'min-height:' + (t.content.length > 60 ? 80 : 40) + 'px' });
        input.value = t.content;
        fields.push({ t: t, input: input });
        box2.appendChild(h('label', { class: 'f' }, [h('span', { text: t.scene + ' · ' + t.id }), input]));
      });
      if (!fields.length) box2.appendChild(h('p', { class: 'lead', text: 'No text layers found in this video.' }));
      apply.addEventListener('click', function () {
        var changed = fields.filter(function (f) { return f.input.value.trim() && f.input.value !== f.t.content; });
        changed.reduce(function (p, f) {
          return p.then(function () { return api('/api/text', { id: id, path: f.t.path, content: f.input.value }); });
        }, Promise.resolve()).then(function () {
          savedNote.textContent = changed.length ? '✓ Saved' : 'No changes';
          return load(true);
        }, function (e) { toast(e.message, true); });
      });
    }
    pane.append(
      h('h2', { text: 'Content & Text' }),
      h('p', { class: 'lead', style: 'font-size:13px;margin-bottom:16px', text: d.mode === 'template' ? 'Update headlines, copy, and variables. The visual layout adjusts dynamically.' : 'Every text line in the video in appearance order.' }),
      box2,
      fields.length ? apply : null
    );
  }

  function paneAi() {
    var text = h('textarea', { placeholder: 'e.g. Make it snappier, change the call to action, or add more energy', style: 'min-height:110px' });
    var go = h('button', { class: 'btn', text: '✨ Apply AI Change' }), errBox = h('div');
    var chips = h('div', { class: 'chips' }, [
      'Make pace faster and punchier',
      'Shorten all captions',
      'Add a stronger call to action at the end',
      'Calmer and more minimal',
      'Use bolder, larger typography'
    ].map(function (t) { return h('button', { class: 'chip', text: t, onclick: function () { text.value = t; } }); }));

    pane.append(
      h('h2', { text: 'Ask AI to Refine Video' }),
      h('p', { class: 'lead', style: 'font-size:13px', text: 'Describe what you want to change in plain English. Every edit is saved to History so you can rollback anytime.' }),
      text,
      chips,
      d.mode === 'template' ? h('div', { class: 'note', text: 'Note: AI refinements unlock custom scene-by-scene editing.' }) : null,
      errBox,
      go
    );
    go.addEventListener('click', function () {
      errBox.innerHTML = ''; if (!text.value.trim()) return;
      go.disabled = true; go.textContent = 'Refining…';
      run('/api/refine', { file: file, instruction: text.value.trim() }, function (j) {
        savedNote.textContent = j.messages.length ? j.messages[j.messages.length - 1] : 'Working…';
      }).then(function (r) {
        savedNote.textContent = '✓ Updated';
        toast('Video refined successfully' + (r.warnings && r.warnings.length ? ' (with notes)' : ''));
        return load(false);
      }, function (e) {
        go.disabled = false; go.textContent = '✨ Apply AI Change';
        fail(errBox, e);
      });
    });
  }

  function paneLook() {
    pane.append(h('h2', { text: 'Look & Style' }));
    var themes = h('div', { class: 'themes' }), blocks = h('div', { class: 'blocklist' }), cat = h('select', { style: 'margin-bottom:12px' }), all = [];
    pane.append(
      h('p', { class: 'lead', style: 'font-size:13px', text: 'Pick a color palette to re-style every scene instantly.' }),
      themes,
      h('h2', { style: 'margin-top:28px', text: 'Add Scene Block' }),
      cat,
      blocks
    );
    api('/api/library').then(function (lib) {
      var canTheme = Object.keys(d.theme).length > 0;
      lib.themes.forEach(function (t) {
        var v = t.variables;
        var b = h('button', { class: 'theme', disabled: !canTheme, title: canTheme ? t.description : 'This video does not use theme tokens', onclick: function () { save('/api/theme', { id: id, theme: t.id }, 'Theme updated'); } }, [
          h('div', { class: 'sw' }, [v.bg, v.surface, v.accent, v.accent2].map(function (c) { return h('i', { style: 'background:' + c }); })),
          h('b', { text: t.name })
        ]);
        themes.appendChild(b);
      });
      all = lib.blocks;
      var cats = ['all'].concat(all.map(function (b) { return b.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
      cat.innerHTML = '';
      cats.forEach(function (c) { cat.appendChild(h('option', { value: c, text: c === 'all' ? 'All categories' : c })); });
      var draw = function () {
        blocks.innerHTML = '';
        all.filter(function (b) { return cat.value === 'all' || b.category === cat.value; }).forEach(function (b) {
          blocks.appendChild(h('div', { class: 'block' }, [
            h('div', null, [h('b', { text: b.name }), h('small', { text: b.description })]),
            h('button', { class: 'btn sec sm', text: '+ Add', onclick: function () { save('/api/add-block', { id: id, block: b.id }, 'Added ' + b.name).then(function () { toast('Added ' + b.name); }, function () {}); } })
          ]));
        });
      };
      cat.addEventListener('change', draw); draw();
    }, function (e) { fail(pane, e); });
  }

  function paneHistory() {
    pane.append(h('h2', { text: 'Version History' }), h('p', { class: 'lead', style: 'font-size:13px', text: 'Every change is versioned. Roll back anytime.' }));
    var list = h('div'); pane.appendChild(list);
    api('/api/history?file=' + encodeURIComponent(file)).then(function (r) {
      if (!r.revisions.length) { list.appendChild(h('p', { class: 'lead', text: 'No recorded versions yet.' })); return; }
      r.revisions.slice().reverse().forEach(function (rev, i) {
        list.appendChild(h('div', { class: 'hist' }, [
          h('div', null, [
            h('b', { text: '#' + rev.n + ' · ' + rev.kind }),
            h('small', { text: rev.label }),
            h('small', { text: new Date(rev.at).toLocaleString() })
          ]),
          i === 0 ? h('span', { class: 'tag ok', text: 'current' }) : h('button', { class: 'btn sec sm', text: 'Rollback', onclick: function () {
            api('/api/restore', { file: file, n: rev.n }).then(function () { savedNote.textContent = 'Restored #' + rev.n; return load(false); }, function (e) { toast(e.message, true); });
          } })
        ]));
      });
    }, function (e) { fail(list, e); });
  }

  function paneExport() {
    var quality = h('select', null, [['1', 'Full HD (100% scale)'], ['0.75', 'Standard (75% scale)'], ['0.5', 'Fast Draft (50% scale)']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var go = h('button', { class: 'btn', text: '🎬 Render MP4 Video' }), out = h('div', { class: 'result' });
    var checkBtn = h('button', { class: 'btn sec', text: '🔍 Check for issues' }), thumbBtn = h('button', { class: 'btn sec', text: '🖼️ Make Thumbnail' });
    var errBox = h('div');

    pane.append(
      h('h2', { text: 'Export & Render' }),
      h('p', { class: 'lead', style: 'font-size:13px', text: d.width + '×' + d.height + ' · ' + dur(d.durationFrames / d.fps) + ' · MP4' }),
      h('label', { class: 'f' }, [h('span', { text: 'Render Quality' }), quality]),
      go,
      h('div', { class: 'bar', style: 'margin:14px 0 0' }, [checkBtn, thumbBtn]),
      errBox,
      out
    );

    var guard = function (btn, label, fn) {
      btn.addEventListener('click', function () {
        errBox.innerHTML = ''; btn.disabled = true; btn.textContent = 'Working…';
        fn().then(function () { btn.disabled = false; btn.textContent = label; }, function (e) { btn.disabled = false; btn.textContent = label; fail(errBox, e); });
      });
    };
    guard(go, '🎬 Render MP4 Video', function () {
      return run('/api/render', { file: file, output: 'out.mp4', scale: Number(quality.value) }, function (j) {
        go.textContent = j.messages.length ? j.messages[j.messages.length - 1] : 'Rendering…';
      }).then(function (r) {
        out.innerHTML = '';
        out.append(
          h('b', { text: '🎉 Your video is ready!' }),
          h('video', { src: r.url, controls: true }),
          h('div', { class: 'bar', style: 'margin:10px 0 0' }, [
            h('a', { class: 'btn sm', href: r.url, download: id + '.mp4', text: 'Download MP4' }),
            h('span', { class: 'saved', text: r.relative })
          ])
        );
      });
    });
    guard(checkBtn, '🔍 Check for issues', function () {
      return run('/api/review', { file: file }).then(function (r) {
        out.innerHTML = '';
        out.append(
          h('b', { text: r.issues.length ? r.issues.length + ' item(s) to review' : '✓ No issues found' }),
          h('ul', null, r.issues.slice(0, 12).map(function (i) { return h('li', { text: (i.message || String(i)) }); })),
          h('img', { src: r.url + '?t=' + Date.now() })
        );
      });
    });
    guard(thumbBtn, '🖼️ Make Thumbnail', function () {
      return run('/api/thumbnail', { file: file }).then(function (r) {
        out.innerHTML = '';
        out.append(
          h('b', { text: 'Generated Thumbnail' }),
          h('img', { src: r.url + '?t=' + Date.now() }),
          h('div', { class: 'bar', style: 'margin:10px 0 0' }, [
            h('a', { class: 'btn sm', href: r.url, download: id + '.png', text: 'Download PNG' })
          ])
        );
      });
    });
  }

  drawTabs(); load(false);
}

/* library screen */
function library() {
  var page = h('div', { class: 'page' }); app.appendChild(page);
  page.append(
    h('div', { class: 'hero' }, [
      h('div', null, [h('h1', { text: 'Design Library' }), h('p', { class: 'lead', text: 'Curated color palettes and modular scene blocks ready to inject into any video.' })])
    ])
  );
  api('/api/library').then(function (lib) {
    page.appendChild(h('h2', { text: 'Color Palettes' }));
    var row = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin-bottom:36px' });
    lib.themes.forEach(function (t) {
      var v = t.variables;
      row.appendChild(h('div', { class: 'card', style: 'padding:14px' }, [
        h('div', { class: 'sw' }, [v.bg, v.surface, v.accent, v.accent2].map(function (c) { return h('i', { style: 'background:' + c }); })),
        h('b', { text: t.name, style: 'font-size:14.5px;color:#fff' }),
        h('div', { class: 'meta', style: 'margin-top:4px', text: t.description })
      ]));
    });
    page.appendChild(row);
    var cats = lib.blocks.map(function (b) { return b.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    cats.forEach(function (c) {
      page.appendChild(h('div', { class: 'cat', text: c }));
      var g = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-bottom:24px' });
      lib.blocks.filter(function (b) { return b.category === c; }).forEach(function (b) {
        g.appendChild(h('div', { class: 'card', style: 'padding:16px;gap:8px' }, [
          h('b', { text: b.name, style: 'font-size:14.5px;color:#fff' }),
          h('div', { class: 'meta', text: b.description }),
          h('div', { class: 'meta', text: (b.kind === 'overlay' ? 'Overlay · ' : 'Scene · ') + dur(b.durationFrames / 30) }),
          h('button', { class: 'btn sec sm', style: 'align-self:flex-start;margin-top:6px', text: '+ Add to video…', onclick: function () { pick(b); } })
        ]));
      });
      page.appendChild(g);
    });
  }, function (e) { fail(page, e); });
}

function pick(block) {
  api('/api/projects').then(function (r) {
    if (!r.projects.length) { toast('Create a video project first', true); return; }
    var sel = h('select', null, r.projects.map(function (p) { return h('option', { value: p.id, text: p.name }); }));
    var m = h('div', { class: 'modal' }, h('div', null, [
      h('h2', { text: 'Add ' + block.name + ' to project:' }),
      sel,
      h('div', { class: 'bar', style: 'margin:18px 0 0;justify-content:flex-end' }, [
        h('button', { class: 'btn sec', text: 'Cancel', onclick: function () { m.remove(); } }),
        h('button', { class: 'btn', text: 'Add Scene', onclick: function () {
          api('/api/add-block', { id: sel.value, block: block.id }).then(function () {
            m.remove(); location.hash = '#/p/' + encodeURIComponent(sel.value);
          }, function (e) { toast(e.message, true); });
        } })
      ])
    ]));
    document.body.appendChild(m);
  });
}

/* settings screen */
function settings() {
  var page = h('div', { class: 'page narrow' }); app.appendChild(page);
  page.append(
    h('h1', { text: 'Studio Settings' }),
    h('p', { class: 'lead', style: 'margin-bottom:24px', text: 'Configuration, local storage path, and AI engine status.' })
  );
  api('/api/status').then(function (s) {
    var pinfo = s.provider ? s.provider.id.toUpperCase() + ' (' + s.provider.model + ')' : 'Not Connected';
    var rows = [
      ['Projects Directory', s.outDir],
      ['Active AI Provider', pinfo]
    ];
    rows.forEach(function (r) {
      page.appendChild(h('label', { class: 'f' }, [h('span', { text: r[0] }), h('input', { value: r[1], readonly: true })]));
    });
    if (s.error) {
      page.appendChild(h('div', { class: 'err', text: s.error + String.fromCharCode(10) + 'Tip: Add FREELLMAPI_API_KEY=... in your .env file, or use the zero-key Paste JSON workflow!' }));
    } else {
      page.appendChild(h('div', { class: 'note', text: 'Connected to ' + pinfo + '. AI generation and refinements will execute directly through this provider.' }));
    }
    page.appendChild(h('div', { class: 'box-info', text: 'Zero-API Key Workflow: You can also use ChatGPT or Claude directly by copying the prompt cheatsheet from "+ New Video > Paste JSON" and pasting the returned JSON.' }));
    page.appendChild(h('p', { class: 'meta', style: 'margin-top:20px', text: 'To change output directory, run: ove ai studio --out <custom-folder>' }));
  }, function (e) { fail(page, e); });
}

updateStatusBadge();
connect();
route();
</script></body></html>`;
