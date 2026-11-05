import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { spawnSync } from 'node:child_process';
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
  extension: 'wav';
  transcript: Transcript;
};

// In-memory transcript cache by audio byte length and word count to avoid redundant transcription
export const edgeTranscriptCache = new Map<string, Transcript>();

export async function synthesizeEdgeSpeech(
  text: string,
  options: { voice?: string; language?: string; signal?: AbortSignal } = {}
): Promise<EdgeSpeechResult> {
  const voice = resolveEdgeVoice(options.voice, options.language);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
  });

  const { audioStream, metadataStream } = tts.toStream(text);
  const audioChunks: Buffer[] = [];
  const words: TranscriptWord[] = [];

  audioStream.on('data', chunk => audioChunks.push(chunk));

  if (metadataStream) {
    metadataStream.on('data', chunk => {
      try {
        const json = JSON.parse(chunk.toString());
        for (const item of json.Metadata ?? []) {
          if (item.Type === 'WordBoundary') {
            const wordText = item.Data.text.Text;
            const start = item.Data.Offset / 10_000_000;
            const end = (item.Data.Offset + item.Data.Duration) / 10_000_000;
            words.push({ text: wordText, start, end });
          }
        }
      } catch {}
    });
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      try { tts.close(); } catch {}
      reject(options.signal?.reason ?? new Error('Edge TTS speech synthesis cancelled'));
    };
    if (options.signal?.aborted) return onAbort();
    options.signal?.addEventListener('abort', onAbort, { once: true });

    audioStream.on('error', err => {
      try { tts.close(); } catch {}
      reject(err);
    });
    audioStream.on('end', () => {
      try { tts.close(); } catch {}
      resolve();
    });
  });

  const mp3 = Buffer.concat(audioChunks);

  // Convert MP3 to standard 24kHz mono WAV using FFmpeg for native OVE waveform and audio mixing compatibility
  const res = spawnSync(ffmpegPath(), [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-f', 'wav',
    '-ac', '1',
    '-ar', '24000',
    'pipe:1',
  ], {
    input: mp3,
    maxBuffer: 50 * 1024 * 1024,
  });

  const wavData = res.status === 0 && res.stdout.length > 0 ? res.stdout : mp3;
  const extension: 'wav' = 'wav';

  const transcript: Transcript = {
    text,
    words,
    cues: words.map(w => ({ text: w.text, start: w.start, end: w.end })),
  };

  const key = `${wavData.length}`;
  edgeTranscriptCache.set(key, transcript);

  return {
    data: new Uint8Array(wavData),
    extension,
    transcript,
  };
}

/**
 * Attaches Edge TTS as the primary, default speech synthesis and word-boundary transcription engine for any AiProvider.
 */
export function attachEdgeAudio(provider: AiProvider): AiProvider {
  // Allow explicit Groq override if the user sets OVE_AI_TTS_PROVIDER=groq
  if (process.env.OVE_AI_TTS_PROVIDER?.toLowerCase() === 'groq' && process.env.GROQ_API_KEY) {
    return provider;
  }

  const prevTranscribe = provider.transcribe;

  provider.speak = async (text: string, options: { voice?: string; language?: string; signal?: AbortSignal } = {}) => {
    const res = await synthesizeEdgeSpeech(text, options);
    edgeTranscriptCache.set(`${res.data.byteLength}`, res.transcript);
    return { data: res.data, extension: res.extension };
  };

  provider.transcribe = async (audio: Uint8Array, filename: string, options: { language?: string; signal?: AbortSignal } = {}) => {
    const key = `${audio.byteLength}`;
    const cached = edgeTranscriptCache.get(key);
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
