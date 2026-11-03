// The `ove ai studio` page: a small product around projects. Projects are folders in the out folder; the editor previews one live with
// the Player and edits its own composition file. Self-contained (no build step, no framework, no remote assets). The script uses no
// backticks, ${} or backslashes, so the whole page can live inside this template string.
export const aiStudioPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OVE AI studio</title>
<style>
:root{--bg:#0a0e14;--panel:#111823;--panel2:#0c121b;--line:#222f41;--text:#e8eef8;--muted:#8a9ab0;--accent:#2dd4bf;--accent2:#818cf8;--ok:#34d399;--warn:#fbbf24;--err:#fb7185}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column}
a{color:var(--accent);text-decoration:none}
header.top{display:flex;align-items:center;gap:22px;padding:0 22px;height:56px;border-bottom:1px solid var(--line);background:#0b1019;flex:none}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;color:var(--text)}
.mark{font:800 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#062b27;background:var(--accent);padding:6px 7px;border-radius:5px}
nav.main{display:flex;gap:4px}nav.main a{color:var(--muted);padding:7px 12px;border-radius:7px}nav.main a:hover{color:var(--text);background:#141d2a}nav.main a.on{color:var(--text);background:#18243a}
.grow{flex:1}.busy{display:none;align-items:center;gap:8px;color:var(--muted);font-size:12.5px;max-width:360px}.busy.on{display:flex}.busy span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spin{width:12px;height:12px;border:2px solid #2a3b52;border-top-color:var(--accent);border-radius:50%;animation:rot .8s linear infinite;flex:none}@keyframes rot{to{transform:rotate(360deg)}}
#app{flex:1;min-height:0;overflow:auto}
.page{max-width:1180px;margin:0 auto;padding:30px 24px 60px}
h1{margin:0 0 4px;font-size:24px;letter-spacing:-.01em}h2{margin:0 0 10px;font-size:16px}.lead{color:var(--muted);margin:0 0 22px}
button{font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}
.btn{background:var(--accent);color:#04211e;border:0;border-radius:8px;padding:9px 16px;font-weight:700}.btn:hover{filter:brightness(1.08)}
.btn.sec{background:#18243a;color:var(--text);border:1px solid var(--line);font-weight:500}.btn.sec:hover{background:#1e2e48}
.btn.sm{padding:5px 10px;font-size:13px;border-radius:6px}.btn.danger{color:#fecdd3}
input,textarea,select{width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:9px 10px;font:inherit}
textarea{resize:vertical;min-height:90px}input:focus,textarea:focus,select:focus{outline:2px solid var(--accent);outline-offset:-1px}
input[type=color]{padding:2px;height:36px;width:64px}input[type=checkbox]{width:auto}
label.f{display:block;margin:0 0 14px}label.f>span{display:block;color:var(--muted);font-size:12.5px;margin-bottom:5px}
.bar{display:flex;align-items:center;gap:10px;margin-bottom:22px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:border-color .15s,transform .15s}
.card:hover{border-color:#34506f;transform:translateY(-2px)}
.thumb{aspect-ratio:16/10;background:#06090e;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer}
.thumb img{width:100%;height:100%;object-fit:contain;display:block}.thumb .ph{color:#3d4d63;font-size:12px}
.cardbody{padding:12px 14px 10px;display:flex;flex-direction:column;gap:3px}.cardbody b{font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{color:var(--muted);font-size:12.5px}.cardfoot{display:flex;gap:4px;padding:0 10px 10px}
.tag{display:inline-block;font-size:11px;border:1px solid var(--line);border-radius:999px;padding:1px 8px;color:var(--muted)}
.empty{text-align:center;padding:70px 20px;border:1px dashed var(--line);border-radius:14px;color:var(--muted)}.empty h2{color:var(--text);font-size:19px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;text-align:left;color:var(--text)}
.tile b{display:block}.tile span{color:var(--muted);font-size:12.5px}.tile.on{border-color:var(--accent);background:#0f2a2a}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 16px}.chip{background:#141e2c;border:1px solid var(--line);color:var(--muted);border-radius:999px;padding:4px 11px;font-size:12.5px}.chip:hover{color:var(--text);border-color:#3a5272}
.drop{border:1px dashed #37506c;border-radius:10px;padding:16px;text-align:center;color:var(--muted);background:var(--panel2)}.drop.over{border-color:var(--accent);color:var(--text)}
.files{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.files span{background:#141e2c;border:1px solid var(--line);border-radius:6px;padding:3px 8px;font-size:12.5px}
details{margin:6px 0 18px}summary{cursor:pointer;color:var(--muted)}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.narrow{max-width:760px}.err{color:#fecdd3;background:#241016;border:1px solid #5b1f2b;border-radius:8px;padding:10px 12px;white-space:pre-wrap;margin:12px 0}
.note{color:#fde68a;background:#241f0d;border:1px solid #54451a;border-radius:8px;padding:8px 11px;font-size:13px;margin:10px 0}
.log{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:12px/1.6 ui-monospace,Consolas,monospace;color:#a9b8cc;max-height:240px;overflow:auto;white-space:pre-wrap}
.center{max-width:560px;margin:80px auto;text-align:center}.center .spin{width:34px;height:34px;border-width:3px;margin:0 auto 20px}
/* editor */
.editor{display:grid;grid-template-columns:minmax(0,1fr) 400px;height:100%;min-height:0}
.stage{display:flex;flex-direction:column;min-width:0;min-height:0;padding:16px 20px;gap:12px;overflow:auto}
.etop{display:flex;align-items:center;gap:12px}.etop input{font-size:17px;font-weight:700;background:transparent;border:1px solid transparent;width:auto;min-width:220px;padding:4px 8px}.etop input:hover,.etop input:focus{border-color:var(--line);background:var(--panel2)}
.saved{color:var(--muted);font-size:12.5px}
.screen{background:#000;border-radius:10px;overflow:hidden;display:flex;justify-content:center;border:1px solid var(--line)}#stage-player{width:100%;max-width:880px}#stage-player .ove-player{margin:0 auto}#stage-player canvas{max-height:58vh;margin:0 auto;width:auto!important;max-width:100%}
.xport{display:flex;align-items:center;gap:12px}.xport input[type=range]{flex:1;padding:0;accent-color:var(--accent)}.xport .t{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12.5px;min-width:96px;text-align:right}.xport .btn{min-width:74px}
.scenes{display:flex;gap:8px;overflow:auto;padding-bottom:4px}.scenes button{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:6px 11px;white-space:nowrap;font-size:13px}.scenes button:hover{border-color:#3a5272}.scenes small{color:var(--muted);margin-left:6px}
.side{border-left:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.tabs{display:flex;border-bottom:1px solid var(--line);padding:0 8px}.tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);padding:13px 11px;font-size:13.5px}.tabs button:hover{color:var(--text)}.tabs button.on{color:var(--accent);border-bottom-color:var(--accent)}
.pane{padding:18px;overflow:auto;min-height:0;flex:1}
.hist{border-top:1px solid var(--line);padding:10px 0;display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.hist b{font-size:13.5px}.hist small{display:block;color:var(--muted)}
.themes{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.theme{border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--panel2);color:var(--text);text-align:left}.theme:hover{border-color:#3a5272}
.sw{display:flex;height:26px;border-radius:6px;overflow:hidden;margin-bottom:6px}.sw i{flex:1}
.blocklist{display:flex;flex-direction:column;gap:8px}.block{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:9px;padding:9px 11px;background:var(--panel2)}.block b{font-size:13.5px}.block small{display:block;color:var(--muted)}
.result video,.result img{width:100%;border-radius:8px;border:1px solid var(--line);background:#000;margin-top:10px}
.cat{margin:26px 0 10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:12px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b2a42;border:1px solid #34506f;border-radius:9px;padding:10px 16px;z-index:9;max-width:80vw}
.toast.bad{background:#2a121a;border-color:#6b2433}
.modal{position:fixed;inset:0;background:rgba(3,6,10,.7);display:flex;align-items:center;justify-content:center;z-index:8}.modal>div{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px;width:min(440px,92vw)}
@media (max-width:900px){.editor{grid-template-columns:1fr;height:auto}.side{border-left:0;border-top:1px solid var(--line)}header.top{gap:10px;padding:0 12px}.busy{display:none!important}}
</style></head><body>
<header class="top"><a class="brand" href="#/"><span class="mark">OVE</span> AI studio</a>
<nav class="main"><a href="#/" data-nav="home">Projects</a><a href="#/library" data-nav="library">Library</a><a href="#/settings" data-nav="settings">Settings</a></nav>
<div class="grow"></div><div class="busy" id="busy"><div class="spin"></div><span id="busytext"></span></div><a class="btn" href="#/new">+ New video</a></header>
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
function toast(msg, bad) { var t = h('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, bad ? 6000 : 2600); }
function ago(ms) { var s = Math.max(1, Math.round((Date.now() - ms) / 1000)); if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago'; }
function dur(sec) { var m = Math.floor(sec / 60), s = Math.round(sec - m * 60); return m ? m + ':' + (s < 10 ? '0' : '') + s : s + 's'; }
function ask(title, value, ok) {
  var input = h('input', { value: value || '' }), m = h('div', { class: 'modal' }, h('div', null, [h('h2', { text: title }), input, h('div', { class: 'bar', style: 'margin:16px 0 0;justify-content:flex-end' }, [
    h('button', { class: 'btn sec', text: 'Cancel', onclick: function () { m.remove(); } }), h('button', { class: 'btn', text: 'OK', onclick: function () { m.remove(); ok(input.value.trim()); } })])]));
  document.body.appendChild(m); input.focus(); input.select(); input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { m.remove(); ok(input.value.trim()); } if (e.key === 'Escape') m.remove(); });
}
function confirmBox(text, ok) { var m = h('div', { class: 'modal' }, h('div', null, [h('p', { text: text }), h('div', { class: 'bar', style: 'margin:16px 0 0;justify-content:flex-end' }, [h('button', { class: 'btn sec', text: 'Cancel', onclick: function () { m.remove(); } }), h('button', { class: 'btn', text: 'Yes', onclick: function () { m.remove(); ok(); } })])])); document.body.appendChild(m); }

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
    // The stream may be briefly down; look again every few seconds so a finished job is never missed.
    var poll = setInterval(function () { if (!jobWaiters[job.id]) return clearInterval(poll); api('/api/job?id=' + job.id).then(function (r) { onJob(r.job); }, function () {}); }, 4000);
  });
}
function run(path, body, progress) { return api(path, body).then(function (r) { return waitJob(r.job, progress); }).then(function (j) { return j.result; }); }

/* routes */
var app = $('#app'), cleanup = null, status = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  var hash = location.hash.replace('#', '') || '/', parts = hash.split('/').filter(Boolean), view = parts[0] || 'home';
  document.querySelectorAll('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === (view === 'new' || view === 'p' ? 'home' : view)); });
  app.innerHTML = ''; app.scrollTop = 0;
  var go = { home: home, new: create, library: library, settings: settings }[view];
  if (view === 'p' && parts[1]) return editor(decodeURIComponent(parts[1]), parts[2]);
  if (view === 'making' && parts[1]) return making(decodeURIComponent(parts[1]), parts[2]);
  (go || home)();
}
window.addEventListener('hashchange', route);
function fail(el, e) { el.appendChild(h('div', { class: 'err', text: e && e.message ? e.message : String(e) })); }

/* projects */
function home() {
  var page = h('div', { class: 'page' }); app.appendChild(page);
  page.appendChild(h('div', { class: 'bar' }, [h('div', { class: 'grow' }, [h('h1', { text: 'Your videos' }), h('p', { class: 'lead', style: 'margin:0', text: 'Every video is a project you can open, edit and export.' })])]));
  api('/api/projects').then(function (r) {
    if (!r.projects.length) { page.appendChild(h('div', { class: 'empty' }, [h('h2', { text: 'Make your first video' }), h('p', { text: 'Describe it, add your pictures, and get a video you can change line by line.' }), h('a', { class: 'btn', href: '#/new', text: 'Create a video' })])); return; }
    var grid = h('div', { class: 'grid' }); r.projects.forEach(function (p) { grid.appendChild(card(p)); }); page.appendChild(grid);
    // Previews are made on first sight and kept, so they load one at a time instead of starting a browser each.
    [].reduce.call(grid.querySelectorAll('img'), function (chain, img) { return chain.then(function () { return new Promise(function (ok) { img.onload = img.onerror = ok; img.src = img.getAttribute('data-src'); }); }); }, Promise.resolve());
  }, function (e) { fail(page, e); });
}
function card(p) {
  var open = function () { location.hash = '#/p/' + encodeURIComponent(p.id); };
  var img = h('img', { 'data-src': '/api/thumb?id=' + encodeURIComponent(p.id), alt: '' }); img.addEventListener('error', function () { img.replaceWith(h('div', { class: 'ph', text: 'No preview' })); });
  return h('div', { class: 'card' }, [h('div', { class: 'thumb', onclick: open }, img),
    h('div', { class: 'cardbody' }, [h('b', { text: p.name }), h('div', { class: 'meta', text: p.width + '×' + p.height + ' · ' + dur(p.seconds) + ' · ' + p.scenes + ' scenes' }), h('div', { class: 'meta' }, ['Edited ' + ago(p.modified) + ' ', h('span', { class: 'tag', text: p.mode === 'template' ? 'editable text' : 'finished' })])]),
    h('div', { class: 'cardfoot' }, [h('button', { class: 'btn sec sm', text: 'Open', onclick: open }),
      h('button', { class: 'btn sec sm', text: 'Duplicate', onclick: function () { api('/api/project/duplicate', { id: p.id }).then(function () { toast('Duplicated'); route(); }, function (e) { toast(e.message, true); }); } }),
      h('button', { class: 'btn sec sm danger', text: 'Delete', onclick: function () { confirmBox('Delete "' + p.name + '"? It moves to the .trash folder, so it can be brought back by hand.', function () { api('/api/project/delete', { id: p.id }).then(function () { toast('Deleted'); route(); }, function (e) { toast(e.message, true); }); }); } })])]);
}

/* create */
var kinds = [['reel', 'Social reel', 'Vertical, about 20 seconds'], ['product', 'Product video', 'Square, about 18 seconds'], ['promo', 'Promo', 'Wide, about 30 seconds'], ['project', 'Case study', 'Wide, about a minute']];
var examples = ['Launch video for a budgeting app called Pocket, with three features and a call to download', 'Event invite for a design meetup on May 14 in Berlin', 'Product card for a hand-poured soy candle, price 24 dollars, free shipping'];
function create() {
  var kind = 'reel', files = [], page = h('div', { class: 'page narrow' }); app.appendChild(page);
  var brief = h('textarea', { placeholder: 'What is the video about? Who is it for? What should people do after watching?', style: 'min-height:130px' }), name = h('input', { placeholder: 'Optional. Defaults to the first words of the description' });
  var tiles = h('div', { class: 'tiles' }), fileList = h('div', { class: 'files' }), errBox = h('div');
  var drawTiles = function () { tiles.innerHTML = ''; kinds.forEach(function (k) { tiles.appendChild(h('button', { class: 'tile' + (kind === k[0] ? ' on' : ''), onclick: function () { kind = k[0]; drawTiles(); } }, [h('b', { text: k[1] }), h('span', { text: k[2] })])); }); }; drawTiles();
  var drawFiles = function () { fileList.innerHTML = ''; files.forEach(function (f, i) { fileList.appendChild(h('span', { text: f.name + '  ×', style: 'cursor:pointer', onclick: function () { files.splice(i, 1); drawFiles(); } })); }); };
  var picker = h('input', { type: 'file', multiple: true, accept: 'image/*,video/*,audio/*', style: 'display:none', onchange: function () { [].forEach.call(picker.files, function (f) { files.push(f); }); drawFiles(); picker.value = ''; } });
  var drop = h('div', { class: 'drop' }, ['Drop pictures here, or ', h('a', { href: '#', text: 'choose files', onclick: function (e) { e.preventDefault(); picker.click(); } }), picker]);
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); [].forEach.call(e.dataTransfer.files, function (f) { files.push(f); }); drawFiles(); });
  var duration = h('input', { type: 'number', min: '3', placeholder: 'Default' }), aspect = h('select', null, [['', 'Default for this kind'], ['9:16', 'Vertical 9:16'], ['1:1', 'Square 1:1'], ['16:9', 'Wide 16:9'], ['4:5', 'Portrait 4:5']].map(function (a) { return h('option', { value: a[0], text: a[1] }); }));
  var voice = h('input', { type: 'checkbox' }), review = h('input', { type: 'checkbox' }), go = h('button', { class: 'btn', text: 'Create video' });
  var chips = h('div', { class: 'chips' }, examples.map(function (t) { return h('button', { class: 'chip', text: t.length > 54 ? t.slice(0, 52) + '…' : t, title: t, onclick: function () { brief.value = t; } }); }));
  page.append(h('h1', { text: 'New video' }), h('p', { class: 'lead', text: 'Describe it and the studio picks a design, writes the copy and builds the scenes.' }),
    h('label', { class: 'f' }, [h('span', { text: 'What kind of video?' }), tiles]), h('label', { class: 'f' }, [h('span', { text: 'Describe your video' }), brief]), chips,
    h('label', { class: 'f' }, [h('span', { text: 'Your pictures and footage (optional)' }), drop, fileList]),
    h('details', null, [h('summary', { text: 'More options' }), h('div', { style: 'margin-top:12px' }, [h('label', { class: 'f' }, [h('span', { text: 'Name' }), name]), h('div', { class: 'two' }, [h('label', { class: 'f' }, [h('span', { text: 'Length in seconds' }), duration]), h('label', { class: 'f' }, [h('span', { text: 'Shape' }), aspect])]),
      h('label', { class: 'f' }, [voice, ' Add a voiceover with captions (uses your AI provider)']), h('label', { class: 'f' }, [review, ' Check the result for problems and fix them (slower)'])])]), errBox, go);
  go.addEventListener('click', function () {
    errBox.innerHTML = ''; var text = brief.value.trim(); if (!text) { fail(errBox, new Error('Describe the video first')); return; }
    go.disabled = true; go.textContent = 'Starting…';
    var title = name.value.trim() || text.split(' ').slice(0, 6).join(' ');
    api('/api/project/new', { name: title, kind: kind }).then(function (made) {
      return files.reduce(function (p, f) { return p.then(function () { return fetch('/api/upload?project=' + encodeURIComponent(made.id) + '&name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f }).then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Upload failed'); }); }); }); }, Promise.resolve()).then(function () {
        var body = { brief: text, kind: kind, folder: made.id, narration: voice.checked, review: review.checked }; if (duration.value) body.duration = duration.value; if (aspect.value) body.aspect = aspect.value;
        return api('/api/compose', body);
      }).then(function (r) { location.hash = '#/making/' + encodeURIComponent(made.id) + '/' + r.job.id; });
    }).catch(function (e) { go.disabled = false; go.textContent = 'Create video'; fail(errBox, e); });
  });
}
function making(id, jobId) {
  var log = h('div', { class: 'log' }), title = h('h1', { text: 'Making your video…' }), box = h('div', { class: 'center' }, [h('div', { class: 'spin' }), title, h('p', { class: 'lead', text: 'Choosing a design, writing the text and building the scenes. This usually takes under a minute.' }), log]); app.appendChild(box);
  waitJob({ id: jobId }, function (j) { log.textContent = j.messages.join(String.fromCharCode(10)); log.scrollTop = log.scrollHeight; }).then(function () { location.hash = '#/p/' + encodeURIComponent(id); }, function (e) {
    box.querySelector('.spin').remove(); title.textContent = 'That did not work'; fail(box, e); box.appendChild(h('div', { class: 'bar', style: 'justify-content:center' }, [h('a', { class: 'btn', href: '#/new', text: 'Try again' }), h('button', { class: 'btn sec', text: 'Delete the empty project', onclick: function () { api('/api/project/delete', { id: id }).then(function () { location.hash = '#/'; }); } })]));
  });
}

/* editor */
function editor(id, tabHint) {
  var d, player = null, tab = tabHint || 'edit', box = h('div', { class: 'editor' }), stage = h('div', { class: 'stage' }), side = h('div', { class: 'side' }); box.append(stage, side); app.appendChild(box); app.style.overflow = 'hidden';
  var destroyed = false; cleanup = function () { destroyed = true; document.removeEventListener('keydown', keys); app.style.overflow = ''; if (player) { try { player.destroy(); } catch (e) {} } };
  var file = id + '/composition.json', savedNote = h('span', { class: 'saved' }), screen = h('div', { class: 'screen' }, h('div', { id: 'stage-player' })), sceneRow = h('div', { class: 'scenes' }), nameInput = h('input', { title: 'Rename' });
  var playBtn = h('button', { class: 'btn sm', text: 'Play' }), scrub = h('input', { type: 'range', min: '0', max: '1', value: '0', step: '1' }), clock = h('span', { class: 't' }), xport = h('div', { class: 'xport' }, [playBtn, scrub, clock]);
  stage.append(h('div', { class: 'etop' }, [h('a', { href: '#/', text: '← Projects' }), nameInput, savedNote]), screen, xport, sceneRow);
  function tick(f) { scrub.value = String(f); clock.textContent = dur(f / d.fps) + ' / ' + dur(d.durationFrames / d.fps); }
  playBtn.addEventListener('click', function () { if (!player) return; if (player.playing) player.pause(); else player.play(); });
  scrub.addEventListener('input', function () { if (player) { if (player.playing) player.pause(); player.seek(Number(scrub.value)); tick(Number(scrub.value)); } });
  document.addEventListener('keydown', keys);
  function keys(e) { if (e.key === ' ' && player && e.target === document.body) { e.preventDefault(); playBtn.click(); } }
  var tabs = h('div', { class: 'tabs' }), pane = h('div', { class: 'pane' }); side.append(tabs, pane);
  var names = [['edit', 'Edit'], ['ai', 'Ask AI'], ['look', 'Look'], ['history', 'History'], ['export', 'Export']];
  function drawTabs() { tabs.innerHTML = ''; names.forEach(function (n) { tabs.appendChild(h('button', { class: tab === n[0] ? 'on' : '', text: n[1], onclick: function () { tab = n[0]; drawTabs(); drawPane(); } })); }); }
  function playerStart(frame) {
    if (player) { try { player.destroy(); } catch (e) {} player = null; } $('#stage-player').innerHTML = '';
    return import('/player.js').then(function (m) { return m.createPlayer($('#stage-player'), { composition: d.source.raw, media: d.source.media, assetBase: location.origin + d.source.base, allowCode: false, controls: false }); }).then(function (p) {
      if (destroyed) { p.destroy(); return; } player = p; scrub.max = String(Math.max(1, d.durationFrames - 1)); tick(frame || 0); playBtn.textContent = 'Play';
      p.on('frame', function (f) { tick(typeof f === 'number' ? f : p.frame); }); p.on('play', function () { playBtn.textContent = 'Pause'; }); p.on('pause', function () { playBtn.textContent = 'Play'; }); p.on('ended', function () { playBtn.textContent = 'Play'; });
      p.on('error', function (e) { savedNote.textContent = 'Preview: ' + (e && e.message ? e.message : e); }); if (frame) p.seek(frame);
    }).catch(function (e) { $('#stage-player').appendChild(h('div', { class: 'err', text: 'The preview could not start: ' + e.message })); });
  }
  function load(keepFrame) {
    var frame = keepFrame && player ? player.frame : 0;
    return api('/api/project?id=' + encodeURIComponent(id)).then(function (r) { d = r; nameInput.value = d.name; drawScenes(); return playerStart(frame); }).then(function () { drawPane(); }, function (e) { pane.innerHTML = ''; fail(pane, e); });
  }
  function drawScenes() { sceneRow.innerHTML = ''; d.scenes.forEach(function (s) { sceneRow.appendChild(h('button', { onclick: function () { if (player) player.seek(s.startFrame); } }, [s.name, h('small', { text: dur(s.durationFrames / d.fps) })])); }); }
  nameInput.addEventListener('change', function () { var v = nameInput.value.trim(); if (!v) { nameInput.value = d.name; return; } api('/api/project/rename', { id: id, name: v }).then(function () { d.name = v; savedNote.textContent = 'Renamed'; }, function (e) { toast(e.message, true); }); });
  // Saves go through one function: write, then reload the preview where it was.
  function save(path, body, note) { savedNote.textContent = 'Saving…'; return api(path, body).then(function () { savedNote.textContent = note || 'Saved'; return load(true); }, function (e) { savedNote.textContent = ''; toast(e.message, true); throw e; }); }
  function drawPane() { pane.innerHTML = ''; if (!d) return; ({ edit: paneEdit, ai: paneAi, look: paneLook, history: paneHistory, export: paneExport }[tab])(); }
  var themeNames = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'radius', 'headWeight'];
  function paneEdit() {
    var fields = [], apply = h('button', { class: 'btn', text: 'Save changes' }), box2 = h('div');
    if (d.mode === 'template') {
      d.variables.filter(function (v) { return themeNames.indexOf(v.name) < 0; }).forEach(function (v) {
        var input, label = v.description ? v.description : v.name.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ');
        if (v.type === 'boolean') input = h('input', { type: 'checkbox' }), input.checked = !!v.value;
        else if (v.type === 'color') input = h('input', { type: 'color', value: /^#[0-9a-fA-F]{6}$/.test(v.value) ? v.value : '#000000' });
        else if (v.type === 'number') input = h('input', { type: 'number', value: String(v.value) });
        else if (v.type === 'list') input = h('textarea', { style: 'min-height:120px;font:12px ui-monospace,Consolas,monospace' }), input.value = JSON.stringify(v.value, null, 2);
        else input = h('textarea', { style: 'min-height:' + (String(v.value).length > 60 ? 90 : 42) + 'px' }), input.value = v.value == null ? '' : String(v.value);
        fields.push({ v: v, input: input }); box2.appendChild(h('label', { class: 'f' }, [h('span', { text: label }), input]));
      });
      if (!fields.length) box2.appendChild(h('p', { class: 'lead', text: 'This video has no text fields to edit. Use Ask AI or add scenes from Look.' }));
      apply.addEventListener('click', function () {
        var values = {}; try { fields.forEach(function (f) { var v = f.v, x = f.input; values[v.name] = v.type === 'boolean' ? x.checked : v.type === 'number' ? Number(x.value) : v.type === 'list' ? JSON.parse(x.value) : x.value; }); } catch (e) { toast('A list is not valid JSON: ' + e.message, true); return; }
        save('/api/variables', { id: id, values: values }, 'Saved');
      });
    } else {
      d.texts.forEach(function (t) { var input = h('textarea', { style: 'min-height:' + (t.content.length > 60 ? 90 : 42) + 'px' }); input.value = t.content; fields.push({ t: t, input: input }); box2.appendChild(h('label', { class: 'f' }, [h('span', { text: t.scene + ' · ' + t.id }), input])); });
      if (!fields.length) box2.appendChild(h('p', { class: 'lead', text: 'No text found in this video.' }));
      apply.addEventListener('click', function () {
        var changed = fields.filter(function (f) { return f.input.value.trim() && f.input.value !== f.t.content; });
        changed.reduce(function (p, f) { return p.then(function () { return api('/api/text', { id: id, path: f.t.path, content: f.input.value }); }); }, Promise.resolve()).then(function () { savedNote.textContent = changed.length ? 'Saved' : 'Nothing changed'; return load(true); }, function (e) { toast(e.message, true); });
      });
    }
    pane.append(h('h2', { text: 'Text' }), h('p', { class: 'lead', style: 'font-size:13px', text: d.mode === 'template' ? 'Change the words and colours; the whole design follows.' : 'Every piece of text in the video, in the order it appears.' }), box2, fields.length ? apply : null);
  }
  function paneAi() {
    var text = h('textarea', { placeholder: 'e.g. Make the pace faster and the headline shorter', style: 'min-height:110px' }), go = h('button', { class: 'btn', text: 'Apply change' }), errBox = h('div');
    var chips = h('div', { class: 'chips' }, ['Make it faster paced', 'Shorten all the text', 'Add a call to action at the end', 'Calmer and more minimal', 'Use bolder, larger headlines'].map(function (t) { return h('button', { class: 'chip', text: t, onclick: function () { text.value = t; } }); }));
    pane.append(h('h2', { text: 'Ask AI to change it' }), h('p', { class: 'lead', style: 'font-size:13px', text: 'Describe the change in your own words. Every change is saved in History, so you can go back.' }), text, chips,
      d.mode === 'template' ? h('div', { class: 'note', text: 'After an AI change this video becomes a finished video: text is then edited line by line instead of by field.' }) : null, errBox, go);
    go.addEventListener('click', function () {
      errBox.innerHTML = ''; if (!text.value.trim()) return; go.disabled = true; go.textContent = 'Working…';
      run('/api/refine', { file: file, instruction: text.value.trim() }, function (j) { savedNote.textContent = j.messages.length ? j.messages[j.messages.length - 1] : 'Working…'; }).then(function (r) { savedNote.textContent = 'Changed'; toast('Done' + (r.warnings && r.warnings.length ? ' (with notes)' : '')); return load(false); }, function (e) { go.disabled = false; go.textContent = 'Apply change'; fail(errBox, e); });
    });
  }
  function paneLook() {
    pane.append(h('h2', { text: 'Look' }));
    var themes = h('div', { class: 'themes' }), blocks = h('div', { class: 'blocklist' }), cat = h('select', { style: 'margin-bottom:12px' }), all = [];
    pane.append(h('p', { class: 'lead', style: 'font-size:13px', text: 'Pick a colour theme. It restyles every scene.' }), themes, h('h2', { style: 'margin-top:26px', text: 'Add a scene' }), cat, blocks);
    api('/api/library').then(function (lib) {
      var canTheme = Object.keys(d.theme).length > 0;
      lib.themes.forEach(function (t) { var v = t.variables, b = h('button', { class: 'theme', disabled: !canTheme, title: canTheme ? t.description : 'This video does not use a theme', onclick: function () { save('/api/theme', { id: id, theme: t.id }, 'Look changed'); } }, [h('div', { class: 'sw' }, [v.bg, v.surface, v.accent, v.accent2].map(function (c) { return h('i', { style: 'background:' + c }); })), h('b', { text: t.name })]); themes.appendChild(b); });
      all = lib.blocks; var cats = ['all'].concat(all.map(function (b) { return b.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; })); cat.innerHTML = ''; cats.forEach(function (c) { cat.appendChild(h('option', { value: c, text: c === 'all' ? 'All kinds' : c })); });
      var draw = function () { blocks.innerHTML = ''; all.filter(function (b) { return cat.value === 'all' || b.category === cat.value; }).forEach(function (b) { blocks.appendChild(h('div', { class: 'block' }, [h('div', null, [h('b', { text: b.name }), h('small', { text: b.description })]), h('button', { class: 'btn sec sm', text: 'Add', onclick: function () { save('/api/add-block', { id: id, block: b.id }, 'Added ' + b.name).then(function () { toast('Added ' + b.name); }, function () {}); } })])); }); };
      cat.addEventListener('change', draw); draw();
    }, function (e) { fail(pane, e); });
  }
  function paneHistory() {
    pane.append(h('h2', { text: 'History' }), h('p', { class: 'lead', style: 'font-size:13px', text: 'Every change is kept. Go back to any version.' }));
    var list = h('div'); pane.appendChild(list);
    api('/api/history?file=' + encodeURIComponent(file)).then(function (r) {
      if (!r.revisions.length) { list.appendChild(h('p', { class: 'lead', text: 'No versions yet.' })); return; }
      r.revisions.slice().reverse().forEach(function (rev, i) {
        list.appendChild(h('div', { class: 'hist' }, [h('div', null, [h('b', { text: '#' + rev.n + ' · ' + rev.kind }), h('small', { text: rev.label }), h('small', { text: new Date(rev.at).toLocaleString() })]), i === 0 ? h('span', { class: 'tag', text: 'current' }) : h('button', { class: 'btn sec sm', text: 'Restore', onclick: function () { api('/api/restore', { file: file, n: rev.n }).then(function () { savedNote.textContent = 'Restored #' + rev.n; return load(false); }, function (e) { toast(e.message, true); }); } })]));
      });
    }, function (e) { fail(list, e); });
  }
  function paneExport() {
    var quality = h('select', null, [['1', 'Full quality'], ['0.5', 'Half size (faster)'], ['0.25', 'Quick draft']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })), go = h('button', { class: 'btn', text: 'Render video' }), out = h('div', { class: 'result' });
    var checkBtn = h('button', { class: 'btn sec', text: 'Check for problems' }), thumbBtn = h('button', { class: 'btn sec', text: 'Make thumbnail' }), errBox = h('div');
    pane.append(h('h2', { text: 'Export' }), h('p', { class: 'lead', style: 'font-size:13px', text: d.width + '×' + d.height + ' · ' + dur(d.durationFrames / d.fps) + ' · MP4' }), h('label', { class: 'f' }, [h('span', { text: 'Quality' }), quality]), go,
      h('div', { class: 'bar', style: 'margin:14px 0 0' }, [checkBtn, thumbBtn]), errBox, out);
    var guard = function (btn, label, fn) { btn.addEventListener('click', function () { errBox.innerHTML = ''; btn.disabled = true; btn.textContent = 'Working…'; fn().then(function () { btn.disabled = false; btn.textContent = label; }, function (e) { btn.disabled = false; btn.textContent = label; fail(errBox, e); }); }); };
    guard(go, 'Render video', function () { return run('/api/render', { file: file, output: 'out.mp4', scale: Number(quality.value) }, function (j) { go.textContent = j.messages.length ? j.messages[j.messages.length - 1] : 'Working…'; }).then(function (r) { out.innerHTML = ''; out.append(h('b', { text: 'Your video is ready' }), h('video', { src: r.url, controls: true }), h('div', { class: 'bar', style: 'margin:10px 0 0' }, [h('a', { class: 'btn sm', href: r.url, download: id + '.mp4', text: 'Download MP4' }), h('span', { class: 'saved', text: r.relative })])); }); });
    guard(checkBtn, 'Check for problems', function () { return run('/api/review', { file: file }).then(function (r) { out.innerHTML = ''; out.append(h('b', { text: r.issues.length ? r.issues.length + ' thing(s) to look at' : 'No problems found' }), h('ul', null, r.issues.slice(0, 12).map(function (i) { return h('li', { text: (i.message || String(i)) }); })), h('img', { src: r.url + '?t=' + Date.now() })); }); });
    guard(thumbBtn, 'Make thumbnail', function () { return run('/api/thumbnail', { file: file }).then(function (r) { out.innerHTML = ''; out.append(h('b', { text: 'Thumbnail' }), h('img', { src: r.url + '?t=' + Date.now() }), h('div', { class: 'bar', style: 'margin:10px 0 0' }, [h('a', { class: 'btn sm', href: r.url, download: id + '.png', text: 'Download PNG' })])); }); });
  }
  drawTabs(); load(false);
}

/* library */
function library() {
  var page = h('div', { class: 'page' }); app.appendChild(page);
  page.append(h('h1', { text: 'Library' }), h('p', { class: 'lead', text: 'Scenes, effects and looks you can add to any video.' }));
  api('/api/library').then(function (lib) {
    page.appendChild(h('h2', { text: 'Themes' })); var row = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(170px,1fr))' });
    lib.themes.forEach(function (t) { var v = t.variables; row.appendChild(h('div', { class: 'card', style: 'padding:10px' }, [h('div', { class: 'sw' }, [v.bg, v.surface, v.accent, v.accent2].map(function (c) { return h('i', { style: 'background:' + c }); })), h('b', { text: t.name }), h('div', { class: 'meta', text: t.description })])); }); page.appendChild(row);
    var cats = lib.blocks.map(function (b) { return b.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    cats.forEach(function (c) {
      page.appendChild(h('div', { class: 'cat', text: c })); var g = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(250px,1fr))' });
      lib.blocks.filter(function (b) { return b.category === c; }).forEach(function (b) { g.appendChild(h('div', { class: 'card', style: 'padding:14px;gap:8px' }, [h('b', { text: b.name }), h('div', { class: 'meta', text: b.description }), h('div', { class: 'meta', text: (b.kind === 'overlay' ? 'Overlay · ' : 'Scene · ') + dur(b.durationFrames / 30) }), h('button', { class: 'btn sec sm', style: 'align-self:flex-start', text: 'Add to a video…', onclick: function () { pick(b); } })])); });
      page.appendChild(g);
    });
  }, function (e) { fail(page, e); });
}
function pick(block) {
  api('/api/projects').then(function (r) {
    if (!r.projects.length) { toast('Make a video first', true); return; }
    var sel = h('select', null, r.projects.map(function (p) { return h('option', { value: p.id, text: p.name }); })), m = h('div', { class: 'modal' }, h('div', null, [h('h2', { text: 'Add ' + block.name + ' to…' }), sel, h('div', { class: 'bar', style: 'margin:16px 0 0;justify-content:flex-end' }, [h('button', { class: 'btn sec', text: 'Cancel', onclick: function () { m.remove(); } }), h('button', { class: 'btn', text: 'Add', onclick: function () { api('/api/add-block', { id: sel.value, block: block.id }).then(function () { m.remove(); location.hash = '#/p/' + encodeURIComponent(sel.value); }, function (e) { toast(e.message, true); }); } })])]));
    document.body.appendChild(m);
  });
}

/* settings */
function settings() {
  var page = h('div', { class: 'page narrow' }); app.appendChild(page);
  page.append(h('h1', { text: 'Settings' }), h('p', { class: 'lead', text: 'Where your videos live and which AI is behind the studio.' }));
  api('/api/status').then(function (s) {
    var rows = [['Videos are saved in', s.outDir], ['AI provider', s.provider ? s.provider.id + ' · ' + s.provider.model : 'Not connected']];
    rows.forEach(function (r) { page.appendChild(h('label', { class: 'f' }, [h('span', { text: r[0] }), h('input', { value: r[1], readonly: true })])); });
    if (s.error) page.appendChild(h('div', { class: 'err', text: s.error + '  Put your key in a .env file as GROQ_API_KEY=... and start the studio again.' }));
    else page.appendChild(h('div', { class: 'note', text: 'Connected. Creating videos, voiceovers and AI changes use this provider; editing, previewing and exporting do not.' }));
    page.appendChild(h('p', { class: 'meta', text: 'Start the studio with ove ai studio --out folder to keep videos somewhere else.' }));
  }, function (e) { fail(page, e); });
}

connect(); route();
</script></body></html>`;
