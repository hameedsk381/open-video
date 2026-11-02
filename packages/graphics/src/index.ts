import type { EvaluatedLayer } from '@ove/timeline';
// The renderer sets frameKey on video operations (which decoded source frame to draw) and fontPrefix/fontStack on text operations.
export type DrawOperation = { kind: 'text'|'image'|'video'|'rect'|'circle'|'path'|'group'; layer: EvaluatedLayer; children?: DrawOperation[]; frameKey?: string; fontPrefix?: string; fontStack?: string };
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
}`;
export const layoutText = new Function(`${textLayoutSource}; return layoutText;`)() as (text: string, options: TextLayoutOptions, measure: (text: string, fontSize: number) => number) => TextLayout;
// Builds a CSS font shorthand. Family lists are kept; each named family is quoted so names with spaces work, generic ones are not.
const genericFamilies = new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-serif','ui-sans-serif','ui-monospace','ui-rounded','emoji','math','fangsong']);
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
function createCanvasRuntime(c,measurePath){const ctx=c.getContext('2d',{willReadFrequently:true}),images=new Map(),lengths=new Map();let frames=new Map();
function paint(v){if(!v||typeof v!=='object')return v;const g=v.type==='radial'?ctx.createRadialGradient(v.center[0],v.center[1],0,v.center[0],v.center[1],v.radius):ctx.createLinearGradient(v.from[0],v.from[1],v.to[0],v.to[1]);v.stops.forEach(s=>g.addColorStop(s.offset,s.color));return g}
function hasStroke(l){return !!l.stroke&&l.strokeWidth>0}
function setStroke(l){ctx.strokeStyle=paint(l.stroke);ctx.lineWidth=l.strokeWidth;ctx.lineCap=l.lineCap||'butt';ctx.lineJoin=l.lineJoin||'miter';ctx.setLineDash(l.strokeDash||[])}
function noShadow(){ctx.shadowColor='transparent'}
function effects(l){if(l.shadow){ctx.shadowColor=l.shadow.color;ctx.shadowBlur=l.shadow.blur;ctx.shadowOffsetX=l.shadow.offsetX;ctx.shadowOffsetY=l.shadow.offsetY}const f=[l.filter,l.blur>0?'blur('+l.blur+'px)':''].filter(Boolean).join(' ');if(f)ctx.filter=f;if(l.blendMode&&l.blendMode!=='normal')ctx.globalCompositeOperation=l.blendMode}
function pathLength(d){let n=lengths.get(d);if(n===undefined){measurePath.setAttribute('d',d);n=measurePath.getTotalLength();lengths.set(d,n)}return n}
// Fill first, then the outline on top; the shadow is cast once, by whichever is drawn first.
function fillAndStroke(l,shape){if(l.fill){ctx.fillStyle=paint(l.fill);shape.fill();noShadow()}if(hasStroke(l)){setStroke(l);shape.stroke()}}
function drawPath(l){const p=new Path2D(l.d);if(l.fill){ctx.fillStyle=paint(l.fill);ctx.fill(p,l.fillRule);noShadow()}if(!hasStroke(l))return;setStroke(l);const a=l.trimStart??0,b=l.trimEnd??1;if(a<=0&&b>=1)return ctx.stroke(p);if(b<=a)return;const len=pathLength(l.d);ctx.setLineDash([(b-a)*len,len+1]);ctx.lineDashOffset=-a*len;ctx.stroke(p)}
function drawText(op,size){const l=op.layer,font=(s)=>op.fontPrefix+' '+s+'px '+op.fontStack;ctx.letterSpacing=(l.letterSpacing||0)+'px';const t=layoutText(l.content,{fontSize:size,maxWidth:l.maxWidth,maxLines:l.maxLines,minFontSize:l.minFontSize},(s,px)=>{ctx.font=font(px);return ctx.measureText(s).width});ctx.font=font(t.fontSize);ctx.textAlign=l.textAlign;ctx.textBaseline='top';const lh=t.fontSize*l.lineHeight;
  if(hasStroke(l)){setStroke(l);t.lines.forEach((line,i)=>ctx.strokeText(line,0,i*lh));noShadow()}ctx.fillStyle=paint(l.color);t.lines.forEach((line,i)=>ctx.fillText(line,0,i*lh))}
function fitImage(img,l){const iw=img.naturalWidth||img.videoWidth||img.width,ih=img.naturalHeight||img.videoHeight||img.height,w=l.width??iw,h=l.height??ih;if(l.radius>0){ctx.beginPath();ctx.roundRect(0,0,w,h,l.radius);ctx.clip()}if(l.objectFit==='fill')return ctx.drawImage(img,0,0,w,h);if(l.objectFit==='contain'){const s=Math.min(w/iw,h/ih);return ctx.drawImage(img,(w-iw*s)/2,(h-ih*s)/2,iw*s,ih*s)}const s=Math.max(w/iw,h/ih),sw=w/s,sh=h/s;ctx.drawImage(img,(iw-sw)/2,(ih-sh)/2,sw,sh,0,0,w,h)}
function drawOp(op){const l=op.layer,e=l.evaluated||{},x=e.x??l.x,y=e.y??l.y,opacity=e.opacity??l.opacity,scale=e.scale??l.scale,rotation=e.rotation??l.rotation;const ox=l.originX||0,oy=l.originY||0;ctx.save();ctx.globalAlpha*=opacity;ctx.translate(x+ox,y+oy);ctx.rotate(rotation*Math.PI/180);ctx.scale(scale,scale);ctx.translate(-ox,-oy);effects(l);if(op.kind==='rect'){ctx.beginPath();ctx.roundRect(0,0,l.width??0,l.height??0,l.radius||0);fillAndStroke(l,{fill:()=>ctx.fill(),stroke:()=>ctx.stroke()})}else if(op.kind==='circle'){ctx.beginPath();ctx.arc(0,0,l.width/2||20,0,Math.PI*2);fillAndStroke(l,{fill:()=>ctx.fill(),stroke:()=>ctx.stroke()})}else if(op.kind==='path'){drawPath(l)}else if(op.kind==='text'){drawText(op,e.fontSize??l.fontSize)}else if(op.kind==='image'){const img=images.get(l.src);if(!img)throw new Error('Image not preloaded: '+l.src);fitImage(img,l)}else if(op.kind==='video'){const img=frames.get(op.frameKey);if(!img)throw new Error('Video frame missing: '+op.frameKey);fitImage(img,l)}else if(op.kind==='group'){if(l.clip){ctx.beginPath();ctx.rect(l.clip.x,l.clip.y,l.clip.width,l.clip.height);ctx.clip()}if(l.clipPath)ctx.clip(new Path2D(l.clipPath));for(const child of op.children)drawOp(child)}ctx.restore()}
return{canvas:c,images,load:async(sources,fonts)=>{await Promise.all((fonts||[]).map(async f=>{const face=new FontFace(f.family,'url('+f.url+')',{weight:String(f.weight),style:f.style});try{await face.load()}catch{throw new Error('Failed to load font '+f.family+' from '+f.src)}document.fonts.add(face)}));await Promise.all(Object.entries(sources||{}).map(([src,url])=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>{images.set(src,i);res()};i.onerror=()=>rej(new Error('Failed to load image '+src));i.src=url})))},
draw:async(p,drawables)=>{frames=new Map(await Promise.all(Object.entries(p.videoFrames||{}).map(async([key,url])=>{const i=new Image();i.src=url;await i.decode();return [key,i]})));if(drawables)for(const [k,v] of drawables)frames.set(k,v);if(c.width!==p.width)c.width=p.width;if(c.height!==p.height)c.height=p.height;ctx.reset();if(!p.transparent){ctx.fillStyle=p.background||'#101827';ctx.fillRect(0,0,c.width,c.height)}for(const op of p.operations)drawOp(op)}}}`;
// Text operations need their CSS font parts; the runtime only appends the final (possibly shrunk) size.
export const prepareOperations = (operations: DrawOperation[]): DrawOperation[] => { for (const op of flattenOperations(operations)) if (op.kind === 'text') { const layer = op.layer as any; op.fontPrefix = `${layer.fontStyle} ${layer.fontWeight}`; op.fontStack = fontStack(layer.fontFamily); } return operations; };
