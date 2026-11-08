import { z } from 'zod'; import { colorPattern, variablesSchema, componentsSchema, resolveVariables, substituteVariables } from './variables'; import { captionCueSchema } from './captions'; import { textureTypes } from './design'; import { contentSchema } from './content'; import { fontWeight, fontStyle, assetSchema, assetLinkProblems } from './assets';
export * from './variables'; export * from './captions'; export * from './design'; export * from './content'; export * from './assets'; export * from './production';

const color = z.string().regex(colorPattern);
// Kept in step with easingNames in @ove/animation (a unit test checks they match).
export const easingSchema = z.union([z.enum(['linear','easeIn','easeOut','easeInOut','easeInCubic','easeOutCubic','easeInOutCubic','easeInQuart','easeOutQuart','easeInOutQuart','easeInExpo','easeOutExpo','easeInOutExpo','easeInBack','easeOutBack','spring','hold','land','snap','glide','pop','move','exit','drift','anticipate','bounce']).describe('land, snap, glide and pop for entries, move within the frame, exit for leaving, drift for slow continuous motion, anticipate for a small wind-up before the move, bounce for a landing that rebounds; or a standard curve'), z.tuple([z.number().min(0).max(1), z.number(), z.number().min(0).max(1), z.number()]).describe('Cubic Bézier control points [x1, y1, x2, y2], as in CSS')]);
export const colorProperties = ['fill','color','stroke'] as const;
// A CSS custom property name, such as --speed: shader layers read their animated values as uniforms.
export const cssVariableName = /^--[a-zA-Z][\w-]*$/;
const animation = z.object({ property: z.union([z.enum(['x','y','opacity','rotation','scale','scaleX','scaleY','fontSize','width','height','radius','letterSpacing','strokeWidth','trimStart','trimEnd','blur','volume','d','highlight',...colorProperties]), z.string().regex(cssVariableName)]).describe('A layer property, or a CSS variable such as --speed (shader layers)'), keyframes: z.array(z.object({ frame: z.number().int().nonnegative(), value: z.union([z.number(), z.string()]).describe('A number; a colour for fill, color and stroke; SVG path data for d (shape morphing)'), easing: easingSchema.optional().describe('Curve of the segment arriving at this keyframe') })).min(1), repeat: z.number().int().nonnegative().optional(), reverse: z.boolean().optional(),
  wiggle: z.object({ amount: z.number().describe('How far the value strays either way, in the property\'s own units'), every: z.number().int().positive().default(12).describe('Frames between new random targets'), seed: z.number().int().default(0).describe('Give each layer its own seed so they do not move together'), hold: z.boolean().default(false).describe('Jump between targets instead of easing, for a hand-redrawn boil (every: 5 at 30 fps is 6 jumps a second)') }).optional().describe('Procedural wobble added to this property: secondary motion, an idle float, handheld drift or boil. Frame-exact, so every render matches.') })
  .superRefine((a, ctx) => { if (a.property.startsWith('--')) { a.keyframes.forEach((k, i) => { if (typeof k.value === 'string' && !colorPattern.test(k.value)) ctx.addIssue({ code: 'custom', path: ['keyframes', i, 'value'], message: `${a.property} keyframes need numbers or colours (they are interpolated)` }); }); return; }
    const wantsColor=(colorProperties as readonly string[]).includes(a.property), wantsPath=a.property === 'd'; a.keyframes.forEach((k, i) => { const ok=wantsPath ? typeof k.value === 'string' && k.value.trim() !== '' : wantsColor ? typeof k.value === 'string' && colorPattern.test(k.value) : typeof k.value === 'number';
    if (!ok) ctx.addIssue({ code: 'custom', path: ['keyframes', i, 'value'], message: wantsPath ? 'd keyframes need SVG path data' : wantsColor ? `${a.property} keyframes need colour values` : `${a.property} keyframes need numbers` }); }); });
// Rotation and scale pivot around (x + originX, y + originY). "center" means the middle of the layer's width/height (a circle's centre).
const origin = z.union([z.number(), z.literal('center')]).default(0);
// A solid colour or a gradient. Gradient points are in the layer's own pixels (0,0 is its x, y), so they move with the layer.
const point = z.tuple([z.number(), z.number()]); const stops = z.array(z.object({ offset: z.number().min(0).max(1), color })).min(2);
export const gradientSchema = z.discriminatedUnion('type', [z.object({ type: z.literal('linear'), from: point, to: point, stops }), z.object({ type: z.literal('radial'), center: point, radius: z.number().positive(), stops })]);
const paint = z.union([color, gradientSchema]);
// Outline options shared by rect, circle, path and text. An outline is drawn only when `stroke` is set.
const strokeFields = { stroke: paint.optional().describe('Outline colour or gradient'), strokeWidth: z.number().nonnegative().default(1), strokeDash: z.array(z.number().nonnegative()).optional().describe('Dash and gap lengths, e.g. [12, 6]'), lineCap: z.enum(['butt','round','square']).default('butt'), lineJoin: z.enum(['miter','round','bevel']).default('miter') };
// CSS filter functions only (one level of nested parentheses, for colours inside drop-shadow); no url() references.
// Ducking lowers a sound (usually music) to `amount` of its volume while other sounds play: by default every other audio or unmuted video
// layer, or only the layer ids in `by`. Where those sounds were measured (media assets), it follows their phrases, so the music comes
// back up in the pauses; gaps shorter than attack + release are bridged so it does not pump between words.
export const duckSchema = z.object({ amount: z.number().min(0).max(1).default(0.3).describe('Volume multiplier while ducked, e.g. 0.3'), attackFrames: z.number().int().nonnegative().default(6).describe('Frames to fade down before a sound starts'), releaseFrames: z.number().int().nonnegative().default(15).describe('Frames to come back up after it ends'), by: z.array(z.string()).optional().describe('Only duck under these layer ids') });
// A piece of rich text. Unset styles come from the text layer; sizes shrink together when the layer fits text to maxLines.
// Kinetic text: a text layer animated piece by piece. Each word, letter or line plays the same animation, the next one `stagger`
// frames after the previous, in `order`. Keyframe frames count from the layer's start; x and y offset a piece from where layout put it,
// scale and rotation pivot on its centre. A preset is a ready-made animation sized to the font; `animations` replaces it.
export const splitPresets = ['rise','fade','pop','blur','slide','drop','typewriter'] as const;
export const unitProperties = ['x','y','opacity','scale','rotation','blur','color'] as const;
export const splitSchema = z.object({ by: z.enum(['words','letters','lines']).default('words'), stagger: z.number().nonnegative().default(3).describe('Frames between one piece starting and the next'),
  order: z.enum(['forward','reverse','center','edges','random']).default('forward').describe('center starts in the middle and spreads out; edges starts at both ends; random is shuffled the same way every render'),
  preset: z.enum(splitPresets).default('rise').describe('rise: up into place; fade; pop: grows in with a small overshoot; blur: comes into focus; slide: in from the right; drop: down into place; typewriter: appears at once (use with letters)'),
  duration: z.number().int().positive().default(18).describe('Frames each piece takes to arrive, for presets'),
  animations: z.array(animation).optional().describe('Custom animation for every piece, replacing the preset: x, y, opacity, scale, rotation, blur or color') })
  .superRefine((s, ctx) => { (s.animations ?? []).forEach((a, i) => { if (!(unitProperties as readonly string[]).includes(a.property)) ctx.addIssue({ code: 'custom', path: ['animations', i, 'property'], message: `Pieces of split text can animate ${unitProperties.join(', ')}, not ${a.property}` }); }); });
export const spanSchema = z.object({ text: z.string(), color: paint.optional(), fontSize: z.number().positive().optional(), fontWeight: fontWeight.optional(), fontStyle: fontStyle.optional(), fontFamily: z.string().optional(), background: color.optional().describe('Highlight behind the span'), underline: z.boolean().optional() });
const cssFilter = z.string().regex(/^\s*((blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|drop-shadow)\([^()]*(\([^()]*\)[^()]*)*\)\s*)+$/, 'Use CSS filter functions such as "brightness(1.2) saturate(0.5)"');
export const blendModes = ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'] as const;
// Built-in sound effects, used as an audio layer's src: "sfx:whoosh". Synthesised by FFmpeg from fixed formulas (see @ove/ffmpeg).
export const sfxNames = ['click','tick','pop','whoosh','thump','ding','riser','shimmer','sparkle','impact','ambient-pad'] as const;
// A source naming a built-in sound rather than a file: never resolved against a folder or made absolute.
export const isBuiltinSound = (src: string) => src.startsWith('sfx:'); export const builtinSoundName = (src: string) => src.slice(4);
export const gradeLooks = ['warm', 'cool', 'cinematic', 'teal-orange', 'noir', 'vivid', 'faded'] as const;
export const gradeSchema = z.object({ look: z.enum(gradeLooks).optional().describe('A starting look; the other numbers are added to it'),
  exposure: z.number().min(-3).max(3).optional().describe('Brightness in stops: 1 doubles the light'), contrast: z.number().min(-1).max(1).optional(), saturation: z.number().min(-1).max(1).optional().describe('-1 is black and white'),
  temperature: z.number().min(-1).max(1).optional().describe('Negative cooler (blue), positive warmer (orange)'), tint: z.number().min(-1).max(1).optional().describe('Negative greener, positive more magenta'),
  shadows: z.number().min(-1).max(1).optional().describe('Lift (positive) or crush (negative) the dark tones'), highlights: z.number().min(-1).max(1).optional().describe('Boost (positive) or pull back (negative) the bright tones'), fade: z.number().min(0).max(1).optional().describe('Raise the blacks for a faded film look') })
  .describe('Colour grading: exposure, contrast, saturation, white balance, shadows and highlights, or a look. Not animatable; cross-fade two graded layers to change it over time.');
const baseLayer = z.object({ id: z.string().min(1), type: z.enum(['text','image','video','audio','captions','rect','circle','path','group','lottie','shader','code','react']),
  grade: gradeSchema.optional().describe('Colour grading for this layer and everything inside it.'),
  matte: z.object({ src: z.string().min(1).describe('A video or picture, as an asset id or path: made with any tool (rembg, Robust Video Matting, a video editor)'), mode: z.enum(['luma', 'alpha']).default('luma').describe('luma: white keeps the layer, black hides it; alpha: the matte\'s own transparency'), invert: z.boolean().default(false).describe('Keep what the matte hides'), type: z.enum(['video', 'image']).optional().describe('Left out, picture file extensions mean image, anything else video'), trimStart: z.number().int().nonnegative().optional().describe('Frames of a video matte to skip; a video layer\'s matte follows its own trim and speed'), playbackRate: z.number().positive().max(16).optional().describe('Speed of a video matte; a tiny value holds one frame') }).optional().describe('Show this layer only where a matte says so (a cut-out of the speaker, a shape, a gradient). Becomes a masking group when the composition loads.'),
  shadow: z.object({ color, blur: z.number().nonnegative().default(0), offsetX: z.number().default(0), offsetY: z.number().default(0) }).optional().describe('Drop shadow; offsets are in canvas pixels and ignore the layer\'s scale and rotation'),
  blur: z.number().nonnegative().default(0).describe('Gaussian blur in pixels'), filter: cssFilter.optional(), blendMode: z.enum(blendModes).default('normal').describe('How the layer mixes with what is drawn below it'), startFrame: z.number().int().nonnegative().default(0), endFrame: z.number().int().positive().optional(), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().optional(), height: z.number().positive().optional(), opacity: z.number().min(0).max(1).default(1), rotation: z.number().default(0), scale: z.number().positive().default(1), scaleX: z.number().positive().default(1).describe('Stretch across, on top of scale. With scaleY, squash and stretch: keep scaleX × scaleY near 1 so the shape keeps its volume'), scaleY: z.number().positive().default(1).describe('Stretch up and down, on top of scale'), originX: origin, originY: origin, zIndex: z.number().int().default(0), visible: z.boolean().default(true), fixed: z.boolean().default(false).describe('Stays in place when the scene camera moves: captions, logos, overlays (top-level scene layers only)'), animations: z.array(animation).default([]) });
// Scene transitions. `in` effects reveal the scene over its first durationFrames; `out` effects hide it over its last. Overlap two scenes
// (start the next before the previous ends) and give them matching out/in transitions to cross between them.
// Output formats. mp4 is H.264 (or H.265 with codec) + AAC; webm is VP9 + Opus; mov is ProRes 4444 + PCM, for editing software;
// gif loops silently with a generated palette; png writes one image per frame into a folder. Only webm, mov and png keep transparency.
export const outputFormats = ['mp4','webm','mov','gif','png'] as const;
export const exportSchema = z.object({ format: z.enum(outputFormats).default('mp4'), codec: z.enum(['h264','h265']).default('h264').describe('mp4 only'), transparent: z.boolean().default(false).describe('Leave the background transparent (webm, mov, png only)'), audio: z.string().optional().describe('Audio asset id, or a path relative to the composition file'), audioVolume: z.number().min(0).max(4).default(1).describe('Volume of export.audio'), duck: duckSchema.optional().describe('Duck export.audio under the other sounds'),
    loudness: z.number().min(-40).max(-5).optional().describe('Make the sound this loud overall, in LUFS: -14 for most streaming and social sites, -16 for podcasts and spoken explainers. Peaks are limited to about -1.5 dBFS'),
    crf: z.number().int().min(0).max(63).optional().describe('Constant quality: lower is better and larger (defaults: 20 H.264, 24 H.265, 32 VP9)'), bitrate: z.string().regex(/^\d+(\.\d+)?[kKmMgG]?$/, 'Use a number with k, M or G, e.g. "8M" or "256k"').optional().describe('Target video data rate such as "8M"; wins over crf'), audioBitrate: z.string().regex(/^\d+(\.\d+)?[kKmMgG]?$/, 'Use a number with k, M or G, e.g. "8M" or "256k"').optional().describe('Audio data rate such as "256k"'),
    scale: z.number().gt(0).max(4).default(1).describe('Render at this fraction of the size, e.g. 0.5 for fast drafts (sizes round to even numbers)') })
  .superRefine((e, ctx) => { if (e.transparent && !['webm','mov','png'].includes(e.format)) ctx.addIssue({ code: 'custom', path: ['transparent'], message: `${e.format} cannot store transparency; use webm, mov or png` }); if (e.codec !== 'h264' && e.format !== 'mp4') ctx.addIssue({ code: 'custom', path: ['codec'], message: 'codec applies to mp4 only' }); });
export const transitionSchema = z.object({ type: z.enum(['fade','slide','wipe','zoom','iris','push','dip','blur']).describe('iris: a circle opening (or closing) on x, y; push: comes in and pushes the scene before it out the same way (transitionIn only); dip: through a colour; blur: in or out of focus'), durationFrames: z.number().int().positive(), direction: z.enum(['left','right','top','bottom']).default('left').describe('slide/wipe/push: the side the scene enters from, or exits towards'),
  color: color.default('#000000').describe('dip: the colour passed through'), x: z.number().optional().describe('iris: centre of the circle (default: the frame centre)'), y: z.number().optional(), easing: easingSchema.default('easeInOut') });
export const layerSchema: z.ZodType<any> = z.discriminatedUnion('type', [
  baseLayer.extend({ type: z.literal('text'), content: z.string().default('').describe('The text; leave out when using spans'), spans: z.array(spanSchema).optional().describe('Rich text: styled pieces laid out together, used instead of content'), fontSize: z.number().positive().default(48), fontFamily: z.string().default('Inter').describe('An installed font, the family of a font asset, or a comma-separated list'), fontWeight: fontWeight.default(400), fontStyle: fontStyle.default('normal'), letterSpacing: z.number().default(0).describe('Extra pixels between characters'), lineHeight: z.number().positive().default(1.2), color: paint.default('#ffffff'), ...strokeFields, lineJoin: strokeFields.lineJoin.removeDefault().default('round').describe('round avoids spikes on letter corners'), textAlign: z.enum(['left','center','right']).default('left'), highlight: z.number().min(0).max(1).default(1).describe('Rich text: how much of the span highlights (background) is drawn, 0 to 1, swept left to right one span after the next. Animate 0 to 1 for a highlighter swipe'),
    maxWidth: z.number().positive().optional().describe('Wrap lines to this width in pixels'), maxLines: z.number().int().positive().optional().describe('Cut to this many lines, ending in an ellipsis, unless minFontSize lets the text shrink to fit'), minFontSize: z.number().positive().optional().describe('Shrink the text, down to this size, until it fits maxWidth and maxLines without splitting words'), split: splitSchema.optional().describe('Animate the text word by word, letter by letter or line by line') }).superRefine((l, ctx) => { if (l.split?.by === 'letters' && l.spans?.length) ctx.addIssue({ code: 'custom', path: ['split', 'by'], message: 'Rich text (spans) splits by words or lines, not letters' }); }),
  // A Lottie animation (After Effects via Bodymovin, or LottieFiles), seeked to the exact frame. Expressions are not supported (they
  // are JavaScript); pictures must be embedded in the JSON. Timing works like a video layer.
  baseLayer.extend({ type: z.literal('lottie'), src: z.string().min(1).describe('A lottie asset id, or a .json file relative to the composition'), width: z.number().positive(), height: z.number().positive(),
    fit: z.enum(['contain','cover','fill']).default('contain'), trimStart: z.number().nonnegative().default(0).describe('Frames of the animation to skip, at the composition fps'),
    playbackRate: z.number().positive().max(16).default(1), loop: z.boolean().default(false).describe('Start again when it ends; otherwise it holds its last frame') }),
  // A React component drawn every frame: the bundle that `ove build video.tsx` writes renders the component for this frame to markup
  // (react-dom/server), which is drawn as markup. Like code layers it runs the author's JavaScript, so it needs --allow-code.
  baseLayer.extend({ type: z.literal('react'), src: z.string().min(1).describe('The bundle ove build wrote, relative to the composition'), width: z.number().positive(), height: z.number().positive(),
    durationInFrames: z.number().int().positive().describe('The length useVideoConfig() reports to the component'), props: z.record(z.string(), z.unknown()).default({}).describe('Handed to the component as props'),
    resolution: z.number().min(0.5).max(4).default(1).describe('Raster detail: 2 keeps it sharp when scaled up or under a camera zoom (slower)') }),
  // JavaScript drawn onto a width × height canvas every frame: function draw(ctx, { frame, t, fps, width, height, props, api }). It runs
  // in the page that renders the video, so unlike every other layer it can do anything JavaScript can: compositions with code layers only
  // render when the caller says it trusts them (--allow-code), and never come from the AI layer or a pasted file. It must be a pure function
  // of its arguments (use api.random(seed), not Math.random) or frames differ between renders.
  baseLayer.extend({ type: z.literal('code'), code: z.string().min(1).optional().describe('The JavaScript, inline: defines function draw(ctx, args)'), src: z.string().min(1).optional().describe('A .js file with the same, relative to the composition'),
    width: z.number().positive(), height: z.number().positive(), props: z.record(z.string(), z.unknown()).default({}).describe('Values handed to draw as args.props (they can use {{variables}})'),
    resolution: z.number().min(0.5).max(4).default(1).describe('Raster detail: 2 keeps it sharp when scaled up or under a camera zoom (slower)') })
    .superRefine((l, ctx) => { if ((l.code === undefined) === (l.src === undefined)) ctx.addIssue({ code: 'custom', path: ['code'], message: 'A code layer needs exactly one of "code" (inline) or "src" (a file)' }); }),
  // A GLSL fragment shader filling a width × height box: time, resolution and frame are provided (and Shadertoy's iTime, iResolution,
  // iFrame for code written as mainImage), plus each var as a uniform of the same name without the dashes (numbers as float,
  // colours as vec4). It runs on the GPU with no access to anything else.
  baseLayer.extend({ type: z.literal('shader'), fragment: z.string().min(1).describe('GLSL ES fragment shader: a main() writing gl_FragColor, or a Shadertoy mainImage(out vec4, in vec2)'),
    width: z.number().positive(), height: z.number().positive(),
    vars: z.record(z.string().regex(cssVariableName, 'Variable names start with --'), z.union([z.number(), z.string().regex(colorPattern)])).default({}).describe('Uniforms: { "--speed": 1 } becomes uniform float speed; colours become vec4'),
    resolution: z.number().min(0.25).max(2).default(1).describe('Render at this fraction of the size and scale up (0.5 is four times faster)') }),
  baseLayer.extend({ type: z.literal('image'), src: z.string().min(1), objectFit: z.enum(['cover','contain','fill']).default('cover'), radius: z.number().nonnegative().default(0).describe('Rounded corners, clipping the picture') }),
  baseLayer.extend({ type: z.literal('video'), src: z.string().min(1), objectFit: z.enum(['cover','contain','fill']).default('cover'), radius: z.number().nonnegative().default(0).describe('Rounded corners, clipping the picture'), trimStart: z.number().int().nonnegative().default(0).describe('Frames of the source to skip, at the composition fps'), playbackRate: z.number().positive().max(16).default(1), loop: z.boolean().default(false).describe('Restart from the first source frame when the source ends; otherwise hold the last frame'), volume: z.number().min(0).max(4).default(1).describe('Volume of the clip\'s own sound; 1 is unchanged; animatable'), muted: z.boolean().default(false), duck: duckSchema.optional() }),
  baseLayer.extend({ type: z.literal('audio'), src: z.string().min(1).refine(src => !isBuiltinSound(src) || (sfxNames as readonly string[]).includes(builtinSoundName(src)), { message: `Built-in sounds are ${sfxNames.map(n => `sfx:${n}`).join(', ')}` }).describe('An audio asset id, a file relative to the composition, or a built-in sound: sfx:click, sfx:tick, sfx:pop, sfx:whoosh, sfx:thump, sfx:ding, sfx:riser, sfx:shimmer, sfx:sparkle, sfx:impact, sfx:ambient-pad'), volume: z.number().min(0).max(4).default(1).describe('1 is unchanged, 0.5 is half, 2 is double; animatable with keyframes'), duck: duckSchema.optional(), trimStart: z.number().int().nonnegative().default(0).describe('Frames of the source to skip, at the composition fps'), playbackRate: z.number().positive().max(16).default(1), loop: z.boolean().default(false).describe('Restart from the start of the source when it ends; otherwise silence'), fadeInFrames: z.number().int().nonnegative().default(0), fadeOutFrames: z.number().int().nonnegative().default(0) }),
  // Captions: shows the line being spoken at each moment. With word timings the current word is highlighted; spoken words keep
  // `color`, words still to come use `upcomingColor`. x, y is the anchor of the first line (centre for textAlign center).
  baseLayer.extend({ type: z.literal('captions'), src: z.string().min(1).describe('A captions asset id, or a .srt, .vtt or .json file relative to the composition'), cues: z.array(captionCueSchema).optional().describe('Caption lines given inline instead of a file'),
    mode: z.enum(['words','lines']).default('words').describe('words highlights the current word when word timings exist; lines shows each line in one colour'), maxWords: z.number().int().positive().default(7).describe('Longest line, in words, when grouping word timings'), offset: z.number().default(0).describe('Seconds to shift the captions by (positive = later)'),
    fontSize: z.number().positive().default(52), fontFamily: z.string().default('Inter'), fontWeight: fontWeight.default(700), fontStyle: fontStyle.default('normal'), letterSpacing: z.number().default(0), lineHeight: z.number().positive().default(1.3), textAlign: z.enum(['left','center','right']).default('center'), maxWidth: z.number().positive().default(1400),
    color: color.default('#ffffff'), highlightColor: color.default('#facc15'), emphasis: z.array(z.string()).default([]).describe('Words to stand out (any case, punctuation ignored), drawn in emphasisColor once said'), emphasisColor: color.optional().describe('Colour of emphasis words; default: highlightColor'), dropFillers: z.boolean().default(true).describe('Leave out filler words (um, uh, erm…) and words said twice in a row'),  upcomingColor: color.default('rgba(255,255,255,0.55)'), background: color.default('rgba(0,0,0,0.55)').describe('Box behind the text; "transparent" for none'), padding: z.number().nonnegative().default(18), radius: z.number().nonnegative().default(14), ...strokeFields, lineJoin: strokeFields.lineJoin.removeDefault().default('round') }),
  baseLayer.extend({ type: z.literal('rect'), fill: paint.default('#000000'), radius: z.number().nonnegative().default(0), ...strokeFields }),
  baseLayer.extend({ type: z.literal('circle'), fill: paint.default('#000000'), ...strokeFields }),
  baseLayer.extend({ type: z.literal('path'), d: z.string().min(1).describe('SVG path data, in pixels relative to x, y, e.g. "M0 0 L200 0 L100 150 Z"'), fill: paint.optional().describe('Leave out for an outline-only path'), fillRule: z.enum(['nonzero','evenodd']).default('nonzero'), ...strokeFields,
    trimStart: z.number().min(0).max(1).default(0).describe('Fraction of the outline hidden at its start'), trimEnd: z.number().min(0).max(1).default(1).describe('Fraction of the outline drawn up to; animate 0 → 1 to draw the line on') }),
  baseLayer.extend({ type: z.literal('group'), children: z.array(z.lazy(() => layerSchema)).default([]), masked: z.object({ mode: z.enum(['luma', 'alpha']).default('luma'), invert: z.boolean().default(false) }).optional().describe('The group\'s last child is a matte: the other children show only where it is white (luma) or opaque (alpha). Written for you by the matte property.'), clipPath: z.string().min(1).optional().describe('SVG path data in the group\'s pixels; children are only visible inside it'),
    layout: z.object({ direction: z.enum(['row','column']).default('row'), gap: z.number().nonnegative().default(0), padding: z.number().nonnegative().default(0),
      align: z.enum(['start','center','end']).default('start').describe('Across the direction: top, middle or bottom of a row; left, centre or right of a column'),
      justify: z.enum(['start','center','end','space-between']).default('start').describe('Along the direction, within the group\'s width (row) or height (column) when set') }).optional()
      .describe('Place the children one after another, measured as drawn (text included); each child\'s own x and y then offset it from its place') })
]);
// `overlay` (a composition-level list of layers) is lifted into a last scene by sequenceScenes; see there.
// A scene without startFrame starts where the previous scene ends, minus `overlap` (default: its transitionIn length, so the
// transition plays over the previous scene); loadComposition fills it in. The first scene starts at 0.
// The scene camera: which point of the scene is shown at the centre of the frame (x, y; default the frame's centre), how close (zoom;
// 2 shows half as much, twice as large), its rotation in degrees (positive turns the camera clockwise, so the picture turns the
// other way) and shake, a deterministic wobble of that many pixels for impacts. All of them animate like layer properties.
export const cameraSchema = z.object({ x: z.number().optional(), y: z.number().optional(), zoom: z.number().positive().default(1), rotation: z.number().default(0), shake: z.number().nonnegative().default(0).describe('Wobble in pixels, the same in every render'),
  animations: z.array(z.object({ property: z.enum(['x','y','zoom','rotation','shake']), keyframes: z.array(z.object({ frame: z.number().int().nonnegative(), value: z.number(), easing: easingSchema.optional() })).min(1), repeat: z.number().int().nonnegative().optional(), reverse: z.boolean().optional() })).default([]) });
export const sceneSchema = z.object({ grade: gradeSchema.optional().describe('Colour grading for the whole scene (fixed layers excluded).'), id: z.string().min(1), name: z.string().min(1), startFrame: z.number().int().nonnegative().default(0), overlap: z.number().int().nonnegative().optional().describe('Frames this scene overlaps the previous one when startFrame is left out'), durationFrames: z.number().int().positive(), metadata: z.record(z.string(), z.unknown()).default({}), beat: z.string().optional().describe('The content beat this scene renders'), transitionIn: transitionSchema.optional(), transitionOut: transitionSchema.optional(), camera: cameraSchema.optional().describe('Moves, zooms and turns the view of the whole scene; layers with fixed: true stay put'), layers: z.array(layerSchema).default([]), assetIds: z.array(z.string()).default([]) });
// The beat grid: with a top-level tempo, expressions can place things on the music. beat(n) is the frame of beat n (0 = the first beat,
// at tempo.offset seconds), bar(n, b) the frame of beat b of bar n, beats(n) the length of n beats in frames. Fractional beats work.
export const tempoSchema = z.object({ bpm: z.number().positive().max(400), offset: z.number().default(0).describe('Seconds from the start of the video to the first beat'), beatsPerBar: z.number().int().positive().default(4) });
export function beatFunctions(raw: any): Record<string, (...args: unknown[]) => number> { const tempo=tempoSchema.safeParse(raw?.tempo), fps=Number(raw?.fps);
  const need=(name: string) => () => { throw new Error(`${name}() needs a top-level "tempo": { "bpm": … } and a numeric fps`); };
  if (!tempo.success || !(fps > 0)) return { beat: need('beat'), bar: need('bar'), beats: need('beats') };
  const { bpm, offset, beatsPerBar }=tempo.data, at=(n: number) => Math.round((offset + n*60/bpm)*fps), number=(v: unknown, name: string) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name}() takes numbers`); return v; };
  return { beat: n => at(number(n, 'beat')), bar: (n, b=0) => at(number(n, 'bar')*beatsPerBar + number(b, 'bar')), beats: n => Math.round(number(n, 'beats')*60/bpm*fps) }; }
export const textureSchema = z.object({
  type: z.enum(textureTypes).default('none').describe('Background treatment drawn under the content'),
  color: color.default('#ffffff').describe('Ink of the pattern'),
  opacity: z.number().min(0).max(1).default(0.06).describe('Strength of the pattern'),
  scale: z.number().positive().default(48).describe('Pattern spacing in composition pixels'),
}).describe('A grid, dot, scanline or paper treatment behind the scenes');

export const compositionSchema = z.object({ $schema: z.string().optional(), version: z.literal('1.0'), id: z.string().min(1), name: z.string().min(1), width: z.number().int().positive(), height: z.number().int().positive(), fps: z.number().int().positive().max(240), durationFrames: z.union([z.number().int().positive(), z.literal('auto')]).describe('"auto" ends the video when its last scene ends').transform((v, ctx) => { if (v === 'auto') { ctx.addIssue({ code: 'custom', message: '"auto" is resolved by loadComposition; parseComposition needs a number' }); return z.NEVER; } return v; }), variables: variablesSchema.default({}).describe('Template inputs; use them as {{name}} in any string'), components: componentsSchema.default({}).describe('Reusable layer sets, placed with { "use": name, "with": { … } }'), assets: z.array(assetSchema).default([]), scenes: z.array(sceneSchema).min(1), overlay: z.array(layerSchema).optional().describe('Layers drawn over every scene for the whole video: a header, a footer, a progress bar. Frames count from the start of the video. On loading they become one last scene named "overlay", so scene cameras and transitions never move them'), background: paint.default('#101827').describe('Colour or gradient behind all layers (ignored when export.transparent is true)'), content: contentSchema.optional().describe('The script and the data the video is built from; narration and captions derive from it'), texture: textureSchema.optional(), motionBlur: z.object({ samples: z.number().int().min(2).max(32).default(8).describe('Sub-frames averaged per frame: more is smoother and slower'), shutter: z.number().gt(0).max(360).default(180).describe('Shutter angle in degrees: 180 blurs over half a frame, the film look; 360 over a whole frame') }).optional().describe('Blur fast motion by averaging sub-frames (renders only; the live preview shows it sharp). Each frame takes samples times as long to draw'), tempo: tempoSchema.optional().describe('The music\'s tempo, for beat(n), bar(n) and beats(n) in expressions'), grain: z.number().min(0).max(1).default(0).describe('Film grain over the whole frame, such as 0.06: it hides banding in dark gradients. Different each frame, the same in every render; not applied to transparent output'), export: exportSchema.default({ format: 'mp4', codec: 'h264', transparent: false, scale: 1, audioVolume: 1 }) }).superRefine((value, ctx) => { for (const scene of value.scenes) if (scene.startFrame + scene.durationFrames > value.durationFrames) ctx.addIssue({ code: 'custom', path: ['scenes'], message: `Scene ${scene.id} exceeds composition duration` }); for (const problem of assetLinkProblems(value.assets)) ctx.addIssue({ code: 'custom', path: ['assets', value.assets.findIndex(asset => asset.id === problem.assetId)], message: problem.message }); });
export type Composition = z.infer<typeof compositionSchema>; export type Layer = z.infer<typeof layerSchema>; export type Animation = z.infer<typeof animation>;
/** A scene with a `grade` puts all its layers (except fixed ones) in a graded group. */
export function expandSceneGrades(input: unknown): unknown {
  const raw = input as any; if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenes)) return input;
  return { ...raw, scenes: raw.scenes.map((scene: any) => {
    if (!scene || typeof scene !== 'object' || !scene.grade || !Array.isArray(scene.layers)) return scene;
    const { grade, ...rest } = scene, still = scene.layers.filter((layer: any) => layer?.fixed), moving = scene.layers.filter((layer: any) => !layer?.fixed);
    return { ...rest, layers: [{ id: `${scene.id}-graded`, type: 'group', x: 0, y: 0, grade, children: moving }, ...still] };
  }) };
}
const pictureFile = /\.(png|jpe?g|webp|gif|bmp)$/i;
/** Turns every layer with a `matte` into a masking group: the layer, then the matte as a video or picture layer, with the group masking by its last child. */
export function expandMattes(input: unknown): unknown {
  const raw = input as any; if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenes)) return input;
  const wrap = (layer: any): any => {
    if (!layer || typeof layer !== 'object') return layer;
    const next = Array.isArray(layer.children) ? { ...layer, children: layer.children.map(wrap) } : layer;
    const matte = next.matte; if (!matte || typeof matte !== 'object' || typeof matte.src !== 'string') return next;
    const { matte: _matte, zIndex, fixed, ...inner } = next;
    const image = (matte.type ?? (pictureFile.test(matte.src) ? 'image' : 'video')) === 'image', follows = inner.type === 'video';
    const matteLayer = { id: `${inner.id}-matte`, type: image ? 'image' : 'video', src: matte.src, x: 0, y: 0, width: raw.width, height: raw.height, objectFit: 'cover', startFrame: inner.startFrame ?? 0, ...(inner.endFrame !== undefined ? { endFrame: inner.endFrame } : {}),
      ...(image ? {} : { trimStart: matte.trimStart ?? (follows ? inner.trimStart ?? 0 : 0), playbackRate: matte.playbackRate ?? (follows ? inner.playbackRate ?? 1 : 1), loop: follows ? !!inner.loop : false, muted: true, volume: 0 }) };
    return { id: `${inner.id}-masked`, type: 'group', x: 0, y: 0, ...(zIndex !== undefined ? { zIndex } : {}), ...(fixed ? { fixed } : {}), masked: { mode: matte.mode ?? 'luma', invert: !!matte.invert }, children: [inner, matteLayer] };
  };
  return { ...raw, scenes: raw.scenes.map((scene: any) => scene && Array.isArray(scene.layers) ? { ...scene, layers: scene.layers.map(wrap) } : scene) };
}
// Older compositions (and several templates) write the scene camera's motion as `keyframes: [{ "frame": 0, "zoom": 1.06, "easing": "drift" }]`,
// naming the property inside each keyframe, while the schema wants one animation per property. Rewrite the shorthand before
// parsing: without it the keyframes are unknown to the schema, are dropped, and the camera silently never moves.
export function expandCameraKeyframes(input: unknown): unknown {
  const raw = input as any; if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenes)) return input;
  const camera = (cam: any) => {
    if (!cam || typeof cam !== 'object' || !Array.isArray(cam.keyframes)) return cam;
    const { keyframes, ...rest } = cam;
    const animations = (['zoom', 'x', 'y', 'rotation', 'shake'] as const).flatMap(property => {
      const frames = keyframes.filter((keyframe: any) => keyframe && typeof keyframe === 'object' && typeof keyframe.frame === 'number' && keyframe[property] !== undefined)
        .map((keyframe: any) => ({ frame: keyframe.frame, value: keyframe[property], ...(keyframe.easing !== undefined ? { easing: keyframe.easing } : {}) }));
      return frames.length ? [{ property, keyframes: frames }] : [];
    });
    return animations.length ? { ...rest, animations } : rest;
  };
  return { ...raw, scenes: raw.scenes.map((scene: any) => scene && typeof scene === 'object' && scene.camera && typeof scene.camera === 'object' ? { ...scene, camera: camera(scene.camera) } : scene) };
}
/**
 * The html layer was removed in favour of react layers. A file that still has one (an older composition, or a block added by an older
 * version) gets a sentence saying what to do, not a dump of what the schema expected instead.
 */
function rejectRemovedLayers(input: unknown): void {
  const found: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) { value.forEach((item, index) => walk(item, `${path}[${index}]`)); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (object.type === 'html' && typeof object.html === 'string') found.push(typeof object.id === 'string' ? object.id : path);
    for (const [key, child] of Object.entries(object)) walk(child, `${path}.${key}`);
  };
  walk((input as any)?.scenes, 'scenes'); walk((input as any)?.components, 'components');
  if (!found.length) return;
  const shown = found.slice(0, 3).map(id => `"${id}"`).join(', ') + (found.length > 3 ? `, and ${found.length - 3} more` : '');
  throw new Error(`This video has html layers (${shown}), which are no longer supported. Draw that content as a react layer (ove build video.tsx) or with text, shape and path layers. A block added by an older version keeps its html layer: remove it and add the block again.`);
}
export function parseComposition(input: unknown): Composition { rejectRemovedLayers(input); return compositionSchema.parse(expandMattes(expandSceneGrades(expandCameraKeyframes(input)))); }
// Measured media, by asset id, for expressions such as {{media['vo-intro'].frames}}: the length, and the stretches of sound between
// pauses (segments), in seconds and in frames at the composition's fps. Measured in Node by @ove/core (measureMedia).
export type MediaSegment = { start: number; end: number; startFrame: number; endFrame: number };
export type MediaInfo = { duration: number; frames: number; segments: MediaSegment[]; soundEnd: number; soundEndFrames: number };
// Expressions can read the canvas (canvas.width, canvas.height, canvas.fps, canvas.aspect, canvas.isVertical, canvas.safeTop, canvas.safeBottom...) once those are plain numbers, so reusable layers can fit any size.
const canvasNames = (input: unknown) => {
  const raw = (input ?? {}) as Record<string, unknown>;
  const [width, height, fps] = [raw.width, raw.height, raw.fps];
  if (typeof width !== 'number' || typeof height !== 'number') return {};
  const f = typeof fps === 'number' ? fps : 30;
  const isVertical = width < height;
  const isWide = width > height;
  const isSquare = width === height;
  const aspect = isVertical ? '9:16' : isSquare ? '1:1' : '16:9';
  return {
    canvas: {
      width,
      height,
      fps: f,
      aspect,
      isVertical,
      isWide,
      isSquare,
      safeTop: Math.round(height * (isVertical ? 0.08 : 0.05)),
      safeBottom: Math.round(height * (isVertical ? 0.20 : 0.08)),
      safeLeft: Math.round(width * (isVertical ? 0.06 : 0.05)),
      safeRight: Math.round(width * (isVertical ? 0.16 : 0.05)),
      vw: (pct: number) => Math.round((width * Number(pct)) / 100),
      vh: (pct: number) => Math.round((height * Number(pct)) / 100),
    }
  };
};
export type LoadOptions = { media?: Record<string, MediaInfo> };
// Places scenes that leave out startFrame after the previous one (minus their overlap) and works out durationFrames: "auto".
export function sequenceScenes(expanded: unknown): unknown { if (!expanded || typeof expanded !== 'object' || !Array.isArray((expanded as any).scenes)) return expanded; const raw = expanded as any; let end = 0, latest = 0;
  const scenes = raw.scenes.map((scene: any, i: number) => { if (!scene || typeof scene !== 'object') return scene; let start = scene.startFrame;
    if (start === undefined) start = i === 0 ? 0 : Math.max(0, end - (typeof scene.overlap === 'number' ? scene.overlap : scene.transitionIn?.durationFrames ?? 0));
    if (typeof start === 'number' && typeof scene.durationFrames === 'number') { end = start + scene.durationFrames; latest = Math.max(latest, end); } return { ...scene, startFrame: start }; });
  const total = raw.durationFrames === 'auto' || raw.durationFrames === undefined ? (latest || raw.durationFrames) : raw.durationFrames;
  // Persistent layers (a header, a footer, a progress bar) become one more scene as long as the video, drawn after the others: every part of the
  // pipeline already knows scenes, and the scene cameras and transitions that act on the content never touch it. Its layers' frames are the video's.
  const { overlay, ...kept } = raw;
  const persistent = Array.isArray(overlay) && overlay.length && typeof total === 'number' ? [{ id: 'overlay', name: 'Overlay', startFrame: 0, durationFrames: total, layers: overlay }] : [];
  return { ...kept, scenes: [...scenes, ...persistent], durationFrames: total }; }
// Resolves {{variables}} in a raw composition with the given values (strings from a command line are converted to the declared types),
// places scenes, then parses it. `media` makes measured media available to expressions.
export function loadComposition(input: unknown, values: Record<string, unknown> = {}, options: LoadOptions = {}): Composition { rejectRemovedLayers(input); const declarations=variablesSchema.parse((input as any)?.variables ?? {});
  return parseComposition(sequenceScenes(substituteVariables(input, resolveVariables(declarations, values), { ...beatFunctions(input), ...canvasNames(input), ...(options.media ? { media: options.media } : {}) }))); }
export const compositionJsonSchema = z.toJSONSchema(compositionSchema, { target: 'draft-2020-12', io: 'input' });
// Readable text for any error, used by the CLI and the preview: validation problems become one "✖ message → at path" line each.
export const describeError = (error: unknown): string => error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : String(error);
