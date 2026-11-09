import { describe, expect, it } from 'vitest';
import { Tokenizer } from '../../packages/ai/src/indic-tts/tokenizer';
import { chunkText, encodeWav, readableText } from '../../packages/ai/src/indic-tts/synthesis';
import { istft } from '../../packages/ai/src/indic-tts/istft';
import { indicLanguageFor, indicLanguages, ttsCacheDir } from '../../packages/ai/src/indic-tts/models';
import { findLatinSpans, normalizeForChars, verbalizeDigits } from '../../packages/ai/src/indic-tts/textnorm';
import { indicLanguageForRequest } from '../../packages/ai/src/indic-tts/engine';
import { createProvider, resolveSpeechEngine, type ProviderConfig } from '../../packages/ai/src/providers';

// The frontend of the released Indic models, ported to TypeScript so a local voice needs no Python. These tests pin the
// pieces that decide what the model reads and when each word is spoken; the audio itself is checked against the model
// by its own Python runtime, not here.

/** A vocabulary shaped like the released models': every Devanagari character plus the punctuation they train on. */
const devanagari = Array.from({ length: 0x98 }, (_, i) => String.fromCharCode(0x0900 + i));
const vocab = {
  symbols: ['<blank>', '<unk>', 'c: ', ...[...devanagari, ...'!।,.?-'].map(char => `c:${char}`)],
  add_blank: true,
  mode: 'chr',
};

describe('Tokenizer', () => {
  it('interleaves blanks between characters, the way Matcha was trained', () => {
    const tokenizer = new Tokenizer(vocab);
    expect(tokenizer.encode('नम')).toEqual([0, tokenizer.ids.get('c:न'), 0, tokenizer.ids.get('c:म'), 0]);
    expect(tokenizer.encode('')).toEqual([0]);
  });

  it('reads characters the vocabulary holds and refuses a phoneme model', () => {
    const tokenizer = new Tokenizer(vocab);
    expect(tokenizer.knows('क')).toBe(true);
    expect(tokenizer.knows(' ')).toBe(true);
    expect(tokenizer.knows('z')).toBe(false);
    expect(() => new Tokenizer({ ...vocab, mode: 'ipa' })).toThrow(/phonemes/);
    expect(() => new Tokenizer({ symbols: [] })).toThrow(/vocabulary/);
  });

  it('drops the blank convention when the config says so', () => {
    const tokenizer = new Tokenizer({ ...vocab, add_blank: false });
    expect(tokenizer.encode('क')).toEqual([tokenizer.ids.get('c:क')]);
  });
});

describe('Hindi normalization', () => {
  const read = (text: string) => normalizeForChars(text, 'hi').text;

  it('collapses whitespace and removes invisible format characters', () => {
    expect(read('  नमस्ते\u200d \n दुनिया\u200c\u200b ')).toBe('नमस्ते दुनिया');
  });

  it('spells numbers the way a Hindi reader says them', () => {
    expect(read('2026')).toBe('दो हज़ार छब्बीस');
    expect(read('1998')).toBe('उन्नीस सौ अट्ठानवे');
    expect(read('2,50,000')).toBe('दो लाख पचास हज़ार');
    expect(read('1,234,567')).toBe('बारह लाख चौंतीस हज़ार पाँच सौ सरसठ');
    expect(read('₹2,50,000')).toBe('दो लाख पचास हज़ार रुपये');
    expect(read('12%')).toBe('बारह प्रतिशत');
    expect(read('3.75')).toBe('तीन दशमलव सात पाँच');
    expect(read('007')).toBe('शून्य शून्य सात');
    expect(read('1,2,3')).toBe('एक,दो,तीन');
  });

  it('leaves times, dates and ratios unread rather than guessing', () => {
    const time = normalizeForChars('10:30 बजे', 'hi');
    expect(time.text).toBe('10:30 बजे');
    expect(time.flags).toContain('numeric_unsupported');
    expect(normalizeForChars('15/08/2024', 'hi').text).toBe('15/08/2024');
  });

  it('drops bracketed English glosses but keeps the Hindi around them', () => {
    expect(read('मेरा नाम (My Name) है')).toBe('मेरा नाम है');
    expect(read('यह [noise] शोर है')).toBe('यह शोर है');
  });

  it('reads a Latin I attached to a Devanagari word as a sentence stop', () => {
    expect(read('क्या बात हैI')).toBe('क्या बात है।');
    expect(read('युद्ध I में')).toBe('युद्ध I में');
  });

  it('repairs a nukta typed after the vowel sign and joins split vowels', () => {
    expect(read('बडे़')).toBe('बड़े');
    expect(read('मेेरे')).toBe('मेरे');
    expect(normalizeForChars('नहीे', 'hi').text).toBe('नही');
  });

  it('reports the Latin words it cannot read, and flags digits for languages without number rules', () => {
    expect(findLatinSpans('यह New Delhi में है')).toEqual(['New Delhi']);
    expect(normalizeForChars('कोई 5 बजे', 'bn').flags).toContain('numeric_unsupported');
    expect(verbalizeDigits('कोई 5 बजे', 'bn').text).toBe('कोई 5 बजे');
  });
});

describe('what the model can read', () => {
  const tokenizer = new Tokenizer(vocab);

  it('turns unsupported punctuation into the nearest pause and drops the rest', () => {
    expect(readableText('नमस्ते: कैसे हैं…', 'hi', tokenizer)).toEqual({ text: 'नमस्ते, कैसे हैं.', dropped: [] });
    // the space around a dash stays, exactly as the model's own frontend leaves it
    expect(readableText('नमस्ते — कैसे हैं', 'hi', tokenizer).text).toBe('नमस्ते , कैसे हैं');
  });

  it('drops Latin words instead of reading them with the wrong script', () => {
    const { text, dropped } = readableText('यह New Delhi में है', 'hi', tokenizer);
    expect(text).toBe('यह में है');
    expect(dropped.sort()).toEqual(['D', 'N', 'e', 'h', 'i', 'l', 'w']);
  });

  it('splits sentences at dandas and stops, and long ones at commas', () => {
    expect(chunkText('एक वाक्य। दूसरा वाक्य!')).toEqual(['एक वाक्य।', 'दूसरा वाक्य!']);
    const long = `${'शब्द, '.repeat(80)}अंत`;
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(250);
    expect(chunks.join(' ')).toContain('अंत');
  });
});

/** Forward STFT matching what the vocoder's frames are (periodic Hann, centred by nFft/2). */
function stft(signal: Float64Array, nFft: number, hop: number) {
  const window = Float64Array.from({ length: nFft }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft));
  const frames = Math.floor((signal.length - nFft) / hop) + 1;
  const bins = nFft / 2 + 1;
  const real = new Float32Array(bins * frames), imag = new Float32Array(bins * frames);
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < bins; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < nFft; n++) {
        const sample = signal[f * hop + n]! * window[n]!, angle = (2 * Math.PI * k * n) / nFft;
        re += sample * Math.cos(angle);
        im -= sample * Math.sin(angle);
      }
      real[k * frames + f] = re;
      imag[k * frames + f] = im;
    }
  }
  return { real, imag, frames, bins };
}

describe('inverse STFT', () => {
  it('rebuilds the waveform the vocoder frames describe', () => {
    const nFft = 64, hop = 16;
    const original = Float64Array.from({ length: 512 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 8000) + 0.2 * Math.sin((2 * Math.PI * 1200 * i) / 8000));
    const { real, imag, frames, bins } = stft(original, nFft, hop);
    const rebuilt = istft(real, imag, { frames, bins, nFft, hop, padding: 'center' });
    // the half-window the encoder padded is trimmed from both ends, so rebuilt[i] is original[i + nFft/2]
    for (let i = 0; i < rebuilt.length; i++) expect(rebuilt[i]).toBeCloseTo(original[i + nFft / 2]!, 4);
  });

  it('refuses a spectrum whose windows cancel out', () => {
    expect(() => istft(new Float32Array(33 * 3), new Float32Array(33 * 3), { frames: 3, bins: 33, nFft: 64, hop: 64, padding: 'center' })).toThrow(/overlap/);
  });
});

describe('WAV output', () => {
  it('writes a 16-bit mono PCM header and clamps samples', () => {
    const wav = encodeWav([Float32Array.of(0.5, -1.5, 1)], 24000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(16384);
    expect(view.getInt16(46, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
  });
});

describe('the Indic voice registry', () => {
  it('offers the eleven released Indic languages and finds one from a locale', () => {
    expect(indicLanguages().map(language => language.code)).toEqual(['hi', 'bn', 'mr', 'gu', 'pa', 'ta', 'te', 'kn', 'ml', 'as', 'or']);
    expect(indicLanguageFor('hi-IN')?.repo).toBe('sulabhkatiyar/indic-tiny-tts-hindi');
    expect(indicLanguageFor('TA_in')?.name).toBe('Tamil');
    expect(indicLanguageFor('Hindi')?.code).toBe('hi');
    expect(indicLanguageFor('en-US')).toBeUndefined();
  });

  it('keeps models in the user cache, or wherever OVE_TTS_DIR points', () => {
    const saved = process.env.OVE_TTS_DIR;
    try {
      delete process.env.OVE_TTS_DIR;
      expect(ttsCacheDir()).toMatch(/\.cache[\\/]motionrender[\\/]tts$/);
      process.env.OVE_TTS_DIR = '/models/voices';
      expect(ttsCacheDir()).toBe('/models/voices');
    } finally {
      if (saved === undefined) delete process.env.OVE_TTS_DIR;
      else process.env.OVE_TTS_DIR = saved;
    }
  });
});

describe('the local voice in the provider seam', () => {
  const engine = (value: string) => resolveSpeechEngine({ speechEngine: value as ProviderConfig['speechEngine'] });

  it('accepts indic and its local/offline aliases, and leaves edge as the default', () => {
    expect(engine('indic')).toBe('indic');
    expect(engine('local')).toBe('indic');
    expect(engine('offline')).toBe('indic');
    expect(engine('native')).toBe('native');
    expect(engine('')).toBe('edge');
  });

  it('attaches speak and transcribe to the provider it is chosen for', () => {
    const provider = createProvider({ provider: 'mock', speechEngine: 'indic' });
    expect(provider.speechEngine).toBe('indic');
    expect(typeof provider.speak).toBe('function');
    expect(typeof provider.transcribe).toBe('function');
  });

  it('takes the language from the request, then the voice locale, else Hindi', () => {
    expect(indicLanguageForRequest({ language: 'Bengali' }).code).toBe('bn');
    expect(indicLanguageForRequest({ language: 'ta-IN' }).code).toBe('ta');
    expect(indicLanguageForRequest({ voice: 'ta-IN-ValluvarNeural' }).code).toBe('ta');
    expect(indicLanguageForRequest({}).code).toBe('hi');
    expect(() => indicLanguageForRequest({ language: 'klingon' })).toThrow(/does not speak/);
  });
});

describe('model downloads', () => {
  it('accept plain file names under onnx/ and nothing that leaves the model folder', async () => {
    const { safeModelFile } = await import('../../packages/ai/src/indic-tts/models');
    for (const good of ['onnx/text_encoder.onnx', 'vocoder.onnx', 'onnx/flow_decoder.v2.onnx']) expect(safeModelFile(good), good).toBe(true);
    for (const bad of ['../evil.onnx', 'onnx/../../evil', '/etc/passwd', 'C:\\x.onnx', 'onnx\\a.onnx', 'a/b/c.onnx', '', '.hidden', 42, undefined]) expect(safeModelFile(bad), String(bad)).toBe(false);
  });

  it('refuse a manifest that names a file outside the model folder, before fetching anything', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { ensureIndicModel } = await import('../../packages/ai/src/indic-tts/models');
    const dir = await mkdtemp(join(tmpdir(), 'ove-tts-')), saved = { dir: process.env.OVE_TTS_DIR, fetch: globalThis.fetch }, asked: string[] = [];
    process.env.OVE_TTS_DIR = dir;
    globalThis.fetch = (async (url: string) => {
      asked.push(String(url));
      if (String(url).endsWith('onnx_manifest.json')) return new Response(JSON.stringify({ format: 'indic-tiny-tts-onnx/1', graphs: { text_encoder: { file: '../../outside.onnx', sha256: 'x', bytes: 1 } } }));
      return new Response('{}');
    }) as typeof fetch;
    try {
      await expect(ensureIndicModel('hi')).rejects.toThrow(/outside the model folder/);
      expect(asked.some(url => url.includes('outside'))).toBe(false);
    } finally {
      globalThis.fetch = saved.fetch;
      if (saved.dir === undefined) delete process.env.OVE_TTS_DIR; else process.env.OVE_TTS_DIR = saved.dir;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('spoken explainer lines', () => {
  it('leave a script language label like "Hinglish" out of the on-device voice request, but pass a real one', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { speakLine } = await import('../../packages/ai/src/explainer');
    const dir = await mkdtemp(join(tmpdir(), 'ove-say-')), asked: (string | undefined)[] = [];
    const provider = { speechEngine: 'indic', speak: async (_text: string, options: { language?: string }) => { asked.push(options.language); return { data: encodeWav([new Float32Array(2400)], 24000), extension: 'wav' }; } } as unknown as Parameters<typeof speakLine>[3];
    try {
      await speakLine('नमस्ते', undefined, join(dir, 'a.wav'), provider, 'Hinglish (Hindi in Latin letters)');
      await speakLine('নমস্কার', undefined, join(dir, 'b.wav'), provider, 'Bengali');
      await speakLine('नमस्ते', undefined, join(dir, 'c.wav'), provider, undefined);
      expect(asked).toEqual([undefined, 'Bengali', undefined]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
