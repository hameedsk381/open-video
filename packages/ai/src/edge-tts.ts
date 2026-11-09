import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ffmpegPath } from '@ove/ffmpeg';
import type { AiProvider, Transcript, TranscriptWord } from './providers';

export type VoiceInfo = { id: string; name: string; gender: 'Female' | 'Male'; locale: string; lang: string };

export const POPULAR_LANGUAGES: { code: string; label: string; defaultVoice: string }[] = [
  { code: 'en-US', label: 'English (US)', defaultVoice: 'en-US-AvaNeural' },
  { code: 'en-GB', label: 'English (UK)', defaultVoice: 'en-GB-RyanNeural' },
  { code: 'en-IN', label: 'English (India)', defaultVoice: 'en-IN-NeerjaNeural' },
  { code: 'es-ES', label: 'Spanish (Spain)', defaultVoice: 'es-ES-AlvaroNeural' },
  { code: 'es-MX', label: 'Spanish (Mexico)', defaultVoice: 'es-MX-DaliaNeural' },
  { code: 'fr-FR', label: 'French', defaultVoice: 'fr-FR-DeniseNeural' },
  { code: 'de-DE', label: 'German', defaultVoice: 'de-DE-ConradNeural' },
  { code: 'hi-IN', label: 'Hindi', defaultVoice: 'hi-IN-SwaraNeural' },
  { code: 'ja-JP', label: 'Japanese', defaultVoice: 'ja-JP-NanamiNeural' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)', defaultVoice: 'zh-CN-XiaoxiaoNeural' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', defaultVoice: 'pt-BR-FranciscaNeural' },
  { code: 'it-IT', label: 'Italian', defaultVoice: 'it-IT-ElsaNeural' },
  { code: 'ar-SA', label: 'Arabic', defaultVoice: 'ar-SA-ZariyahNeural' },
];

export const POPULAR_VOICES: Record<string, VoiceInfo[]> = {
  'en-US': [
    { id: 'en-US-AvaNeural', name: 'Ava (Expressive, Natural)', gender: 'Female', locale: 'en-US', lang: 'English (US)' },
    { id: 'en-US-AndrewNeural', name: 'Andrew (Warm, Professional)', gender: 'Male', locale: 'en-US', lang: 'English (US)' },
    { id: 'en-US-JennyNeural', name: 'Jenny (Conversational)', gender: 'Female', locale: 'en-US', lang: 'English (US)' },
    { id: 'en-US-GuyNeural', name: 'Guy (Clear, Confident)', gender: 'Male', locale: 'en-US', lang: 'English (US)' },
    { id: 'en-US-EmmaNeural', name: 'Emma (Bright, Engaging)', gender: 'Female', locale: 'en-US', lang: 'English (US)' },
    { id: 'en-US-BrianNeural', name: 'Brian (Deep, Authoritative)', gender: 'Male', locale: 'en-US', lang: 'English (US)' },
  ],
  'en-GB': [
    { id: 'en-GB-RyanNeural', name: 'Ryan (British, Dynamic)', gender: 'Male', locale: 'en-GB', lang: 'English (UK)' },
    { id: 'en-GB-SoniaNeural', name: 'Sonia (British, Warm)', gender: 'Female', locale: 'en-GB', lang: 'English (UK)' },
  ],
  'en-IN': [
    { id: 'en-IN-NeerjaNeural', name: 'Neerja (Indian English, Professional)', gender: 'Female', locale: 'en-IN', lang: 'English (India)' },
    { id: 'en-IN-PrabhatNeural', name: 'Prabhat (Indian English, Clear)', gender: 'Male', locale: 'en-IN', lang: 'English (India)' },
  ],
  'es-ES': [
    { id: 'es-ES-AlvaroNeural', name: 'Alvaro (Spanish, Confident)', gender: 'Male', locale: 'es-ES', lang: 'Spanish (Spain)' },
    { id: 'es-ES-ElviraNeural', name: 'Elvira (Spanish, Melodic)', gender: 'Female', locale: 'es-ES', lang: 'Spanish (Spain)' },
  ],
  'es-MX': [
    { id: 'es-MX-DaliaNeural', name: 'Dalia (Mexican Spanish, Warm)', gender: 'Female', locale: 'es-MX', lang: 'Spanish (Mexico)' },
    { id: 'es-MX-JorgeNeural', name: 'Jorge (Mexican Spanish, Energetic)', gender: 'Male', locale: 'es-MX', lang: 'Spanish (Mexico)' },
  ],
  'fr-FR': [
    { id: 'fr-FR-DeniseNeural', name: 'Denise (French, Elegant)', gender: 'Female', locale: 'fr-FR', lang: 'French' },
    { id: 'fr-FR-HenriNeural', name: 'Henri (French, Classic)', gender: 'Male', locale: 'fr-FR', lang: 'French' },
  ],
  'de-DE': [
    { id: 'de-DE-ConradNeural', name: 'Conrad (German, Authoritative)', gender: 'Male', locale: 'de-DE', lang: 'German' },
    { id: 'de-DE-KatjaNeural', name: 'Katja (German, Professional)', gender: 'Female', locale: 'de-DE', lang: 'German' },
  ],
  'hi-IN': [
    { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi, Clear & Warm)', gender: 'Female', locale: 'hi-IN', lang: 'Hindi' },
    { id: 'hi-IN-MadhurNeural', name: 'Madhur (Hindi, Deep)', gender: 'Male', locale: 'hi-IN', lang: 'Hindi' },
  ],
  'ja-JP': [
    { id: 'ja-JP-NanamiNeural', name: 'Nanami (Japanese, Cheerful)', gender: 'Female', locale: 'ja-JP', lang: 'Japanese' },
    { id: 'ja-JP-KeitaNeural', name: 'Keita (Japanese, Natural)', gender: 'Male', locale: 'ja-JP', lang: 'Japanese' },
  ],
  'zh-CN': [
    { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (Mandarin, Expressive)', gender: 'Female', locale: 'zh-CN', lang: 'Chinese' },
    { id: 'zh-CN-YunjianNeural', name: 'Yunjian (Mandarin, Narration)', gender: 'Male', locale: 'zh-CN', lang: 'Chinese' },
  ],
  'pt-BR': [
    { id: 'pt-BR-FranciscaNeural', name: 'Francisca (Brazilian, Natural)', gender: 'Female', locale: 'pt-BR', lang: 'Portuguese' },
    { id: 'pt-BR-AntonioNeural', name: 'Antonio (Brazilian, Clear)', gender: 'Male', locale: 'pt-BR', lang: 'Portuguese' },
  ],
  'it-IT': [
    { id: 'it-IT-ElsaNeural', name: 'Elsa (Italian, Lively)', gender: 'Female', locale: 'it-IT', lang: 'Italian' },
    { id: 'it-IT-DiegoNeural', name: 'Diego (Italian, Warm)', gender: 'Male', locale: 'it-IT', lang: 'Italian' },
  ],
  'ar-SA': [
    { id: 'ar-SA-ZariyahNeural', name: 'Zariyah (Arabic, Poetic)', gender: 'Female', locale: 'ar-SA', lang: 'Arabic' },
    { id: 'ar-SA-HamedNeural', name: 'Hamed (Arabic, Clear)', gender: 'Male', locale: 'ar-SA', lang: 'Arabic' },
  ],
};

export function resolveEdgeVoice(voice?: string, language?: string): string {
  if (!voice && !language) return 'en-US-AvaNeural';
  if (voice) {
    const v = voice.toLowerCase().trim();
    if (v.includes('neural')) return voice.trim();
    if (v === 'ava') return 'en-US-AvaNeural';
    if (v === 'andrew') return 'en-US-AndrewNeural';
    if (v === 'jenny' || v === 'hannah') return 'en-US-JennyNeural';
    if (v === 'guy' || v === 'austin' || v === 'troy') return 'en-US-GuyNeural';
    if (v === 'emma') return 'en-US-EmmaNeural';
    if (v === 'brian') return 'en-US-BrianNeural';
    if (v === 'ryan') return 'en-GB-RyanNeural';
    if (v === 'sonia') return 'en-GB-SoniaNeural';
    if (v === 'neerja') return 'en-IN-NeerjaNeural';
    if (v === 'prabhat') return 'en-IN-PrabhatNeural';
    if (v === 'swara') return 'hi-IN-SwaraNeural';
    if (v === 'madhur') return 'hi-IN-MadhurNeural';
    if (v === 'alvaro') return 'es-ES-AlvaroNeural';
    if (v === 'elvira') return 'es-ES-ElviraNeural';
    if (v === 'denise') return 'fr-FR-DeniseNeural';
    if (v === 'conrad') return 'de-DE-ConradNeural';
    if (v === 'nanami') return 'ja-JP-NanamiNeural';
    if (v === 'xiaoxiao') return 'zh-CN-XiaoxiaoNeural';
  }
  if (language) {
    const l = language.toLowerCase().trim();
    const match = POPULAR_LANGUAGES.find(lang => lang.code.toLowerCase() === l || lang.code.toLowerCase().startsWith(l) || lang.label.toLowerCase().includes(l));
    if (match) return match.defaultVoice;
  }
  return 'en-US-AvaNeural';
}

export type EdgeSpeechResult = {
  data: Uint8Array;
  extension: 'wav' | 'mp3';
  transcript: Transcript;
};

// In-memory transcript cache keyed on the audio bytes, so a synthesized line never needs a second transcription
export const edgeTranscriptCache = new Map<string, Transcript>();

/** The cache key: the audio itself. Byte length alone collides between different lines that happen to be the same size. */
export const audioCacheKey = (audio: Uint8Array): string => crypto.createHash('sha256').update(audio).digest('hex').slice(0, 32);

// Sec-MS-GEC v2 algorithm for Microsoft Edge TTS WebSocket authentication
const EDGE_COPYRIGHT = 'Copyright (C) Microsoft Corporation. All rights reserved.';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SWAP_FIRST_WORD = { swappedWord: 0xef0569fb, swappedSum: 0x76f50f34, swappedProduct: 0xc3efea97 };
const SWAP_SECOND_WORD = { swappedWord: 0xc31713db, swappedSum: 0x1881ce3c, swappedProduct: 0x35bd1ec9 };
const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];

function swapHalves(value: number): number {
  return ((value << 16) | (value >>> 16)) >>> 0;
}

function swapTerm(word: number, key: number, multipliers: { swappedWord: number; swappedSum: number; swappedProduct: number }): number {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), multipliers.swappedWord);
  const product = Math.imul(swapHalves(sum), multipliers.swappedSum) >>> 0;
  return (Math.imul(swapHalves(product), multipliers.swappedProduct) + product) >>> 0;
}

function swapAndMultiply(value: number, multipliers: number[]): number {
  for (const multiplier of multipliers) {
    value = Math.imul(swapHalves(value), multiplier) >>> 0;
  }
  return value;
}

function cs64(message: Uint8Array, digest: Uint8Array): Uint8Array {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
  const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;
  const padded = new Uint8Array(Math.ceil(message.length / 8) * 8);
  padded.set(message);
  const words = new DataView(padded.buffer);
  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;
  for (let offset = 0; offset < padded.length; offset += 8) {
    const firstWord = words.getUint32(offset, true);
    const secondWord = words.getUint32(offset + 4, true);
    const firstSwap = swapTerm(firstWord, firstKey, SWAP_FIRST_WORD);
    lastSwap = swapTerm(secondWord, secondKey, SWAP_SECOND_WORD);
    swapSum = (swapSum + firstSwap + lastSwap) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + firstWord, firstKey), MIX_FIRST_WORD);
    mixSum = (mixSum + mix) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + secondWord, secondKey), MIX_SECOND_WORD);
    mixSum = (mixSum + mix) >>> 0;
  }
  const checksum = new Uint8Array(8);
  const checksumView = new DataView(checksum.buffer);
  checksumView.setUint32(0, lastSwap ^ mix, true);
  checksumView.setUint32(4, swapSum ^ mixSum, true);
  return checksum;
}

function toUpperHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function hashSecMsGecV2(ticksAndToken: string): Promise<string> {
  const message = new TextEncoder().encode(EDGE_COPYRIGHT + ticksAndToken);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', message));
  return `${toUpperHex(cs64(message, digest))}-${toUpperHex(digest)}`;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/** MP3 in, 24 kHz mono WAV out. Streamed rather than spawnSync'd: a synchronous convert holds the worker's event loop
 *  for the whole line and dies on anything longer than the buffer cap. */
function toWav(mp3: Buffer): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-f', 'wav',
      '-ac', '1',
      '-ar', '24000',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let bytes = 0;
    child.stdout.on('data', (chunk: Buffer) => { chunks.push(chunk); bytes += chunk.byteLength; });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && bytes > 0) resolve(Buffer.concat(chunks, bytes));
      else reject(new Error(`FFmpeg could not convert the speech to WAV (exit ${code})`));
    });
    child.stdin.on('error', () => { /* the child closing first is not our failure; its exit code decides */ });
    child.stdin.end(mp3);
  });
}

type EdgeSpeechOptions = { voice?: string; language?: string; /** Speaking speed as a percentage change: -30 is slower, +25 is faster (default 0). */ rate?: number; signal?: AbortSignal };

/**
 * Speech from the Edge voice service. The service sometimes drops a connection, so a failed attempt is made twice more (after a short wait)
 * before giving up, and the failure says what it was instead of an unreadable event object.
 */
export async function synthesizeEdgeSpeech(text: string, options: EdgeSpeechOptions = {}): Promise<EdgeSpeechResult> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await synthesizeEdgeSpeechOnce(text, options); } catch (error) {
      last = error;
      if (options.signal?.aborted) throw error;
      if (attempt < 3) await new Promise(done => setTimeout(done, 700 * attempt));
    }
  }
  throw last instanceof Error ? last : new Error('Could not reach the Edge voice service after three tries. Check the internet connection and try again, or use another speech engine.');
}

async function synthesizeEdgeSpeechOnce(text: string, options: EdgeSpeechOptions): Promise<EdgeSpeechResult> {
  const voice = resolveEdgeVoice(options.voice, options.language);
  const locale = voice.split('-').slice(0, 2).join('-') || 'en-US';

  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  const secMsGec = await hashSecMsGecV2(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`);
  const connectionId = generateUUID();
  const synthUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=${connectionId}`;

  // Native Node 22 WebSocket with Edge extension headers
  const ws = new (globalThis.WebSocket as any)(synthUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    },
  });
  ws.binaryType = 'arraybuffer';

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Edge TTS connection timed out')), 12000);
    const onAbort = () => {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(options.signal?.reason ?? new Error('Edge TTS speech synthesis cancelled'));
    };
    if (options.signal?.aborted) return onAbort();
    options.signal?.addEventListener('abort', onAbort, { once: true });

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Could not reach the Edge voice service (the connection failed)'));
    };
  });

  const speechConfig = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`;
  ws.send(speechConfig);

  const reqId = generateUUID();
  const percent = Math.max(-50, Math.min(100, Math.round(options.rate ?? 0))), rateText = `${percent >= 0 ? '+' : ''}${percent}%`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}"><voice name="${voice}"><prosody pitch="+0Hz" rate="${rateText}" volume="+0%">${escapeXml(text)}</prosody></voice></speak>`;
  const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
  ws.send(ssmlMsg);

  const audioBuffers: Buffer[] = [];
  const words: TranscriptWord[] = [];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('Edge TTS speech synthesis timed out'));
    }, 45000);

    const onAbort = () => {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(options.signal?.reason ?? new Error('Edge TTS speech synthesis cancelled'));
    };
    if (options.signal?.aborted) return onAbort();
    options.signal?.addEventListener('abort', onAbort, { once: true });

    ws.onmessage = (event: any) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve();
          return;
        }
        if (data.includes('Path:audio.metadata')) {
          const delim = '\r\n\r\n';
          const idx = data.indexOf(delim);
          if (idx !== -1) {
            try {
              const meta = JSON.parse(data.slice(idx + delim.length));
              for (const item of meta.Metadata ?? []) {
                if (item.Type === 'WordBoundary') {
                  const wordText = item.Data.text.Text;
                  const start = item.Data.Offset / 10_000_000;
                  const end = (item.Data.Offset + item.Data.Duration) / 10_000_000;
                  words.push({ text: wordText, start, end });
                }
              }
            } catch {}
          }
        }
      } else {
        const buf = Buffer.from(data as ArrayBuffer);
        const headerEnd = buf.indexOf('\r\n\r\n');
        const headerStr = headerEnd !== -1 ? buf.subarray(0, headerEnd).toString() : buf.toString();

        if (headerStr.includes('Path:turn.end')) {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve();
          return;
        }

        const audioDelim = 'Path:audio\r\n';
        const delimIdx = buf.indexOf(audioDelim);
        if (delimIdx !== -1) {
          const audioChunk = buf.subarray(delimIdx + audioDelim.length);
          audioBuffers.push(audioChunk);
        }
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(new Error('The Edge voice service dropped the connection while speaking'));
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      resolve();
    };
  });

  const mp3 = Buffer.concat(audioBuffers);

  // Edge answers with MP3; the mixer and scene-by-scene voiceover both want a plain WAV container.
  const wav = await toWav(mp3).catch(() => undefined);
  const data = wav ?? mp3;
  const extension: 'wav' | 'mp3' = wav ? 'wav' : 'mp3';

  const transcript: Transcript = {
    text,
    words,
    cues: words.map(w => ({ text: w.text, start: w.start, end: w.end })),
  };

  edgeTranscriptCache.set(audioCacheKey(data), transcript);

  return {
    data,
    extension,
    transcript,
  };
}

/**
 * Attaches Edge TTS as the speech and word-boundary transcription engine for any AiProvider. Audio it did not make
 * (a recording someone supplies) is still transcribed by the provider's own transcription, when it has one.
 */
export function attachEdgeAudio(provider: AiProvider): AiProvider {
  const prevTranscribe = provider.transcribe;

  provider.speak = async (text: string, options: { voice?: string; language?: string; rate?: number; signal?: AbortSignal } = {}) => {
    const res = await synthesizeEdgeSpeech(text, options);
    return { data: res.data, extension: res.extension };
  };

  provider.transcribe = async (audio: Uint8Array, filename: string, options: { language?: string; signal?: AbortSignal } = {}) => {
    const cached = edgeTranscriptCache.get(audioCacheKey(audio));
    if (cached && cached.words.length > 0) {
      return cached;
    }
    if (prevTranscribe) {
      return prevTranscribe.call(provider, audio, filename, options);
    }
    return { text: '', words: [], cues: [] };
  };

  return provider;
}
