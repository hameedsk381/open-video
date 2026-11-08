import { describe, expect, it } from 'vitest';
import { addBrandContact, addBrandLogo, brandContactLayer, brandLogoLayer } from '../../packages/jobs/src/brand-logo';

const reel = () => ({ width: 1080, height: 1920, fps: 30, scenes: [
  { id: 'hook', durationFrames: 90, layers: [] },
  { id: 'close', durationFrames: 60, layers: [{ id: 'headline', type: 'text' }] },
] });

describe('brand logo', () => {
  it('signs the closing scene, clear of the reel UI bands', () => {
    const composition = reel();
    const source = { scenes: [{ id: 'hook', layers: [] }, { id: 'close', layers: [{ id: 'headline', type: 'text' }] }] };
    expect(addBrandLogo(composition, source, './assets/brand-logo.png')).toBe(true);
    const close = composition.scenes[1]!;
    const logo = close.layers!.find(layer => layer.id === 'brand-logo') as any;
    // The bottom 18% of a reel is covered by the app's controls, and the right 11% by its action buttons.
    expect(logo.y as number).toBeLessThan(1920 * 0.82);
    expect(logo.x as number).toBeLessThan(1080 * 0.89);
    expect(logo.y as number + (logo.height as number)).toBeLessThan(1920 * 0.82);
    expect(logo.animations[0].keyframes[0]).toEqual({ frame: 0, value: 0 });
    // The saved source carries the same layer, so an edit or re-resolve does not drop it.
    expect(source.scenes[1]!.layers.some(layer => layer.id === 'brand-logo')).toBe(true);
  });

  it('leaves a landscape video in the corner with no bands to avoid', () => {
    const composition = { width: 1920, height: 1080, fps: 30, scenes: [{ id: 'end', durationFrames: 90, layers: [] }] };
    const layer = brandLogoLayer(composition, composition.scenes[0]!, './assets/brand-logo.png');
    expect(layer.x as number + (layer.width as number)).toBeLessThan(1920);
    expect(layer.y as number + (layer.height as number)).toBeLessThan(1080);
  });

  it('signs the last real scene, not the overlay scene, and never twice', () => {
    const composition = { width: 1080, height: 1080, fps: 30, scenes: [
      { id: 'a', durationFrames: 60, layers: [] },
      { id: 'overlay', durationFrames: 60, layers: [] },
    ] };
    expect(addBrandLogo(composition, undefined, './assets/brand-logo.png')).toBe(true);
    expect(composition.scenes[0]!.layers!).toHaveLength(1);
    expect(composition.scenes[1]!.layers!).toHaveLength(0);
    expect(addBrandLogo(composition, undefined, './assets/brand-logo.png')).toBe(false);
    expect(composition.scenes[0]!.layers!).toHaveLength(1);
  });

  it('prints the contact line on the logo row, in the design\'s own muted colour and body font', () => {
    const composition: any = { width: 1080, height: 1920, fps: 30, variables: { muted: { default: '#6b5a4a' }, text: { default: '#111111' }, fontBody: { default: 'DM Sans' } }, scenes: [
      { id: 'a', durationFrames: 60, layers: [] },
      { id: 'close', durationFrames: 60, layers: [] },
      { id: 'overlay', durationFrames: 60, layers: [] },
    ] };
    const source = { scenes: [{ id: 'close', layers: [] }, { id: 'overlay', layers: [] }] };
    addBrandLogo(composition, source, './assets/brand-logo.png');
    expect(addBrandContact(composition, source, ' hello@brewline.co · brewline.co ')).toBe(true);
    const logo = composition.scenes[1]!.layers!.find((layer: any) => layer.id === 'brand-logo');
    const contact = composition.scenes[1]!.layers!.find((layer: any) => layer.id === 'brand-contact');
    expect(contact).toMatchObject({ type: 'text', content: 'hello@brewline.co · brewline.co', textAlign: 'right', color: '#6b5a4a', fontFamily: 'DM Sans' });
    // Right-aligned against the logo, same bottom line, and still above the app's controls.
    expect(contact.x).toBeLessThan(logo.x);
    expect(contact.y + Math.round(contact.fontSize * contact.lineHeight)).toBeLessThanOrEqual(logo.y + logo.height);
    expect(contact.y + Math.round(contact.fontSize * contact.lineHeight)).toBeLessThan(1920 * 0.82);
    expect(composition.scenes[2]!.layers!).toHaveLength(0);
    expect(source.scenes[0]!.layers!.some(layer => (layer as any).id === 'brand-contact')).toBe(true);
    expect(addBrandContact(composition, source, 'hello@brewline.co')).toBe(false);
  });

  it('keeps the contact line on the canvas when the logo is switched off', () => {
    const composition: any = { width: 1920, height: 1080, fps: 30, scenes: [{ id: 'end', durationFrames: 90, layers: [] }] };
    const layer = brandContactLayer(composition, composition.scenes[0]!, 'brewline.co');
    expect(layer.textAlign).toBe('right');
    expect(layer.fontFamily).toBe('Inter');
    expect(layer.color).toBe('#ffffff');
    expect(layer.x as number).toBeLessThan(1920);
    expect((layer.y as number) + (layer.fontSize as number) * (layer.lineHeight as number)).toBeLessThan(1080);
  });
});
