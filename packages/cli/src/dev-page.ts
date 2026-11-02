// The `ove dev` page. Frames come from the server as PNGs rendered by the real renderer; the page caches them per composition
// version, keeps a few requests ahead of the playhead, and during playback shows the newest frame it has while the rest render.
// The script deliberately uses no backticks or ${} so it can live inside this template string unescaped.
export const devPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OVE preview</title>
<style>
:root{--bg:#0b0f17;--panel:#111827;--line:#1f2937;--text:#e5e7eb;--muted:#9ca3af;--accent:#818cf8;--err:#f87171}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;height:100vh;display:grid;grid-template-columns:minmax(0,1fr) 300px;grid-template-rows:auto minmax(0,1fr) auto}
header{grid-column:1/3;display:flex;gap:12px;align-items:baseline;padding:10px 16px;border-bottom:1px solid var(--line)}
header b{font-size:14px}#file,#status{color:var(--muted)}#status{margin-left:auto}
#stage{position:relative;display:flex;align-items:center;justify-content:center;min-height:0;padding:16px}
#frame{width:100%;height:100%;object-fit:contain}
#layers{max-height:190px;overflow:auto;margin-top:6px;position:relative}
.lrow{position:relative;height:22px}
.lbar{position:absolute;top:3px;height:16px;background:#334155;border-radius:3px;font-size:11px;line-height:16px;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#cbd5e1;cursor:grab;user-select:none;touch-action:none;box-sizing:border-box}
.lbar.sel{background:#4f46e5;color:#fff}.lbar.ro{background:repeating-linear-gradient(45deg,#1e293b 0 6px,#273449 6px 12px);color:var(--muted);cursor:pointer}
.lbar .grip{position:absolute;right:0;top:0;bottom:0;width:7px;cursor:ew-resize;background:rgba(255,255,255,.12)}.lbar.ro .grip{display:none}
#props .field{display:flex;gap:8px;align-items:center;margin:6px 0}#props .field span{width:92px;flex:none;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis}
#props .field input:not([type=checkbox]):not([type=color]),#props .field textarea{flex:1;min-width:0}#props .field input[type=color]{width:34px;height:28px;padding:1px;flex:none}#props h3{margin:0 0 2px;font-size:14px}#props .note{color:var(--muted);font-size:12px;margin:4px 0 8px}#props .err{color:#fca5a5;font-size:12px;white-space:pre-wrap}
#live{position:absolute;inset:16px;display:none;align-items:center;justify-content:center}
#live .ove-player{width:auto!important;height:100%;display:flex;align-items:center;justify-content:center}
#live canvas{width:auto!important;height:auto!important;max-width:100%;max-height:100%}
#error{position:absolute;top:16px;left:16px;right:16px;background:#2a1215;border:1px solid var(--err);color:#fecaca;padding:10px 12px;border-radius:6px;white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;max-height:60%;overflow:auto;display:none}
aside{grid-row:2/4;grid-column:2;border-left:1px solid var(--line);background:var(--panel);padding:14px;overflow:auto}
aside h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 4px}
footer{padding:10px 16px 14px;border-top:1px solid var(--line)}
.controls{display:flex;gap:10px;align-items:center;margin-bottom:8px}
button{background:var(--line);color:var(--text);border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit}button:hover{background:#2b3648}
#time{font-variant-numeric:tabular-nums;color:var(--muted)}.keys{margin-left:auto;color:var(--muted);font-size:12px}
#timeline{position:relative;height:40px;cursor:pointer;user-select:none;touch-action:none}
.scene{position:absolute;top:0;height:18px;background:#1e293b;border:1px solid #334155;border-radius:3px;font-size:11px;line-height:16px;padding:0 5px;overflow:hidden;white-space:nowrap;color:var(--muted)}
#track{position:absolute;top:26px;left:0;right:0;height:6px;background:var(--line);border-radius:3px}
#playhead{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--accent);pointer-events:none}
label{display:block;margin:12px 0 4px;color:var(--text)}label small{color:var(--muted);display:block;font-size:12px}
input,textarea{width:100%;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:5px;padding:6px 7px;font:inherit}textarea{resize:vertical;min-height:54px}
input:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px}
.row{display:flex;gap:6px;align-items:center}.row input[type=color]{width:42px;height:32px;padding:2px;flex:none}.row input[type=checkbox]{width:auto}
.hint{color:var(--muted);font-size:12px;margin-top:6px}
</style></head>
<body>
<header><b id="name">OVE preview</b><span id="file"></span><span id="status">connecting…</span></header>
<main id="stage"><img id="frame" alt="Current frame"><div id="live"></div><div id="error" role="alert"></div></main>
<aside><div id="props"><h2>Layer</h2><p class="note">Click a layer bar below the timeline to edit it. Drag a bar to move it in time, drag its right edge to change when it ends.</p></div><h2 style="margin-top:18px">Variables</h2><div id="vars"></div><p class="hint" id="varhint"></p></aside>
<footer>
  <div class="controls"><button id="play" title="Play or pause (space)">Play</button><button id="undo" title="Undo the last edit made here (ctrl+z)" disabled>Undo</button><span id="time"></span><span class="keys">space play · ← → frame · shift ± 10 · home/end</span></div>
  <div id="timeline"><div id="scenes"></div><div id="track"></div><div id="playhead"></div></div>
  <div id="layers"></div>
</footer>
<script>
var $ = function (s) { return document.querySelector(s); };
var state = null, frame = 0, playing = false, shown = '', cache = new Map(), inflight = new Set(), varTimer = 0;
function comp() { return state && state.composition; }
function key(f) { return state.version + ':' + f; }
function clamp(f) { return Math.max(0, Math.min(comp().durationFrames - 1, f)); }
function request(f) {
  if (!comp() || f < 0 || f >= comp().durationFrames) return;
  var k = key(f), v = state.version; if (cache.has(k) || inflight.has(k)) return; inflight.add(k);
  fetch('/api/frame?f=' + f + '&v=' + v).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); })
    .then(function (b) { if (v !== state.version) return; cache.set(k, URL.createObjectURL(b)); while (cache.size > 400) { var first = cache.keys().next().value; URL.revokeObjectURL(cache.get(first)); cache.delete(first); } draw(); })
    .catch(function () {}).then(function () { inflight.delete(k); prefetch(); });
}
function prefetch() { if (!comp()) return; var ahead = playing ? 30 : 3; for (var i = 1; i <= ahead && inflight.size < 6; i++) request((frame + i) % comp().durationFrames); }
function draw() {
  var c = comp(); if (!c) return; var url = cache.get(key(frame));
  if (!playing && url && shown !== url) { $('#frame').src = url; shown = url; }
  $('#status').textContent = playing ? 'playing live with sound' : url ? 'exact frame' : 'rendering frame ' + frame + '…';
  $('#time').textContent = 'frame ' + frame + ' / ' + (c.durationFrames - 1) + ' · ' + (frame / c.fps).toFixed(2) + 's of ' + (c.durationFrames / c.fps).toFixed(2) + 's';
  $('#playhead').style.left = (c.durationFrames > 1 ? frame / (c.durationFrames - 1) * 100 : 0) + '%';
}
function seek(f) { if (!comp()) return; frame = clamp(f); if (playing && player) player.seek(frame); request(frame); prefetch(); draw(); }
// Playing hands over to the live Player (drawn in this browser, with sound); pausing returns to the exact frame rendered by the server.
var player = null, playerVersion = -1, starting = false;
function dropPlayer() { if (player) { player.destroy(); player = null; } playerVersion = -1; }
function ensurePlayer() {
  if (player && playerVersion === state.version) return Promise.resolve(player); dropPlayer();
  return fetch('/api/source').then(function (r) { return r.json(); }).then(function (source) { return import('/player.js').then(function (m) {
    return m.createPlayer($('#live'), { composition: source.raw, values: source.values, media: source.media, assetBase: location.origin + '/media/', controls: false }); }); })
    .then(function (p) { player = p; playerVersion = state.version;
      p.on('frame', function (f) { if (playing) { frame = f; draw(); } }); p.on('ended', function () { setPlaying(false); });
      p.on('error', function (e) { $('#status').textContent = 'live playback: ' + (e && e.message ? e.message : e); }); return p; });
}
function setPlaying(p) {
  if (p && comp() && !playing && !starting) { starting = true; $('#status').textContent = 'starting live playback…';
    ensurePlayer().then(function (pl) { return pl.seek(frame).then(function () { playing = true; $('#live').style.display = 'flex'; $('#frame').style.visibility = 'hidden'; $('#play').textContent = 'Pause'; return pl.play(); }); })
      .catch(function (e) { $('#status').textContent = 'live playback failed: ' + e.message; }).then(function () { starting = false; draw(); });
    return; }
  if (!p && playing) { if (player) { player.pause(); frame = player.frame; } playing = false; $('#live').style.display = 'none'; $('#frame').style.visibility = 'visible'; $('#play').textContent = 'Play'; shown = ''; request(frame); prefetch(); draw(); }
}
// Studio: one bar per layer on the same time scale as the timeline. Editable bars can be dragged (move in time) or resized from the
// right edge (end frame); clicking one opens its properties. Edits go to the server, which validates and writes composition.json.
var selected = null, selectedRaw = null;
function el(tag, props, children) { var e = document.createElement(tag); Object.keys(props || {}).forEach(function (k) { if (k === 'style') e.style.cssText = props[k]; else if (k === 'text') e.textContent = props[k]; else e[k] = props[k]; }); (children || []).forEach(function (c) { e.appendChild(c); }); return e; }
function pct(f) { return (f / comp().durationFrames * 100) + '%'; }
function renderLayers() {
  var box = $('#layers'); box.innerHTML = ''; if (!comp()) return;
  comp().layers.forEach(function (l) {
    var bar = el('div', { className: 'lbar' + (l.editable ? '' : ' ro') + (l.id === selected ? ' sel' : ''), title: l.id + ' (' + l.type + ') · frames ' + l.start + '–' + (l.end - 1) + (l.editable ? '' : ' · read-only here'), text: (l.depth ? '\\u2514 ' : '') + l.id + ' · ' + l.type });
    bar.style.left = pct(l.start); bar.style.width = 'calc(' + pct(Math.max(1, l.end - l.start)) + ' - 1px)';
    if (l.editable) { var grip = el('div', { className: 'grip' }); bar.appendChild(grip); grip.addEventListener('pointerdown', function (e) { e.stopPropagation(); startDrag(e, l, bar, 'end'); }); bar.addEventListener('pointerdown', function (e) { startDrag(e, l, bar, 'move'); }); }
    else bar.addEventListener('click', function () { selectLayer(l.id); });
    box.appendChild(el('div', { className: 'lrow' }, [bar]));
  });
}
function startDrag(e, layer, bar, mode) {
  selectLayer(layer.id); var x0 = e.clientX, width = $('#layers').getBoundingClientRect().width, delta = 0, left0 = parseFloat(bar.style.left), total = comp().durationFrames; bar.setPointerCapture(e.pointerId); bar.style.cursor = 'grabbing';
  function move(ev) { delta = Math.round((ev.clientX - x0) / width * total); if (mode === 'move') bar.style.left = 'calc(' + left0 + '% + ' + (delta / total * width) + 'px)'; else bar.style.width = 'calc(' + pct(Math.max(1, layer.end - layer.start + delta)) + ' - 1px)'; $('#status').textContent = (mode === 'move' ? 'move by ' : 'end ') + (delta >= 0 ? '+' : '') + delta + ' frames'; }
  function up() { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.style.cursor = ''; if (!delta) return;
    waitForRaw().then(function (raw) { var start = typeof raw.startFrame === 'number' ? raw.startFrame : 0, parentOffset = layer.start - start, set = {};
      if (typeof raw.startFrame === 'string' || typeof raw.endFrame === 'string') return showPropsError('Its timing comes from a variable, so it can only be changed in the file.');
      if (mode === 'move') { set.startFrame = Math.max(0, start + delta); if (typeof raw.endFrame === 'number') set.endFrame = Math.max(set.startFrame + 1, raw.endFrame + delta); }
      else set.endFrame = Math.max(start + 1, layer.end - parentOffset + delta);
      editLayer(set, []); }); }
  bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up);
}
var rawRequest = null;
function waitForRaw() { return rawRequest || Promise.resolve(selectedRaw); }
function selectLayer(id) { selected = id; document.querySelectorAll('.lbar').forEach(function (b) { b.classList.toggle('sel', b.title.indexOf(id + ' (') === 0); });
  rawRequest = fetch('/api/layer?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (info) { selectedRaw = info.layer; renderProps(info); rawRequest = null; return info.layer; }); return rawRequest; }
var common = ['x', 'y', 'width', 'height', 'opacity', 'rotation', 'scale', 'startFrame', 'endFrame'];
function renderProps(info) {
  var box = $('#props'), row = (comp().layers.filter(function (l) { return l.id === info.id; })[0]) || {}; box.innerHTML = '';
  box.appendChild(el('h2', { text: 'Layer' })); box.appendChild(el('h3', { text: info.id + ' · ' + (row.type || '') }));
  box.appendChild(el('p', { className: 'note', text: 'Frames ' + row.start + '–' + (row.end - 1) + (info.editable ? '. Changes are saved to composition.json.' : '. ' + info.reason) }));
  box.appendChild(el('div', { className: 'err', id: 'propsError' }));
  if (!info.editable || !info.layer) return;
  var layer = info.layer, keys = Object.keys(layer).filter(function (k) { return ['id', 'type'].indexOf(k) < 0 && ['number', 'string', 'boolean'].indexOf(typeof layer[k]) >= 0; });
  common.forEach(function (k) { if (keys.indexOf(k) < 0 && !(row.type === 'audio' && ['x', 'y', 'width', 'height', 'opacity', 'rotation', 'scale'].indexOf(k) >= 0)) keys.push(k); });
  keys.forEach(function (k) { var v = layer[k], templated = typeof v === 'string' && v.indexOf('{{') >= 0, input;
    if (typeof v === 'boolean') { input = el('input', { type: 'checkbox', checked: v }); }
    else if (k === 'content') { input = el('textarea', { value: v || '', rows: 2 }); }
    else if (typeof v === 'number' || (v === undefined && common.indexOf(k) >= 0)) { input = el('input', { type: 'number', step: 'any', value: v === undefined ? '' : v, placeholder: 'default' }); }
    else { input = el('input', { value: v === undefined ? '' : v }); }
    if (templated) { input.disabled = true; input.title = 'From a variable; change it in the file or the variables panel'; }
    input.addEventListener('change', function () { var set = {}, unset = [];
      if (input.type === 'checkbox') set[k] = input.checked; else if (input.type === 'number') { if (input.value === '') unset.push(k); else set[k] = Number(input.value); } else set[k] = input.value;
      editLayer(set, unset); });
    var field = el('label', { className: 'field' }, [el('span', { text: k, title: k }), input]);
    if (typeof v === 'string' && /^(#[0-9a-f]{6})$/i.test(v)) { var picker = el('input', { type: 'color', value: v }); picker.addEventListener('change', function () { input.value = picker.value; var set = {}; set[k] = picker.value; editLayer(set, []); }); field.insertBefore(picker, input); }
    box.appendChild(field); });
}
function showPropsError(message) { var e = document.querySelector('#propsError'); if (e) e.textContent = message || ''; }
function editLayer(set, unset) { showPropsError(''); $('#status').textContent = 'saving…';
  fetch('/api/layer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: selected, set: set, unset: unset }) }).then(function (r) { return r.json(); })
    .then(function (result) { if (!result.ok) { showPropsError(result.error); renderLayers(); $('#status').textContent = 'not saved'; } }); }
function undo() { fetch('/api/undo', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (result) { if (!result.ok) $('#status').textContent = result.error; }); }
function renderTimeline() {
  var c = comp(), box = $('#scenes'); box.innerHTML = ''; if (!c) return;
  c.scenes.forEach(function (s) { var el = document.createElement('div'); el.className = 'scene'; el.textContent = s.name; el.title = s.name + ' · frames ' + s.startFrame + '–' + (s.startFrame + s.durationFrames - 1);
    el.style.left = (s.startFrame / c.durationFrames * 100) + '%'; el.style.width = (s.durationFrames / c.durationFrames * 100) + '%'; box.appendChild(el); });
}
function renderVars() {
  var box = $('#vars'), names = Object.keys(state.variables || {}); box.innerHTML = '';
  $('#varhint').textContent = names.length ? 'Changes re-render the preview. Values here are not saved to the file.' : 'This composition declares no variables.';
  names.forEach(function (name) {
    var d = state.variables[name], value = state.values[name], label = document.createElement('label'), input;
    label.textContent = name; if (d.description) { var small = document.createElement('small'); small.textContent = d.description; label.appendChild(small); }
    if (d.type === 'boolean') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = value === true; }
    else if (d.type === 'number') { input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.value = value === undefined ? '' : value; }
    else if (d.type === 'string') { input = document.createElement('textarea'); input.value = value === undefined ? '' : value; input.rows = String(value || '').split('\\n').length; }
    else if (d.type === 'list') { input = document.createElement('textarea'); input.value = JSON.stringify(value || [], null, 2); input.rows = Math.min(14, input.value.split('\\n').length); input.spellcheck = false; input.style.fontFamily = 'ui-monospace,Consolas,monospace'; input.style.fontSize = '12px'; }
    else { input = document.createElement('input'); input.value = value === undefined ? '' : value; }
    input.dataset.name = name; input.dataset.type = d.type; input.addEventListener('input', onVarInput);
    if (d.type === 'color') { var row = document.createElement('div'), picker = document.createElement('input'); row.className = 'row'; picker.type = 'color';
      if (/^#[0-9a-f]{6}$/i.test(input.value)) picker.value = input.value; else picker.disabled = true;
      picker.addEventListener('input', function () { input.value = picker.value; onVarInput(); }); input.addEventListener('input', function () { if (/^#[0-9a-f]{6}$/i.test(input.value)) { picker.disabled = false; picker.value = input.value; } });
      row.appendChild(picker); row.appendChild(input); label.appendChild(row); } else label.appendChild(input);
    box.appendChild(label);
  });
}
function onVarInput() {
  clearTimeout(varTimer); varTimer = setTimeout(function () { var values = {};
    document.querySelectorAll('#vars [data-name]').forEach(function (el) { values[el.dataset.name] = el.dataset.type === 'boolean' ? el.checked : el.value; });
    $('#status').textContent = 'applying variables…'; fetch('/api/variables', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) }); }, 350);
}
function showError(message) { var el = $('#error'); el.style.display = message ? 'block' : 'none'; el.textContent = message ? (comp() ? 'Not reloaded — showing the last version that worked.' : 'Could not load the composition. Fix the file and save; the preview reloads by itself.') + '\\n\\n' + message : ''; }
function loadState() {
  return fetch('/api/state').then(function (r) { return r.json(); }).then(function (s) {
    var versionChanged = !state || s.version !== state.version, focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.name;
    state = s; $('#file').textContent = s.file; showError(s.error);
    if (!comp()) { $('#status').textContent = 'fix the error to load the composition'; return; }
    $('#name').textContent = comp().name; document.title = comp().name + ' · OVE preview';
    if (versionChanged) { cache.forEach(function (u) { URL.revokeObjectURL(u); }); cache.clear(); frame = clamp(frame); renderTimeline(); renderLayers(); if (selected) selectLayer(selected); }
    $('#undo').disabled = !s.canUndo;
    if (!focused) renderVars();
    request(frame); prefetch(); draw();
  });
}
var dragging = false;
function scrub(e) { var r = $('#timeline').getBoundingClientRect(); seek(Math.round((e.clientX - r.left) / r.width * (comp().durationFrames - 1))); }
$('#timeline').addEventListener('pointerdown', function (e) { if (!comp()) return; dragging = true; $('#timeline').setPointerCapture(e.pointerId); setPlaying(false); scrub(e); });
$('#timeline').addEventListener('pointermove', function (e) { if (dragging) scrub(e); });
$('#timeline').addEventListener('pointerup', function () { dragging = false; });
$('#play').addEventListener('click', function () { setPlaying(!playing); });
$('#undo').addEventListener('click', undo);
document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); undo(); } });
document.addEventListener('keydown', function (e) { if (!comp() || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); seek(frame + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1)); }
  else if (e.key === 'Home') seek(0); else if (e.key === 'End') seek(comp().durationFrames - 1); });
new EventSource('/api/events').addEventListener('change', function () { setPlaying(false); dropPlayer(); loadState(); });
loadState();
</script>
</body></html>`;
