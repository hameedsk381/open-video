// The drawing runtime, shared by the renderer's Chromium pages and the browser Player, so both draw with exactly the same code.
// Plain browser script: no imports or exports; it relies on text-layout.js being loaded first. packages/graphics/src/runtime.ts reads
// it as text; the renderer injects it into its pages and the Player bundles it as an ES module (packages/player/src/bundle.ts).
// Write it as ordinary JavaScript: it is not inside a template string, so backslashes and quotes need no extra escaping.
// createCanvasRuntime(canvas, measurePath) returns { canvas, images, load(sources, fonts), draw(payload, drawables?) }:
//  - load preloads images (src → URL) and registers fonts with FontFace before the first frame;
//  - draw paints one frame. payload.videoFrames maps frame keys to image URLs (the renderer); drawables maps keys to anything a canvas
//    can draw, such as live <video> elements (the Player). Encoding the canvas, if needed, is up to the caller.
// measurePath is an SVG <path> element used to measure path lengths for trimStart/trimEnd.
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
const samples=new Map(),pairs=new Map();function sampleShape(d){let s=samples.get(d);if(!s){measurePath.setAttribute('d',d);const len=measurePath.getTotalLength(),n=240,pts=[];for(let i=0;i<n;i++){const q=measurePath.getPointAtLength(len*i/n);pts.push([q.x,q.y])}let area=0;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];area+=a[0]*b[1]-b[0]*a[1]}s={pts,area,closed:/z\s*$/i.test(d.trim())};samples.set(d,s)}return s}
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
  if(notes){const w=Math.max(0,...r.lines.map(x=>x.width)),last=r.lines.at(-1),lastSize=last&&last.runs.length?Math.max(...last.runs.map(run=>run.size)):size*r.scale;note(op,l.textAlign==='center'?-w/2:l.textAlign==='right'?-w:0,0,w,top-lastSize*(l.lineHeight-1),size*r.scale,{truncated:r.truncated,shrunk:r.scale<0.999,text:spans.map(s=>s.text).join('').slice(0,60),words:spans.map(s=>s.text).join(' ').split(/\s+/).filter(Boolean).length})}}
function drawText(op,size){const l=op.layer;if(l.spans&&l.spans.length)return drawRich(op,size);const font=(s)=>op.fontPrefix+' '+s+'px '+op.fontStack;ctx.letterSpacing=(l.letterSpacing||0)+'px';const t=layoutText(l.content,{fontSize:size,maxWidth:l.maxWidth,maxLines:l.maxLines,minFontSize:l.minFontSize},(s,px)=>{ctx.font=font(px);return ctx.measureText(s).width});ctx.font=font(t.fontSize);ctx.textAlign=l.textAlign;ctx.textBaseline='top';const lh=t.fontSize*l.lineHeight;
  if(op.layer.units&&l.split)drawSplit(op,t,lh);else{if(hasStroke(l)){setStroke(l);t.lines.forEach((line,i)=>ctx.strokeText(line,0,i*lh));noShadow()}ctx.fillStyle=paint(l.color);t.lines.forEach((line,i)=>ctx.fillText(line,0,i*lh))}
  if(notes&&t.lines.length){const w=Math.max(...t.lines.map(line=>ctx.measureText(line).width));note(op,l.textAlign==='center'?-w/2:l.textAlign==='right'?-w:0,0,w,(t.lines.length-1)*lh+t.fontSize,t.fontSize,{truncated:t.truncated,shrunk:t.fontSize<size,text:l.content.slice(0,60),words:l.content.split(/\s+/).filter(Boolean).length})}}
// Plain split text: pieces are found per laid-out line (words and letters skip spaces) and placed by measuring the text before them,
// so spacing, kerning and letter spacing match the unsplit line.
function drawSplit(op,t,lh){const l=op.layer,by=l.split.by,pieces=[];ctx.textAlign='left';
  t.lines.forEach((line,i)=>{const width=ctx.measureText(line).width,start=l.textAlign==='center'?-width/2:l.textAlign==='right'?-width:0,y=i*lh;
    if(by==='lines'){pieces.push({text:line,x:start,y,w:width});return}const re=by==='letters'?/\S/gu:/\S+/g;let m;while((m=re.exec(line))){pieces.push({text:m[0],x:start+ctx.measureText(line.slice(0,m.index)).width,y,w:ctx.measureText(m[0]).width})}});
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
// A failure while drawing names the innermost layer it happened in, so the message points at the composition rather than at this code.
// The renderer recognises the "Layer" prefix and does not retry such frames: they would fail the same way again.
function drawOp(op){try{drawLayer(op)}catch(e){if(e&&e.oveLayer)throw e;const err=new Error('Layer "'+(op.layer&&op.layer.id)+'" ('+op.kind+'): '+(e&&e.message||String(e)));err.oveLayer=true;throw err}}
function drawLayer(op){const l=op.layer,e=l.evaluated||{},x=e.x??l.x,y=e.y??l.y,opacity=e.opacity??l.opacity,scale=e.scale??l.scale,rotation=e.rotation??l.rotation;const ox=l.originX||0,oy=l.originY||0;ctx.save();ctx.globalAlpha*=opacity;ctx.translate(x+ox,y+oy);ctx.rotate(rotation*Math.PI/180);ctx.scale(scale,scale);ctx.translate(-ox,-oy);effects(l);if(op.kind==='rect'){ctx.beginPath();ctx.roundRect(0,0,l.width??0,l.height??0,l.radius||0);fillAndStroke(l,{fill:()=>ctx.fill(),stroke:()=>ctx.stroke()})}else if(op.kind==='circle'){ctx.beginPath();ctx.arc(0,0,l.width/2||20,0,Math.PI*2);fillAndStroke(l,{fill:()=>ctx.fill(),stroke:()=>ctx.stroke()})}else if(op.kind==='path'){drawPath(l,op.layer.morph)}else if(op.kind==='html'){drawHtml(op)}else if(op.kind==='text'){drawText(op,e.fontSize??l.fontSize)}else if(op.kind==='captions'){drawCaptions(op)}else if(op.kind==='image'){const img=images.get(l.src);if(!img)throw new Error('Image not preloaded: '+l.src);fitImage(img,l)}else if(op.kind==='video'){const img=frames.get(op.frameKey);if(!img)throw new Error('Video frame missing: '+op.frameKey);fitImage(img,l)}else if(op.kind==='group'){if(l.clip){ctx.beginPath();ctx.rect(l.clip.x,l.clip.y,l.clip.width,l.clip.height);ctx.clip()}if(l.clipPath)ctx.clip(new Path2D(l.clipPath));drawChildren(op)}else if(op.kind==='lottie'){drawLottie(op)}else if(op.kind==='shader'){drawShader(op)}ctx.restore()}
// HTML layers: markup and CSS drawn through an SVG <foreignObject> image, which Chromium lays out with its normal engine (flexbox,
// grid, rich text, inline SVG) while running no scripts and loading nothing from outside the image. So everything it needs is inlined
// as data URLs: the fonts (Inter's Latin faces and the composition's font assets) and the pictures it names by asset id or path.
// CSS animations are held paused; --t (seconds into the layer) places @keyframes exactly. Rasterised images are cached by content
// (markup, CSS, variables, size), so frames that look the same are drawn from the cache.
const htmlImages=new Map(),inlined=new Map(),XHTML='http://www.w3.org/1999/xhtml',refPattern=/url\(\s*(['"]?)([^'")]+)\1\s*\)/g;let fontList=[],imageUrls=new Map(),htmlFontCss;
function asDataUrl(url){if(url.startsWith('data:'))return Promise.resolve(url);let job=inlined.get(url);if(!job){job=fetch(url).then(r=>{if(!r.ok)throw new Error('could not load '+url);return r.blob()}).then(b=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(fr.error);fr.readAsDataURL(b)}));inlined.set(url,job)}return job}
function fontCss(){if(!htmlFontCss)htmlFontCss=Promise.all(fontList.filter(f=>!String(f.src).startsWith('builtin:')||/^builtin:inter-latin(-ext)?-opsz/.test(f.src)).map(async f=>'@font-face{font-family:"'+f.family+'";src:url('+await asDataUrl(f.url)+');font-weight:'+f.weight+';font-style:'+f.style+(f.unicodeRange?';unicode-range:'+f.unicodeRange:'')+'}')).then(faces=>faces.join(''));return htmlFontCss}
async function inlineRefs(css){let out=css;for(const m of [...css.matchAll(refPattern)]){const url=imageUrls.get(m[2].trim());if(url)out=out.split(m[0]).join('url("'+await asDataUrl(url)+'")')}return out}
async function htmlSvg(op){const l=op.layer,w=l.width,h=l.height,k=l.resolution||1,doc=new DOMParser().parseFromString('<!doctype html><body>'+l.html+'</body>','text/html');
  for(const el of doc.querySelectorAll('script,iframe,object,embed,link,meta,base,frame,frameset,noscript'))el.remove();
  for(const el of doc.body.querySelectorAll('*')){for(const a of [...el.attributes])if(/^on/i.test(a.name))el.removeAttribute(a.name);
    if(el.hasAttribute('src')){const url=imageUrls.get(el.getAttribute('src'));if(url)el.setAttribute('src',await asDataUrl(url))}
    if(el.hasAttribute('style'))el.setAttribute('style',await inlineRefs(el.getAttribute('style')));if(el.localName==='style')el.textContent=await inlineRefs(el.textContent)}
  const root=doc.createElementNS(XHTML,'div'),style=doc.createElementNS(XHTML,'style');
  root.setAttribute('style',Object.entries(op.vars||{}).map(([name,value])=>name+':'+value+';').join('')+'width:'+w+'px;height:'+h+'px;overflow:hidden;position:relative;margin:0');
  style.textContent=(await fontCss())+'*{animation-play-state:paused!important;transition:none!important}'+(await inlineRefs(l.css||''));root.appendChild(style);for(const n of [...doc.body.childNodes])root.appendChild(n);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w*k+'" height="'+h*k+'" viewBox="0 0 '+w+' '+h+'"><foreignObject x="0" y="0" width="'+w+'" height="'+h+'">'+new XMLSerializer().serializeToString(root)+'</foreignObject></svg>'}
async function prepareHtml(ops){for(const op of ops){if(op.kind==='group'){await prepareHtml(op.children||[]);continue}if(op.kind!=='html')continue;const l=op.layer,usesTime=/var\(\s*--(t|frame)\b/.test(l.html+'\n'+l.css),keyVars=usesTime?op.vars:Object.fromEntries(Object.entries(op.vars||{}).filter(([name])=>name!=='--t'&&name!=='--frame'));
    // --t and --frame change every frame, so they only count towards the cache key when the markup or CSS actually reads them; a static card is drawn once.
    op.htmlKey=JSON.stringify([l.html,l.css,keyVars,l.width,l.height,l.resolution]);
    const cached=htmlImages.get(op.htmlKey);if(cached){htmlImages.delete(op.htmlKey);htmlImages.set(op.htmlKey,cached);continue}
    try{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(await htmlSvg(op));await img.decode();htmlImages.set(op.htmlKey,img)}
    catch(e){const err=new Error('Layer "'+l.id+'" (html): could not be drawn ('+(e&&e.message||'the markup or CSS may be malformed')+')');err.oveLayer=true;throw err}
    while(htmlImages.size>48)htmlImages.delete(htmlImages.keys().next().value)}}
function drawHtml(op){const img=htmlImages.get(op.htmlKey);if(img)ctx.drawImage(img,0,0,op.layer.width,op.layer.height)}
// Lottie layers: each layer gets its own lottie-web animation, drawn by the light canvas player into an offscreen canvas of the
// layer's size, seeked to the exact frame (fractional frames too, for motion blur), then drawn like a picture. Animation data is
// given by src (the renderer passes parsed JSON, the Player URLs, fetched once).
const lottieData=new Map(),lottieAnims=new Map();let lottieSources={};
const lottieFit={contain:'xMidYMid meet',cover:'xMidYMid slice',fill:'none'};
async function lottieJson(src){let job=lottieData.get(src);if(!job){const given=lottieSources[src];job=typeof given==='string'?fetch(given).then(r=>{if(!r.ok)throw new Error('could not load '+given);return r.json()}):Promise.resolve(given);lottieData.set(src,job)}return job}
async function prepareLottie(ops){for(const op of ops){if(op.kind==='group'){await prepareLottie(op.children||[]);continue}if(op.kind!=='lottie')continue;const l=op.layer,key=[l.id,l.src,l.width,l.height,l.fit].join('|');op.lottieKey=key;if(lottieAnims.has(key))continue;
    try{const data=await lottieJson(l.src);if(!data||!data.layers)throw new Error('not a Lottie animation');if(typeof lottie==='undefined')throw new Error('the Lottie player is not loaded');
      const canvas=document.createElement('canvas');canvas.width=Math.round(l.width);canvas.height=Math.round(l.height);const context=canvas.getContext('2d');
      const anim=lottie.loadAnimation({renderer:'canvas',loop:false,autoplay:false,animationData:JSON.parse(JSON.stringify(data)),rendererSettings:{context,clearCanvas:true,preserveAspectRatio:lottieFit[l.fit]||lottieFit.contain}});
      if(!anim.isLoaded)await new Promise((res,rej)=>{anim.addEventListener('DOMLoaded',res);anim.addEventListener('data_failed',()=>rej(new Error('its data could not be read')))});
      lottieAnims.set(key,{anim,canvas,rate:data.fr||30})}catch(e){const err=new Error('Layer "'+l.id+'" (lottie): '+(e&&e.message||e));err.oveLayer=true;throw err}}}
function drawLottie(op){const entry=lottieAnims.get(op.lottieKey);if(!entry)return;const l=op.layer,total=entry.anim.totalFrames;let f=(op.mediaTime||0)*entry.rate;f=l.loop?((f%total)+total)%total:Math.min(f,Math.max(0,total-1));
  entry.anim.goToAndStop(f,true);ctx.drawImage(entry.canvas,0,0,l.width,l.height)}
// Shader layers: one shared WebGL canvas for all of them, a compiled program cached per source. The layer's fragment shader gets
// time, resolution and frame (and Shadertoy's iTime, iResolution, iFrame), plus each var as a uniform without its dashes: numbers as
// float, colours as vec4 in 0..1. A mainImage(out vec4, in vec2) shader is wrapped in a main(). Uniforms the shader declares itself
// are left alone; ones it never uses are simply not set.
let gl,glCanvas,glQuad;const programs=new Map(),colourCache=new Map();
function colourVec(v){let rgba=colourCache.get(v);if(!rgba){const t=document.createElement('canvas').getContext('2d',{willReadFrequently:true});t.fillStyle=v;t.fillRect(0,0,1,1);const d=t.getImageData(0,0,1,1).data;rgba=[d[0]/255,d[1]/255,d[2]/255,d[3]/255];colourCache.set(v,rgba)}return rgba}
function uniformName(name){return name.replace(/^--/,'').replace(/-/g,'_')}
function program(l){const names=Object.keys(l.vars||{}).concat(Object.keys(l).filter(k=>k.startsWith('--'))),key=l.fragment+'|'+[...new Set(names)].sort().join(',');let p=programs.get(key);if(p)return p;
  if(!gl){glCanvas=document.createElement('canvas');gl=glCanvas.getContext('webgl2',{preserveDrawingBuffer:true,premultipliedAlpha:false,antialias:false});if(!gl)throw new Error('WebGL 2 is not available in this browser');
    glQuad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,glQuad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)}
  const src=l.fragment,declared=n=>new RegExp('uniform\\s+\\w+\\s+'+n+'\\b').test(src),es3=/^\s*#version\s+300\s+es/.test(src)||/\bmainImage\s*\(/.test(src);
  const custom=[...new Set(names)].map(n=>{const v=l[n]!==undefined?l[n]:l.vars[n];return [uniformName(n),typeof v==='number'?'float':'vec4']});
  const builtins=[['time','float'],['resolution','vec2'],['frame','float'],['iTime','float'],['iResolution','vec3'],['iFrame','int']].concat(custom);
  const header=(/\bprecision\s+\w+\s+float\b/.test(src)?'':'precision highp float;\n')+builtins.filter(([n])=>!declared(n)).map(([n,t])=>'uniform '+t+' '+n+';').join('\n')+'\n';
  let fragment;if(/\bmainImage\s*\(/.test(src))fragment='#version 300 es\n'+header+src.replace(/^\s*#version[^\n]*\n/,'')+'\nout vec4 ove_FragColor;\nvoid main(){vec4 c=vec4(0.0);mainImage(c,gl_FragCoord.xy);ove_FragColor=c;}';
  else if(es3)fragment=src.replace(/^(\s*#version[^\n]*\n)/,'$1'+header);else fragment=header+src;
  const vertex=es3?'#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}':'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
  const compile=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('the shader does not compile: '+(gl.getShaderInfoLog(s)||'').trim().split('\n')[0]);return s};
  const prog=gl.createProgram();gl.attachShader(prog,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,fragment));gl.bindAttribLocation(prog,0,'p');gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error('the shader does not link: '+(gl.getProgramInfoLog(prog)||'').trim().split('\n')[0]);p={prog,custom};programs.set(key,p);return p}
function drawShader(op){const l=op.layer,k=l.resolution||1,w=Math.max(1,Math.round(l.width*k)),h=Math.max(1,Math.round(l.height*k)),{prog,custom}=program(l),v=op.vars||{},t=Number(v['--t'])||0,fr=Number(v['--frame'])||0;
  if(glCanvas.width!==w)glCanvas.width=w;if(glCanvas.height!==h)glCanvas.height=h;gl.viewport(0,0,w,h);gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,glQuad);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const at=n=>gl.getUniformLocation(prog,n);gl.uniform1f(at('time'),t);gl.uniform2f(at('resolution'),w,h);gl.uniform1f(at('frame'),fr);gl.uniform1f(at('iTime'),t);gl.uniform3f(at('iResolution'),w,h,1);gl.uniform1i(at('iFrame'),fr);
  for(const [name,type] of custom){const value=v['--'+name]!==undefined?v['--'+name]:Object.entries(v).find(([n])=>uniformName(n)===name)?.[1];if(type==='float')gl.uniform1f(at(name),Number(value)||0);else gl.uniform4fv(at(name),colourVec(String(value)))}
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);ctx.drawImage(glCanvas,0,0,l.width,l.height)}
// Group layout: children placed one after another (row or column), measured as they draw: rects, pictures, html, lottie and shader
// layers by their width and height, circles by their diameter, text by its laid-out lines, groups with a layout by their content.
// Each child's own x and y then offset it from its place, so entrance animations still work.
function textBox(op){const l=op.layer,e=l.evaluated||{},size=e.fontSize??l.fontSize;ctx.save();ctx.letterSpacing=(l.letterSpacing||0)+'px';let w=0,h=0;
  if(l.spans&&l.spans.length){const r=layoutRich(l.spans,{fontSize:size,maxWidth:l.maxWidth,maxLines:l.maxLines,minFontSize:l.minFontSize},(t,span,px)=>{ctx.font=(span.fontStyle||l.fontStyle)+' '+(span.fontWeight||l.fontWeight)+' '+px+'px '+op.spanStacks[l.spans.indexOf(span)];return ctx.measureText(t).width});
    w=Math.max(0,...r.lines.map(x=>x.width));h=r.lines.reduce((n,line)=>n+(line.runs.length?Math.max(...line.runs.map(run=>run.size)):size*r.scale)*l.lineHeight,0)}
  else{const font=s=>op.fontPrefix+' '+s+'px '+op.fontStack,t=layoutText(l.content,{fontSize:size,maxWidth:l.maxWidth,maxLines:l.maxLines,minFontSize:l.minFontSize},(s,px)=>{ctx.font=font(px);return ctx.measureText(s).width});ctx.font=font(t.fontSize);
    w=Math.max(0,...t.lines.map(line=>ctx.measureText(line).width));h=t.lines.length?(t.lines.length-1)*t.fontSize*l.lineHeight+t.fontSize:0}
  ctx.restore();return{w,h,ax:l.textAlign==='center'?w/2:l.textAlign==='right'?w:0,ay:0}}
function boxOf(op){const l=op.layer,e=l.evaluated||{},w=e.width??l.width,h=e.height??l.height;if(op.kind==='text')return textBox(op);if(op.kind==='circle'){const d=w??40;return{w:d,h:d,ax:d/2,ay:d/2}}
  if(op.kind==='group'&&l.layout){const s=layoutPlan(op);return{w:w??s.w,h:h??s.h,ax:0,ay:0}}return{w:w||0,h:h||0,ax:0,ay:0}}
function layoutPlan(op){const L=op.layer.layout,l=op.layer,e=l.evaluated||{},kids=op.children||[],boxes=kids.map(boxOf),row=L.direction==='row',main=b=>row?b.w:b.h,cross=b=>row?b.h:b.w,pad=L.padding||0,gap=L.gap||0;
  const content=boxes.reduce((n,b)=>n+main(b),0)+gap*Math.max(0,kids.length-1),crossMax=Math.max(0,...boxes.map(cross)),W=e.width??l.width,H=e.height??l.height;
  const innerMain=(row?W:H)!==undefined?(row?W:H)-2*pad:content,innerCross=(row?H:W)!==undefined?(row?H:W)-2*pad:crossMax;let pos=pad,step=gap;
  if(L.justify==='center')pos=pad+(innerMain-content)/2;else if(L.justify==='end')pos=pad+innerMain-content;else if(L.justify==='space-between'&&kids.length>1)step=gap+(innerMain-content)/(kids.length-1);
  const places=boxes.map(b=>{const c=L.align==='center'?pad+(innerCross-cross(b))/2:L.align==='end'?pad+innerCross-cross(b):pad,place={x:(row?pos:c)+b.ax,y:(row?c:pos)+b.ay};pos+=main(b)+step;return place});
  return{places,w:row?content+2*pad:crossMax+2*pad,h:row?crossMax+2*pad:content+2*pad}}
function drawChildren(op){if(!op.layer.layout){for(const child of op.children)drawOp(child);return}const {places}=layoutPlan(op);op.children.forEach((child,i)=>{ctx.save();ctx.translate(places[i].x,places[i].y);drawOp(child);ctx.restore()})}
return{canvas:c,images,load:async(sources,fonts,lotties)=>{fontList=fonts||[];lottieSources=lotties||{};lottieData.clear();lottieAnims.clear();htmlFontCss=undefined;imageUrls=new Map(Object.entries(sources||{}));await Promise.all((fonts||[]).map(async f=>{const face=new FontFace(f.family,'url('+f.url+')',f.unicodeRange?{weight:String(f.weight),style:f.style,unicodeRange:f.unicodeRange}:{weight:String(f.weight),style:f.style});try{await face.load()}catch{throw new Error('Failed to load font '+f.family+' from '+f.src)}document.fonts.add(face)}));await Promise.all(Object.entries(sources||{}).map(([src,url])=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>{images.set(src,i);res()};i.onerror=()=>rej(new Error('Failed to load image '+src));i.src=url})))},
draw:async(p,drawables)=>{frames=new Map(await Promise.all(Object.entries(p.videoFrames||{}).map(async([key,url])=>{const i=new Image();i.src=url;await i.decode();return [key,i]})));if(drawables)for(const [k,v] of drawables)frames.set(k,v);for(const ops of [p.operations,...(p.subframes||[]).map(s=>s.operations)]){await prepareHtml(ops);await prepareLottie(ops)}if(c.width!==p.width)c.width=p.width;if(c.height!==p.height)c.height=p.height;notes=p.report?{texts:[],thumb:null}:null;unscale=p.scaleX?1/p.scaleX:1;
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
function thumbnail(){const w=64,h=Math.max(1,Math.round(64*c.height/c.width)),t=document.createElement('canvas');t.width=w;t.height=h;const tc=t.getContext('2d',{willReadFrequently:true});tc.drawImage(c,0,0,w,h);const d=tc.getImageData(0,0,w,h).data,out=[];for(let i=0;i<d.length;i+=4)out.push(Math.round(d[i]*0.2126+d[i+1]*0.7152+d[i+2]*0.0722));return{width:w,height:h,pixels:out}}}
