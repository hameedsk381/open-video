import type { EvaluatedLayer } from '@ove/timeline'; import { captionLines, dropFillerWords, captionKey, type CaptionCue } from '@ove/schema';
// The renderer sets frameKey on video operations (which decoded source frame to draw) and fontPrefix/fontStack on text operations.
// `caption` is the line a captions layer shows at this frame: each word with its state (0 still to come, 1 being said, 2 said).
export type CaptionWordState = { text: string; state: 0 | 1 | 2; emphasis?: boolean };
export type DrawOperation = { kind: 'text'|'image'|'video'|'captions'|'rect'|'circle'|'path'|'group'; layer: EvaluatedLayer; children?: DrawOperation[]; frameKey?: string; fontPrefix?: string; fontStack?: string; spanStacks?: string[]; caption?: { words: CaptionWordState[] } | null };
// "center" origins become pixels: half the width/height, a circle's own centre (0), and for text the middle of maxWidth given its
// alignment and of one line vertically (use pixel values for exact pivots on multi-line text).
const resolveOrigin = (value: unknown, layer: any, axis: 'x'|'y'): number => { if (value !== 'center') return typeof value === 'number' ? value : 0; if (layer.type === 'circle') return 0;
  if (layer.type === 'text') return axis === 'y' ? (layer.fontSize*layer.lineHeight)/2 : layer.textAlign === 'center' ? 0 : ((layer.textAlign === 'right' ? -1 : 1)*(layer.maxWidth ?? 0))/2;
  return ((axis === 'x' ? layer.width : layer.height) ?? 0)/2; };
// Draw operations carry final values: animated properties replace the static ones and origins are in pixels.
const finalLayer = (layer: EvaluatedLayer): EvaluatedLayer => { const merged: any={ ...layer, ...layer.evaluated }; return { ...merged, originX: resolveOrigin(merged.originX, merged, 'x'), originY: resolveOrigin(merged.originY, merged, 'y') }; };
export const toDrawOperations = (layers: EvaluatedLayer[]): DrawOperation[] => layers.filter(layer => layer.type !== 'audio').map(finalLayer).map(layer => layer.type === 'group' ? { kind: 'group', layer, children: toDrawOperations(layer.children ?? []) } : { kind: layer.type, layer });
export const flattenLayers = (layers: readonly any[]): any[] => layers.flatMap(l => l.type === 'group' ? [l, ...flattenLayers(l.children ?? [])] : [l]);
export const flattenOperations = (operations: readonly DrawOperation[]): DrawOperation[] => operations.flatMap(op => op.kind === 'group' ? [op, ...flattenOperations(op.children ?? [])] : [op]);
export const collectImageSources = (layers: readonly any[]): string[] => [...new Set(flattenLayers(layers).filter(l => l.type === 'image').map(l => l.src as string))];
export type TextLayoutOptions = { fontSize: number; maxWidth?: number; maxLines?: number; minFontSize?: number };
export type TextLayout = { lines: string[]; fontSize: number; truncated: boolean };
// Text layout runs inside the browser page, where `measure(text, fontSize)` uses the real font metrics. It is kept as source so the
// page and the unit tests run exactly the same code.
//  - Lines break at \n, then at spaces to fit maxWidth; a word wider than maxWidth is split between characters.
//  - With minFontSize, the size steps down 1px at a time until the text fits (no more than maxLines lines, no word split), but not
//    below minFontSize.
//  - If it still has more than maxLines lines, it is cut to maxLines and the last line ends in an ellipsis that fits maxWidth.
export const textLayoutSource = `function layoutText(text, options, measure) {
  const maxWidth = options.maxWidth > 0 ? options.maxWidth : Infinity;
  const wrap = (size) => { const lines = []; let split = false;
    for (const paragraph of String(text).split('\\n')) { let line = '';
      for (const word of paragraph.split(/ +/)) { const candidate = line ? line + ' ' + word : word;
        if (measure(candidate, size) <= maxWidth) { line = candidate; continue; }
        if (line) { lines.push(line); line = ''; }
        if (measure(word, size) <= maxWidth) { line = word; continue; }
        split = true; for (const ch of Array.from(word)) { if (line && measure(line + ch, size) > maxWidth) { lines.push(line); line = ch; } else line += ch; } }
      lines.push(line); }
    return { lines, split }; };
  const fits = (layout) => !layout.split && (!options.maxLines || layout.lines.length <= options.maxLines);
  let fontSize = options.fontSize, layout = wrap(fontSize);
  const minFontSize = Math.min(options.minFontSize ?? fontSize, fontSize);
  while (!fits(layout) && fontSize > minFontSize) { fontSize = Math.max(minFontSize, fontSize - 1); layout = wrap(fontSize); }
  let lines = layout.lines, truncated = false;
  if (options.maxLines && lines.length > options.maxLines) { truncated = true; lines = lines.slice(0, options.maxLines); let last = Array.from(lines[lines.length - 1]);
    while (last.length && measure(last.join('').trimEnd() + '…', fontSize) > maxWidth) last.pop();
    lines[lines.length - 1] = last.join('').trimEnd() + '…'; }
  return { lines, fontSize, truncated };
}
function layoutRich(spans, options, measure) {
  const base = options.fontSize, maxWidth = options.maxWidth > 0 ? options.maxWidth : Infinity, tokens = [];
  spans.forEach((span, index) => String(span.text).split(/(\\n| +)/).forEach(part => { if (part) tokens.push({ text: part, span: index, kind: part === '\\n' ? 'break' : /^ +$/.test(part) ? 'space' : 'word' }); }));
  const wrap = (k) => { const lines = []; let line = { runs: [], width: 0 }, over = false;
    const close = () => { while (line.runs.length && line.runs[line.runs.length - 1].kind === 'space') line.width -= line.runs.pop().width; lines.push(line); line = { runs: [], width: 0 }; };
    for (const token of tokens) { if (token.kind === 'break') { close(); continue; } const size = (spans[token.span].fontSize || base) * k, width = measure(token.text, spans[token.span], size);
      if (token.kind === 'space') { if (line.runs.length) { line.runs.push({ text: token.text, span: token.span, kind: 'space', size, width }); line.width += width; } continue; }
      if (line.width + width > maxWidth && line.runs.length) close(); if (width > maxWidth) over = true;
      line.runs.push({ text: token.text, span: token.span, kind: 'word', size, width }); line.width += width; }
    close(); return { lines, over }; };
  const fits = (r) => !r.over && (!options.maxLines || r.lines.length <= options.maxLines);
  const minK = Math.min(1, (options.minFontSize || base) / base); let k = 1, r = wrap(1);
  while (!fits(r) && k > minK) { k = Math.max(minK, k - 1 / base); r = wrap(k); }
  let lines = r.lines, truncated = false;
  if (options.maxLines && lines.length > options.maxLines) { truncated = true; lines = lines.slice(0, options.maxLines); const last = lines[lines.length - 1], tail = last.runs[last.runs.length - 1];
    if (tail) { let chars = Array.from(tail.text); const room = () => last.width - tail.width + measure(chars.join('') + '\\u2026', spans[tail.span], tail.size);
      while (chars.length && room() > maxWidth) chars.pop(); last.width -= tail.width; tail.text = chars.join('') + '\\u2026'; tail.width = measure(tail.text, spans[tail.span], tail.size); last.width += tail.width; } }
  return { lines, scale: k, truncated };
}`;
export const layoutText = new Function(`${textLayoutSource}; return layoutText;`)() as (text: string, options: TextLayoutOptions, measure: (text: string, fontSize: number) => number) => TextLayout;
export type TextSpan = { text: string; fontSize?: number; [style: string]: unknown };
export type RichLayout = { lines: { runs: { text: string; span: number; kind: 'word' | 'space'; size: number; width: number }[]; width: number }[]; scale: number; truncated: boolean };
// Rich text: wraps styled spans together. measure(text, span, size) returns the width in that span's font; every span shrinks by the
// same factor (scale) to fit, so their sizes keep their proportions.
export const layoutRich = new Function(`${textLayoutSource}; return layoutRich;`)() as (spans: TextSpan[], options: TextLayoutOptions, measure: (text: string, span: TextSpan, size: number) => number) => RichLayout;
// Builds a CSS font shorthand. Family lists are kept; each named family is quoted so names with spaces work, generic ones are not.
const genericFamilies = new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-serif','ui-sans-serif','ui-monospace','ui-rounded','emoji','math','fangsong']);
// Inter (SIL Open Font License) is built in and is the default family, so text looks the same on every machine without font assets.
// Variable weight 100–900 and optical sizes: large text gets Inter Display's tighter shapes. Faces are split by script like the
// @fontsource-variable/inter package they come from; fonts.ts (Node) finds the files.
// What the canvas runtime reports about a frame drawn with payload.report (see createCanvasRuntime).
export type TextNote = { id: string; kind: 'text'|'captions'; x0: number; y0: number; x1: number; y1: number; size: number; baseSize: number; alpha: number; color: string; truncated: boolean; shrunk: boolean; text: string; words: number };
export type FrameReport = { texts: TextNote[]; thumb: { width: number; height: number; pixels: number[] } };
export type FontSpec = { family: string; src: string; url: string; weight: number | string; style: string; unicodeRange?: string };
export const builtinFontFaces: { family: string; file: string; weight: string; style: 'normal'|'italic'; unicodeRange: string }[] = [
  { family: 'Inter', file: 'inter-latin-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
  { family: 'Inter', file: 'inter-latin-ext-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
  { family: 'Inter', file: 'inter-cyrillic-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
  { family: 'Inter', file: 'inter-cyrillic-ext-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F' },
  { family: 'Inter', file: 'inter-greek-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF' },
  { family: 'Inter', file: 'inter-greek-ext-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+1F00-1FFF' },
  { family: 'Inter', file: 'inter-vietnamese-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB' },
  { family: 'Inter', file: 'inter-latin-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
  { family: 'Inter', file: 'inter-latin-ext-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
  { family: 'Inter', file: 'inter-cyrillic-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
  { family: 'Inter', file: 'inter-cyrillic-ext-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F' },
  { family: 'Inter', file: 'inter-greek-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF' },
  { family: 'Inter', file: 'inter-greek-ext-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+1F00-1FFF' },
  { family: 'Inter', file: 'inter-vietnamese-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB' },
];
export const fontStack = (family: string) => family.split(',').map(f => f.trim()).filter(Boolean).map(f => /^["']/.test(f) || genericFamilies.has(f.toLowerCase()) ? f : `"${f.replace(/"/g, '')}"`).join(', ');
export const cssFont = (layer: { fontStyle?: string; fontWeight?: number | string; fontFamily: string }, fontSize: number) => `${layer.fontStyle ?? 'normal'} ${layer.fontWeight ?? 400} ${fontSize}px ${fontStack(layer.fontFamily)}`;

// The drawing runtime, shared by the renderer's Chromium pages and the browser Player. It is kept as source text so the renderer can
// inject it into a page; the Player gets it as an ES module through a build step (the same arrangement as textLayoutSource).
// createCanvasRuntime(canvas, measurePath) returns { canvas, images, load(sources, fonts), draw(payload, drawables?) }:
//  - load preloads images (src → URL) and registers fonts with FontFace before the first frame;
//  - draw paints one frame. payload.videoFrames maps frame keys to image URLs (the renderer); drawables maps keys to anything a canvas
//    can draw, such as live <video> elements (the Player). Encoding the canvas, if needed, is up to the caller.
// measurePath is an SVG <path> element used to measure path lengths for trimStart/trimEnd.
export const canvasRuntimeSource = `${textLayoutSource}
function createCanvasRuntime(c,measurePath){const ctx=c.getContext('2d',{willReadFrequently:true}),images=new Map(),lengths=new Map();let frames=new Map(),noise,notes=null,unscale=1,toLinear,toSrgb;
// Review reports (draw with payload.report): where each text and captions block landed, in composition pixels, with its rendered
// size, opacity and whether it was cut or shrunk to fit; plus a small greyscale thumbnail of the frame for motion checks.
function note(op,left,top,w,h,size,extra){if(!notes)return;const m=ctx.getTransform(),pts=[[left,top],[left+w,top],[left,top+h],[left+w,top+h]].map(([x,y])=>[(m.a*x+m.c*y+m.e)*unscale,(m.b*x+m.d*y+m.f)*unscale]),xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]);
  notes.texts.push(Object.assign({id:op.layer.id,kind:op.kind,x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys),size:size*Math.hypot(m.a,m.b)*unscale,alpha:ctx.globalAlpha,color:typeof op.layer.color==='string'?op.layer.color:'gradient',baseSize:op.layer.fontSize},extra))}
// Film grain: a seeded 256×256 tile of noise in −1…1, added to every pixel's red, green and blue at the same strength whatever their
// brightness (so dark gradients get it too), starting at an offset picked from the frame number. amount 1 = ±128 levels.
function grain(amount,frame){if(!noise){noise=new Float32Array(65536);let s=0x9e3779b9;for(let i=0;i<65536;i++){s=(s+0x6d2b79f5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;noise[i]=(((t^(t>>>14))>>>0)/4294967296)*2-1}}
  const w=c.width,h=c.height,img=ctx.getImageData(0,0,w,h),d=img.data,k=amount*128,seed=Math.imul(frame+1,0x9e3779b1)>>>0,ox=seed&255,oy=(seed>>>8)&255;
  for(let y=0;y<h;y++){const row=((y+oy)&255)<<8;for(let x=0;x<w;x++){const n=noise[row|((x+ox)&255)]*k,i=(y*w+x)*4;d[i]+=n;d[i+1]+=n;d[i+2]+=n}}ctx.putImageData(img,0,0)}
function paint(v){if(!v||typeof v!=='object')return v;const g=v.type==='radial'?ctx.createRadialGradient(v.center[0],v.center[1],0,v.center[0],v.center[1],v.radius):ctx.createLinearGradient(v.from[0],v.from[1],v.to[0],v.to[1]);v.stops.forEach(s=>g.addColorStop(s.offset,s.color));return g}
function hasStroke(l){return !!l.stroke&&l.strokeWidth>0}
function setStroke(l){ctx.strokeStyle=paint(l.stroke);ctx.lineWidth=l.strokeWidth;ctx.lineCap=l.lineCap||'butt';ctx.lineJoin=l.lineJoin||'miter';ctx.setLineDash(l.strokeDash||[])}
function noShadow(){ctx.shadowColor='transparent'}
function effects(l){if(l.shadow){ctx.shadowColor=l.shadow.color;ctx.shadowBlur=l.shadow.blur;ctx.shadowOffsetX=l.shadow.offsetX;ctx.shadowOffsetY=l.shadow.offsetY}const f=[l.filter,l.blur>0?'blur('+l.blur+'px)':''].filter(Boolean).join(' ');if(f)ctx.filter=f;if(l.blendMode&&l.blendMode!=='normal')ctx.globalCompositeOperation=l.blendMode}
function pathLength(d){let n=lengths.get(d);if(n===undefined){measurePath.setAttribute('d',d);n=measurePath.getTotalLength();lengths.set(d,n)}return n}
// Fill first, then the outline on top; the shadow is cast once, by whichever is drawn first.
function fillAndStroke(l,shape){if(l.fill){ctx.fillStyle=paint(l.fill);shape.fill();noShadow()}if(hasStroke(l)){setStroke(l);shape.stroke()}}
// Shape morphing: both outlines are sampled at 240 points along their length (cached), the second is turned to run the same way round as
// the first and rotated so its points sit closest to the first's, then the points are mixed. The exact paths are drawn at either end.
const samples=new Map(),pairs=new Map();function sampleShape(d){let s=samples.get(d);if(!s){measurePath.setAttribute('d',d);const len=measurePath.getTotalLength(),n=240,pts=[];for(let i=0;i<n;i++){const q=measurePath.getPointAtLength(len*i/n);pts.push([q.x,q.y])}let area=0;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];area+=a[0]*b[1]-b[0]*a[1]}s={pts,area,closed:/z\\s*$/i.test(d.trim())};samples.set(d,s)}return s}
function morphPath(m){if(m.t<=0)return new Path2D(m.from);if(m.t>=1)return new Path2D(m.to);const key=m.from+'|'+m.to;let pair=pairs.get(key);
  if(!pair){const a=sampleShape(m.from),b=sampleShape(m.to),n=a.pts.length;let bp=b.pts;if(Math.sign(a.area)!==Math.sign(b.area))bp=[...bp].reverse();let best=0,bestCost=Infinity;
    if(a.closed&&b.closed){for(let k=0;k<n;k++){let cost=0;for(let i=0;i<n;i+=4){const p=a.pts[i],q=bp[(i+k)%n];cost+=(p[0]-q[0])**2+(p[1]-q[1])**2;if(cost>=bestCost)break}if(cost<bestCost){bestCost=cost;best=k}}}
    pair={a:a.pts,b:bp.map((_,i)=>bp[(i+best)%n]),closed:a.closed&&b.closed};pairs.set(key,pair)}
  const p=new Path2D(),t=m.t;pair.a.forEach((q,i)=>{const r=pair.b[i],x=q[0]+(r[0]-q[0])*t,y=q[1]+(r[1]-q[1])*t;if(i)p.lineTo(x,y);else p.moveTo(x,y)});if(pair.closed)p.closePath();return p}
function drawPath(l,morph){const p=morph?morphPath(morph):new Path2D(l.d);if(morph&&morph.t>0&&morph.t<1){if(l.fill){ctx.fillStyle=paint(l.fill);ctx.fill(p,l.fillRule);noShadow()}if(hasStroke(l)){setStroke(l);ctx.stroke(p)}return}if(l.fill){ctx.fillStyle=paint(l.fill);ctx.fill(p,l.fillRule);noShadow()}if(!hasStroke(l))return;setStroke(l);const a=l.trimStart??0,b=l.trimEnd??1;if(a<=0&&b>=1)return ctx.stroke(p);if(b<=a)return;const len=pathLength(l.d);ctx.setLineDash([(b-a)*len,len+1]);ctx.lineDashOffset=-a*len;ctx.stroke(p)}
// Split text: which stagger step each of n pieces plays (see split.order), and drawing one piece with its step's values. The piece is
// drawn at its laid-out place in the layer's own coordinates, so gradients stay put; offsets, scale and rotation wrap around it.
function unitSteps(n,order,seed){const mid=(n-1)/2;if(order==='reverse')return Array.from({length:n},(_,i)=>n-1-i);if(order==='center')return Array.from({length:n},(_,i)=>Math.floor(Math.abs(i-mid)));
  if(order==='edges')return Array.from({length:n},(_,i)=>Math.floor(mid-Math.abs(i-mid)));if(order==='random'){let s=0;for(const ch of seed)s=(Math.imul(s,31)+ch.charCodeAt(0))|0;const steps=Array.from({length:n},(_,i)=>i);for(let i=n-1;i>0;i--){s=(Math.imul(s,1103515245)+12345)|0;const j=(s>>>8)%(i+1);[steps[i],steps[j]]=[steps[j],steps[i]]}return steps}return Array.from({length:n},(_,i)=>i)}
function drawUnit(l,v,cx,cy,draw){if(!v)return draw(null);const o=v.opacity??1;if(o<=0)return;ctx.save();ctx.globalAlpha*=o;ctx.translate((v.x||0)+cx,(v.y||0)+cy);if(v.rotation)ctx.rotate(v.rotation*Math.PI/180);if(v.scale!==undefined&&v.scale!==1)ctx.scale(v.scale,v.scale);ctx.translate(-cx,-cy);
  if(v.blur>0){const f=ctx.filter&&ctx.filter!=='none'?ctx.filter+' ':'';ctx.filter=f+'blur('+v.blur+'px)'}draw(v.color||null);ctx.restore()}
function drawRich(op,size){const l=op.layer,spans=l.spans,font=(span,px)=>(span.fontStyle||l.fontStyle)+' '+(span.fontWeight||l.fontWeight)+' '+px+'px '+op.spanStacks[spans.indexOf(span)];
  ctx.letterSpacing=(l.letterSpacing||0)+'px';ctx.textAlign='left';ctx.textBaseline='alphabetic';const measure=(t,span,px)=>{ctx.font=font(span,px);return ctx.measureText(t).width};
  const r=layoutRich(spans,{fontSize:size,maxWidth:l.maxWidth,maxLines:l.maxLines,minFontSize:l.minFontSize},measure);let top=0,wordIndex=0,lineIndex=0;
  const units=op.layer.units&&l.split?{by:l.split.by,vals:op.layer.units,steps:unitSteps(l.split.by==='lines'?r.lines.length:r.lines.reduce((n,line)=>n+line.runs.filter(x=>x.kind==='word').length,0),l.split.order,l.id)}:null;
  for(const line of r.lines){const lineSize=line.runs.length?Math.max(...line.runs.map(run=>run.size)):size*r.scale;let ascent=0;for(const run of line.runs){ctx.font=font(spans[run.span],run.size);ascent=Math.max(ascent,ctx.measureText('Hg').fontBoundingBoxAscent)}const base=top+(ascent||lineSize*0.8);
    const start=l.textAlign==='center'?-line.width/2:l.textAlign==='right'?-line.width:0;let x=start;
    for(const run of line.runs){const span=spans[run.span];if(span.background&&!units){ctx.fillStyle=span.background;ctx.beginPath();ctx.roundRect(x-run.size*0.08,base-run.size*0.95,run.width+run.size*0.16,run.size*1.25,run.size*0.15);ctx.fill()}x+=run.width}x=start;
    for(const run of line.runs){const span=spans[run.span],rx=x,v=units?units.vals[Math.min(units.steps[units.by==='lines'?lineIndex:run.kind==='word'?wordIndex:Math.max(0,wordIndex-1)]??0,units.vals.length-1)]:null;
      drawUnit(l,v,rx+run.width/2,base-run.size*0.35,(color)=>{if(units&&span.background&&run.kind==='word'){ctx.fillStyle=span.background;ctx.beginPath();ctx.roundRect(rx-run.size*0.08,base-run.size*0.95,run.width+run.size*0.16,run.size*1.25,run.size*0.15);ctx.fill()}ctx.font=font(span,run.size);if(run.kind==='word'){if(hasStroke(l)){setStroke(l);ctx.strokeText(run.text,rx,base)}ctx.fillStyle=color||paint(span.color||l.color);ctx.fillText(run.text,rx,base)}if(span.underline){ctx.fillStyle=color||paint(span.color||l.color);ctx.fillRect(rx,base+run.size*0.12,run.width,Math.max(1,run.size*0.07))}});if(run.kind==='word')wordIndex++;x+=run.width}lineIndex++;
    top+=lineSize*l.lineHeight}
  if(notes){const w=Math.max(0,...r.lines.map(x=>x.width)),last=r.lines.at(-1),lastSize=last&&last.runs.length?Math.max(...last.runs.map(run=>run.size)):size*r.scale;note(op,l.textAlign==='center'?-w/2:l.textAlign==='right'?-w:0,0,w,top-lastSize*(l.lineHeight-1),size*r.scale,{truncated:r.truncated,shrunk:r.scale<0.999,text:spans.map(s=>s.text).join('').slice(0,60),words:spans.map(s=>s.text).join(' ').split(/\\s+/).filter(Boolean).length})}}
function drawText(op,size){const l=op.layer;if(l.spans&&l.spans.length)return drawRich(op,size);const font=(s)=>op.fontPrefix+' '+s+'px '+op.fontStack;ctx.letterSpacing=(l.letterSpacing||0)+'px';const t=layoutText(l.content,{fontSize:size,maxWidth:l.maxWidth,maxLines:l.maxLines,minFontSize:l.minFontSize},(s,px)=>{ctx.font=font(px);return ctx.measureText(s).width});ctx.font=font(t.fontSize);ctx.textAlign=l.textAlign;ctx.textBaseline='top';const lh=t.fontSize*l.lineHeight;
  if(op.layer.units&&l.split)drawSplit(op,t,lh);else{if(hasStroke(l)){setStroke(l);t.lines.forEach((line,i)=>ctx.strokeText(line,0,i*lh));noShadow()}ctx.fillStyle=paint(l.color);t.lines.forEach((line,i)=>ctx.fillText(line,0,i*lh))}
  if(notes&&t.lines.length){const w=Math.max(...t.lines.map(line=>ctx.measureText(line).width));note(op,l.textAlign==='center'?-w/2:l.textAlign==='right'?-w:0,0,w,(t.lines.length-1)*lh+t.fontSize,t.fontSize,{truncated:t.truncated,shrunk:t.fontSize<size,text:l.content.slice(0,60),words:l.content.split(/\\s+/).filter(Boolean).length})}}
// Plain split text: pieces are found per laid-out line (words and letters skip spaces) and placed by measuring the text before them,
// so spacing, kerning and letter spacing match the unsplit line.
function drawSplit(op,t,lh){const l=op.layer,by=l.split.by,pieces=[];ctx.textAlign='left';
  t.lines.forEach((line,i)=>{const width=ctx.measureText(line).width,start=l.textAlign==='center'?-width/2:l.textAlign==='right'?-width:0,y=i*lh;
    if(by==='lines'){pieces.push({text:line,x:start,y,w:width});return}const re=by==='letters'?/\\S/gu:/\\S+/g;let m;while((m=re.exec(line))){pieces.push({text:m[0],x:start+ctx.measureText(line.slice(0,m.index)).width,y,w:ctx.measureText(m[0]).width})}});
  const steps=unitSteps(pieces.length,l.split.order,l.id),vals=op.layer.units,base=paint(l.color);
  pieces.forEach((p,i)=>drawUnit(l,vals[Math.min(steps[i],vals.length-1)],p.x+p.w/2,p.y+t.fontSize/2,(color)=>{if(hasStroke(l)){setStroke(l);ctx.strokeText(p.text,p.x,p.y)}ctx.fillStyle=color||base;ctx.fillText(p.text,p.x,p.y)}));ctx.textAlign=l.textAlign}
function drawCaptions(op){const l=op.layer,c=op.caption;if(!c||!c.words.length)return;const size=l.fontSize;ctx.font=op.fontPrefix+' '+size+'px '+op.fontStack;ctx.letterSpacing=(l.letterSpacing||0)+'px';ctx.textBaseline='top';ctx.textAlign='left';
  const measure=(s)=>ctx.measureText(s).width,space=measure(' '),t=layoutText(c.words.map(w=>w.text).join(' '),{fontSize:size,maxWidth:l.maxWidth},(s)=>measure(s));let next=0;
  const lines=t.lines.map(line=>{const count=line.split(' ').filter(Boolean).length,words=c.words.slice(next,next+count);next+=count;return{words,width:measure(line)}});
  const lh=size*l.lineHeight,widest=Math.max(...lines.map(x=>x.width)),height=(lines.length-1)*lh+size,pad=l.padding,left=l.textAlign==='center'?-widest/2:l.textAlign==='right'?-widest:0;
  if(l.background&&l.background!=='transparent'){ctx.fillStyle=l.background;ctx.beginPath();ctx.roundRect(left-pad,-pad,widest+pad*2,height+pad*2,l.radius);ctx.fill();noShadow()}
  lines.forEach((line,i)=>{let x=l.textAlign==='center'?-line.width/2:l.textAlign==='right'?-line.width:0;const y=i*lh;line.words.forEach(w=>{if(hasStroke(l)){setStroke(l);ctx.strokeText(w.text,x,y)}ctx.fillStyle=w.state===0?l.upcomingColor:w.emphasis?(l.emphasisColor||l.highlightColor):w.state===1?l.highlightColor:l.color;ctx.fillText(w.text,x,y);x+=measure(w.text)+space})});
  note(op,left-pad,-pad,widest+pad*2,height+pad*2,size,{truncated:false,shrunk:false,text:c.words.map(w=>w.text).join(' ').slice(0,60),words:c.words.length})}
function fitImage(img,l){const iw=img.naturalWidth||img.videoWidth||img.width,ih=img.naturalHeight||img.videoHeight||img.height,w=l.width??iw,h=l.height??ih;if(l.radius>0){ctx.beginPath();ctx.roundRect(0,0,w,h,l.radius);ctx.clip()}if(l.objectFit==='fill')return ctx.drawImage(img,0,0,w,h);if(l.objectFit==='contain'){const s=Math.min(w/iw,h/ih);return ctx.drawImage(img,(w-iw*s)/2,(h-ih*s)/2,iw*s,ih*s)}const s=Math.max(w/iw,h/ih),sw=w/s,sh=h/s;ctx.drawImage(img,(iw-sw)/2,(ih-sh)/2,sw,sh,0,0,w,h)}
function drawOp(op){const l=op.layer,e=l.evaluated||{},x=e.x??l.x,y=e.y??l.y,opacity=e.opacity??l.opacity,scale=e.scale??l.scale,rotation=e.rotation??l.rotation;const ox=l.originX||0,oy=l.originY||0;ctx.save();ctx.globalAlpha*=opacity;ctx.translate(x+ox,y+oy);ctx.rotate(rotation*Math.PI/180);ctx.scale(scale,scale);ctx.translate(-ox,-oy);effects(l);if(op.kind==='rect'){ctx.beginPath();ctx.roundRect(0,0,l.width??0,l.height??0,l.radius||0);fillAndStroke(l,{fill:()=>ctx.fill(),stroke:()=>ctx.stroke()})}else if(op.kind==='circle'){ctx.beginPath();ctx.arc(0,0,l.width/2||20,0,Math.PI*2);fillAndStroke(l,{fill:()=>ctx.fill(),stroke:()=>ctx.stroke()})}else if(op.kind==='path'){drawPath(l,op.layer.morph)}else if(op.kind==='text'){drawText(op,e.fontSize??l.fontSize)}else if(op.kind==='captions'){drawCaptions(op)}else if(op.kind==='image'){const img=images.get(l.src);if(!img)throw new Error('Image not preloaded: '+l.src);fitImage(img,l)}else if(op.kind==='video'){const img=frames.get(op.frameKey);if(!img)throw new Error('Video frame missing: '+op.frameKey);fitImage(img,l)}else if(op.kind==='group'){if(l.clip){ctx.beginPath();ctx.rect(l.clip.x,l.clip.y,l.clip.width,l.clip.height);ctx.clip()}if(l.clipPath)ctx.clip(new Path2D(l.clipPath));for(const child of op.children)drawOp(child)}ctx.restore()}
return{canvas:c,images,load:async(sources,fonts)=>{await Promise.all((fonts||[]).map(async f=>{const face=new FontFace(f.family,'url('+f.url+')',f.unicodeRange?{weight:String(f.weight),style:f.style,unicodeRange:f.unicodeRange}:{weight:String(f.weight),style:f.style});try{await face.load()}catch{throw new Error('Failed to load font '+f.family+' from '+f.src)}document.fonts.add(face)}));await Promise.all(Object.entries(sources||{}).map(([src,url])=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>{images.set(src,i);res()};i.onerror=()=>rej(new Error('Failed to load image '+src));i.src=url})))},
draw:async(p,drawables)=>{frames=new Map(await Promise.all(Object.entries(p.videoFrames||{}).map(async([key,url])=>{const i=new Image();i.src=url;await i.decode();return [key,i]})));if(drawables)for(const [k,v] of drawables)frames.set(k,v);if(c.width!==p.width)c.width=p.width;if(c.height!==p.height)c.height=p.height;notes=p.report?{texts:[],thumb:null}:null;unscale=p.scaleX?1/p.scaleX:1;
  if(p.subframes&&p.subframes.length>1)blurred(p);else paintFrame(p,p.operations);if(p.grain>0&&!p.transparent)grain(p.grain,p.frame||0);if(notes)notes.thumb=thumbnail()},
report:()=>notes}
function paintFrame(p,operations){ctx.reset();if(p.scaleX)ctx.setTransform(p.scaleX,0,0,p.scaleY,0,0);if(!p.transparent){ctx.fillStyle=paint(p.background||'#101827');ctx.fillRect(0,0,p.scaleX?c.width/p.scaleX:c.width,p.scaleY?c.height/p.scaleY:c.height)}for(const op of operations)drawOp(op)}
// Motion blur: draws each sub-frame and averages them in linear light, weighted by alpha (so edges blur the way light does, and
// transparent output stays correct), then converts back to sRGB through a 16-bit lookup table (fine enough that dark gradients do not band).
function blurred(p){const w=c.width,h=c.height,n=p.subframes.length,acc=new Float32Array(w*h*4);
  if(!toLinear){toLinear=new Float32Array(256);for(let i=0;i<256;i++){const v=i/255;toLinear[i]=v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)}toSrgb=new Uint8ClampedArray(65536);for(let i=0;i<65536;i++){const v=i/65535;toSrgb[i]=Math.round(255*(v<=0.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-0.055))}}
  const keep=notes;for(let s=0;s<n;s++){notes=s===n-1?keep:null;paintFrame(p,p.subframes[s].operations);const d=ctx.getImageData(0,0,w,h).data;for(let i=0;i<d.length;i+=4){const a=d[i+3]/255;acc[i]+=toLinear[d[i]]*a;acc[i+1]+=toLinear[d[i+1]]*a;acc[i+2]+=toLinear[d[i+2]]*a;acc[i+3]+=a}}
  const img=ctx.createImageData(w,h),o=img.data;for(let i=0;i<o.length;i+=4){const a=acc[i+3];if(a<=0)continue;o[i]=toSrgb[Math.min(65535,Math.round(acc[i]/a*65535))];o[i+1]=toSrgb[Math.min(65535,Math.round(acc[i+1]/a*65535))];o[i+2]=toSrgb[Math.min(65535,Math.round(acc[i+2]/a*65535))];o[i+3]=Math.round(a/n*255)}
  ctx.reset();ctx.putImageData(img,0,0)}
// 64×36 (or the frame's shape at 64 wide) greyscale copy of the canvas, for comparing frames cheaply.
function thumbnail(){const w=64,h=Math.max(1,Math.round(64*c.height/c.width)),t=document.createElement('canvas');t.width=w;t.height=h;const tc=t.getContext('2d',{willReadFrequently:true});tc.drawImage(c,0,0,w,h);const d=tc.getImageData(0,0,w,h).data,out=[];for(let i=0;i<d.length;i+=4)out.push(Math.round(d[i]*0.2126+d[i+1]*0.7152+d[i+2]*0.0722));return{width:w,height:h,pixels:out}}}`;
// Text operations need their CSS font parts; the runtime only appends the final (possibly shrunk) size.
// Captions layers also get the line showing at this frame. Lines are cached per cue list, since grouping words is the same every frame.
const lineCache = new WeakMap<object, Map<number, CaptionCue[]>>();
const cleaned = new WeakMap<object, CaptionCue[]>();
const linesFor = (raw: CaptionCue[], maxWords: number, fillers = false) => { let cues = raw; if (fillers) { cues = cleaned.get(raw) ?? dropFillerWords(raw); cleaned.set(raw, cues); } let byWords = lineCache.get(cues); if (!byWords) lineCache.set(cues, byWords = new Map()); let lines = byWords.get(maxWords); if (!lines) byWords.set(maxWords, lines = captionLines(cues, maxWords)); return lines; };
// The line at time t. A gap shorter than 0.3 s keeps the previous line up (fully said) so captions do not flicker between phrases.
export function captionAt(layer: { cues?: CaptionCue[]; maxWords: number; mode: string; offset?: number; dropFillers?: boolean; emphasis?: string[] }, seconds: number): { words: CaptionWordState[] } | null { const lines = linesFor(layer.cues ?? [], layer.maxWords, layer.dropFillers), t = seconds - (layer.offset ?? 0), stress = new Set((layer.emphasis ?? []).map(captionKey)), mark = (w: CaptionWordState) => stress.size && stress.has(captionKey(w.text)) ? { ...w, emphasis: true } : w;
  let cue = lines.find(c => t >= c.start && t < c.end), finished = false; if (!cue) { cue = [...lines].reverse().find(c => c.end <= t && t - c.end < 0.3); finished = !!cue; } if (!cue) return null;
  if (layer.mode === 'lines' || !cue.words?.length) return { words: cue.text.split(/\s+/).filter(Boolean).map(text => mark({ text, state: 2 as const })) };
  const current = finished ? cue.words.length : cue.words.reduce((at, w, i) => w.start <= t ? i : at, -1);
  return { words: cue.words.map((w, i) => mark({ text: w.text, state: i < current ? 2 : i === current ? 1 : 0 })) }; }
export const prepareOperations = (operations: DrawOperation[], fps = 30): DrawOperation[] => { for (const op of flattenOperations(operations)) { if (op.kind !== 'text' && op.kind !== 'captions') continue; const layer = op.layer as any; op.fontPrefix = `${layer.fontStyle} ${layer.fontWeight}`; op.fontStack = fontStack(layer.fontFamily);
  if (layer.spans?.length) op.spanStacks = layer.spans.map((span: any) => fontStack(span.fontFamily ?? layer.fontFamily));
  if (op.kind === 'captions') op.caption = captionAt(layer, (layer.localFrame - layer.startFrame)/fps); } return operations; };
