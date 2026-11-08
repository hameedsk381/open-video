import { describe, expect, it } from 'vitest';
import { brandForCompose, emptyBrandKit, kitIsSet, logoFile, readBrandKit } from '../../apps/studio/src/brandKit';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('brand kit', () => {
  it('keeps only values a video can print', () => {
    const kit = readBrandKit({
      name: '  Ember & Oak  ',
      colors: { primary: '#E4572E', secondary: 'burnt orange', accent: '#f4a261ff', background: '#1b1410', text: '#f7f1e8' },
      fonts: { heading: 'Fraunces', body: 'Inter' },
      contact: 'hello@emberandoak.com\n 555-0100 ',
      logo: png,
      logoOnEndCard: false,
      enabled: true,
    });
    expect(kit).not.toBeNull();
    expect(kit!.name).toBe('Ember & Oak');
    // Short hex is kept; a name and an eight-digit hex are not colours the renderer takes.
    expect(kit!.colors).toEqual({ primary: '#e4572e', background: '#1b1410', text: '#f7f1e8' });
    expect(kit!.fonts).toEqual({ heading: 'Fraunces', body: 'Inter' });
    expect(kit!.contact).toBe('hello@emberandoak.com · 555-0100');
    expect(kit!.logo).toBe(png);
    expect(kit!.logoOnEndCard).toBe(false);
    expect(kit!.enabled).toBe(true);
  });

  it('refuses an empty kit and a logo that is not a small image', () => {
    expect(readBrandKit({})).toBeNull();
    expect(readBrandKit({ colors: { primary: 'red' } })).toBeNull();
    expect(readBrandKit({ logo: 'data:text/html;base64,PHNjcmlwdD4=' })).toBeNull();
    expect(readBrandKit({ logo: 'data:image/png;base64,' + 'A'.repeat(3_000_000) })).toBeNull();
  });

  it('sends the brand a compose job reads, without empty fields', () => {
    const kit = readBrandKit({ name: 'Ember & Oak', colors: { primary: '#e4572e' }, fonts: { heading: 'Fraunces' }, contact: 'emberandoak.com', style: 'warm, handmade' });
    expect(brandForCompose(kit)).toEqual({
      name: 'Ember & Oak',
      colors: { primary: '#e4572e' },
      fonts: { heading: 'Fraunces' },
      contact: 'emberandoak.com',
      style: 'warm, handmade',
    });
    expect(kitIsSet(kit)).toBe(true);
    expect(brandForCompose(emptyBrandKit())).toBeUndefined();
  });

  it('turns the stored logo into a file named for its asset id', async () => {
    const kit = readBrandKit({ name: 'Ember & Oak', logo: png });
    const file = logoFile(kit);
    expect(file?.name).toBe('brand-logo.png');
    expect(file?.type).toBe('image/png');
    const bytes = new Uint8Array(await file!.arrayBuffer());
    expect(bytes.slice(0, 8)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});
