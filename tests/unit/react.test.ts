import { describe, expect, it } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assetProblems } from '@ove/ai';
import { loadComposition } from '@ove/schema';
import {
  AbsoluteFill,
  AmbientGlow,
  Badge,
  BentoCard,
  BentoGrid,
  CodeEditor,
  Composition,
  DeviceFrame,
  Easing,
  Freeze,
  Folder,
  GlassCard,
  KineticText,
  Loop,
  NumberTicker,
  ProgressBar,
  Sequence,
  Series,
  Still,
  Typewriter,
  Waveform,
  interpolate,
  random,
  spring,
  springValue,
  stagger,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from '@ove/react';

// The components are pure functions of the frame: render them as the bundle's render function does, at a chosen frame.
const shared = (globalThis as any).__oveReact as { frame: any; config: any };
const config = { id: 't', width: 640, height: 360, fps: 30, durationInFrames: 90 };
const at = (frame: number, node: ReactNode) => renderToStaticMarkup(createElement(shared.config.Provider, { value: config }, createElement(shared.frame.Provider, { value: frame }, node)));
const Probe = () => createElement('span', null, `frame ${useCurrentFrame()} of ${useVideoConfig().durationInFrames} at ${useVideoConfig().fps}`);

describe('@ove/react', () => {
  it('gives components the frame and the video config, and refuses to run outside a render', () => {
    expect(at(12, createElement(Probe))).toBe('<span>frame 12 of 90 at 30</span>');
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(/only works inside a component rendered by MotionRender/);
  });

  it('shows a Sequence from its first frame, counted from there', () => {
    const node = createElement(Sequence, { from: 10, durationInFrames: 5, layout: 'none' }, createElement(Probe));
    expect(at(9, node)).toBe(''); expect(at(10, node)).toContain('frame 0 of'); expect(at(14, node)).toContain('frame 4 of'); expect(at(15, node)).toBe('');
  });

  it('plays Series.Sequence children one after another, with offsets', () => {
    const node = createElement(Series, null,
      createElement(Series.Sequence, { durationInFrames: 10 }, createElement('b', null, 'one')),
      createElement(Series.Sequence, { durationInFrames: 10, offset: 5 }, createElement('i', null, 'two')));
    expect(at(0, node)).toContain('<b>one</b>'); expect(at(0, node)).not.toContain('two');
    expect(at(12, node)).not.toContain('one'); expect(at(12, node)).not.toContain('two'); expect(at(15, node)).toContain('<i>two</i>');
    expect(() => at(0, createElement(Series, null, createElement(Series.Sequence, { durationInFrames: 0 })))).toThrow(/durationInFrames/);
  });

  it('fills the frame, and passes styles through', () => {
    expect(at(0, createElement(AbsoluteFill, { style: { background: 'red' } }))).toMatch(/position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;background:red/);
  });

  it('interpolates with easing functions, springs settle, and random repeats', () => {
    expect(interpolate(15, [0, 30], [0, 1])).toBe(0.5);
    expect(interpolate(15, [0, 30], [0, 1], { easing: Easing.out(Easing.quad) })).toBe(0.75);
    expect(Easing.bezier(0.25, 0.1, 0.25, 1)(0.5)).toBeGreaterThan(0.5);
    expect(spring({ frame: 0 })).toBe(0); expect(spring({ frame: 120 })).toBeCloseTo(1, 2);
    // Remotion nested config support
    expect(spring({ frame: 120, fps: 30, config: { damping: 10, stiffness: 100 } })).toBeCloseTo(1, 2);
    expect(random('a')).toBe(random('a')); expect(random('a')).not.toBe(random('b')); expect(random(1)).toBeGreaterThanOrEqual(0); expect(random(1)).toBeLessThan(1);
  });

  it('supports Remotion-compatible primitives (staticFile, Loop, Freeze, Composition, Folder, Still)', () => {
    expect(staticFile('/assets/img.png')).toBe('assets/img.png');
    expect(staticFile('assets/img.png')).toBe('assets/img.png');

    const loopNode = createElement(Loop, { durationInFrames: 10 }, createElement(Probe));
    expect(at(0, loopNode)).toContain('frame 0 of');
    expect(at(9, loopNode)).toContain('frame 9 of');
    expect(at(10, loopNode)).toContain('frame 0 of');
    expect(at(15, loopNode)).toContain('frame 5 of');

    const freezeNode = createElement(Freeze, { frame: 4 }, createElement(Probe));
    expect(at(0, freezeNode)).toContain('frame 4 of');
    expect(at(50, freezeNode)).toContain('frame 4 of');

    const dummyComp = () => createElement('div', null, 'Hi');
    const compNode = createElement(Composition, { id: 'TestComp', component: dummyComp, durationInFrames: 60, fps: 30, width: 1920, height: 1080 });
    expect(at(0, compNode)).toBe('');

    const folderNode = createElement(Folder, { name: 'Main' }, createElement('span', null, 'Inside Folder'));
    expect(at(0, folderNode)).toContain('Inside Folder');

    const stillNode = createElement(Still, { id: 'StillComp', component: dummyComp, fps: 30, width: 1920, height: 1080 });
    expect(at(0, stillNode)).toBe('');
  });

  it('calculates spring values and stagger delays cleanly', () => {
    expect(springValue({ frame: 0 })).toBe(0);
    expect(springValue({ frame: 120 })).toBeCloseTo(1, 2);
    expect(springValue({ frame: 0, delay: 10 })).toBe(0);
    expect(springValue({ frame: 5, delay: 10 })).toBe(0);
    expect(springValue({ frame: 40, delay: 10, preset: 'snappy' })).toBeGreaterThan(0.5);
    expect(stagger(0, 4, 10)).toBe(10);
    expect(stagger(3, 4, 10)).toBe(22);
  });

  it('renders modern motion components to markup', () => {
    const card = at(15, createElement(GlassCard, null, 'Content'));
    expect(card).toContain('backdrop-filter:blur(24px)');
    expect(card).toContain('Content');

    const kinetic = at(20, createElement(KineticText, { text: 'Hello World' }));
    expect(kinetic).toContain('Hello');
    expect(kinetic).toContain('World');

    const ticker = at(30, createElement(NumberTicker, { value: 500, prefix: '$', suffix: '/mo' }));
    expect(ticker).toContain('$');
    expect(ticker).toContain('/mo');

    const badge = at(10, createElement(Badge, null, 'Active'));
    expect(badge).toContain('Active');

    const device = at(15, createElement(DeviceFrame, { title: 'Test Window' }, createElement('div', null, 'Inside')));
    expect(device).toContain('Test Window');
    expect(device).toContain('Inside');

    const progress = at(20, createElement(ProgressBar, { value: 0.8 }));
    expect(progress).toContain('box-shadow');

    const glow = at(10, createElement(AmbientGlow));
    expect(glow).toContain('radial-gradient');

    const bento = at(15, createElement(BentoGrid, { columns: 3 },
      createElement(BentoCard, { title: 'Card 1', subtitle: 'Sub 1', colSpan: 2 }, 'Inner 1'),
      createElement(BentoCard, { title: 'Card 2' }, 'Inner 2'),
    ));
    expect(bento).toContain('display:grid');
    expect(bento).toContain('grid-column:span 2 / span 2');
    expect(bento).toContain('Card 1');
    expect(bento).toContain('Sub 1');

    const typewriter = at(20, createElement(Typewriter, { text: 'AI Agent Video' }));
    expect(typewriter).toContain('AI Agent');

    const wave = at(15, createElement(Waveform, { bars: 12 }));
    expect(wave).toContain('linear-gradient');

    const code = at(20, createElement(CodeEditor, { filename: 'index.ts', code: 'const x = 42;\nconsole.log(x);', highlightLines: [1] }));
    expect(code).toContain('index.ts');
    expect(code).toContain('const x = 42;');
  });

  it('is refused in compositions the AI layer writes or accepts', () => {
    const composition = loadComposition({ version: '1.0', id: 'x', name: 'X', width: 640, height: 360, fps: 30, durationFrames: 30,
      scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'ui', type: 'react', src: 'ui.bundle.js', width: 640, height: 360, durationInFrames: 30 }] }] });
    expect(assetProblems(composition, { assets: new Map() }).join('\n')).toMatch(/Layer "ui" is a React layer; AI-written and pasted compositions cannot contain code/);
  });
});
