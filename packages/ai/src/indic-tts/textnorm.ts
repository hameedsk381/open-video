/**
 * A TypeScript port of the models' `textnorm` package (version 4): the character pipeline that turns typed text into
 * the exact characters the model was trained on — NFC and single spaces, invisible format characters removed, script
 * typos repaired (stray nukta, doubled vowel signs), bracketed glosses and non-speech tags dropped, Latin "I" read as
 * a danda — and numbers spelled out, Indian grouping included. Only characters the model's vocabulary holds survive
 * this step; the model reads native script, so Latin words are dropped rather than guessed at.
 */
export type NormLanguage = 'hi' | 'bn' | 'ta' | 'te' | 'ml' | 'gu' | 'pa' | 'kn' | 'mr' | 'as' | 'or';
export type NormResult = { text: string; flags: string[]; applied: string[]; latinSpans: string[] };

const ZWJ = '\u200d', ZWNJ = '\u200c';
const INVISIBLE = '\u200b\ufeff\u2060\u00ad';
const DEV_NUKTA = '\u093c';
const BENG_NUKTA = '\u09bc';

const ML_LEGACY_CHILLU: [string, string][] = [['ണ്‍', 'ൺ'], ['ന്‍', 'ൻ'], ['ര്‍', 'ർ'], ['ല്‍', 'ൽ'], ['ള്‍', 'ൾ'], ['ക്‍', 'ൿ']];
const AS_RA: [string, string] = ['র', 'ৰ'];
const BN_AS_LETTERS: Record<string, string> = { 'ৰ': 'র', 'ৱ': 'ব' };
const HI_NUKTA_BASES = new Set('कखगजडढफ');
const HI_TWO_SIGN_VOWELS: [string, string][] = [
  ['\u093e\u0945', '\u0949'], ['\u0945\u093e', '\u0949'], ['\u093e\u0949', '\u0949'],
  ['\u0947\u093e', '\u094b'], ['\u093e\u0947', '\u094b'],
  ['\u0948\u093e', '\u094c'], ['\u093e\u0948', '\u094c'], ['\u093e\u094c', '\u094c'],
];
const HI_TYPO_SIGN_PAIRS: [string, string][] = [['\u0940\u0947', '\u0940'], ['\u0947\u0948', '\u0947']];
const DEV_VOWEL_SIGNS = new Set([0x093a, 0x093b, ...range(0x093e, 0x094c), 0x094e, 0x094f, 0x0955, 0x0956, 0x0957, 0x0962, 0x0963].map(c => String.fromCharCode(c)));
const DEV_MODIFIERS = new Set(['\u0900', '\u0901', '\u0902', '\u0903']);
const TYPO_SIGN_PAIRS: Partial<Record<NormLanguage, [string, string][]>> = {
  gu: [['\u0abe\u0ac5', '\u0ac9'], ['\u0ac5\u0abe', '\u0ac9']],
  kn: [['\u0cc2\u0cd5', '\u0ccb']],
  or: [['\u0b4b\u0b56', '\u0b4c']],
  ta: [['\u0b93\u0bd7', '\u0b94']],
  pa: [['\u0a21\u0a3c', '\u0a5c']],
};
const AS_NUKTA_BASES = new Set(['\u09a1', '\u09a2', '\u09af']);
const REPEATED_SIGN_LANGS: NormLanguage[] = ['gu', 'te', 'kn', 'or', 'pa', 'as'];
const INDIC_VOWEL_SIGNS = [
  ...range(0x093a, 0x093b), ...range(0x093e, 0x094c), ...range(0x094e, 0x094f), ...range(0x0955, 0x0957), ...range(0x0962, 0x0963),
  ...range(0x09be, 0x09c4), ...range(0x09c7, 0x09c8), ...range(0x09cb, 0x09cc), ...range(0x09e2, 0x09e3),
  ...range(0x0a3e, 0x0a42), ...range(0x0a47, 0x0a48), ...range(0x0a4b, 0x0a4c),
  ...range(0x0abe, 0x0ac5), ...range(0x0ac7, 0x0ac9), ...range(0x0acb, 0x0acc), ...range(0x0ae2, 0x0ae3),
  ...range(0x0b3e, 0x0b44), ...range(0x0b47, 0x0b48), ...range(0x0b4b, 0x0b4c), ...range(0x0b62, 0x0b63),
  ...range(0x0bbe, 0x0bc2), ...range(0x0bc6, 0x0bc8), ...range(0x0bca, 0x0bcc),
  ...range(0x0c3e, 0x0c44), ...range(0x0c46, 0x0c48), ...range(0x0c4a, 0x0c4c), ...range(0x0c62, 0x0c63),
  ...range(0x0cbe, 0x0cc4), ...range(0x0cc6, 0x0cc8), ...range(0x0cca, 0x0ccc), ...range(0x0ce2, 0x0ce3),
  ...range(0x0d3e, 0x0d44), ...range(0x0d46, 0x0d48), ...range(0x0d4a, 0x0d4c), ...range(0x0d62, 0x0d63),
  ...range(0x0dcf, 0x0dd4), ...range(0x0dd6, 0x0dd6), ...range(0x0dd8, 0x0ddf), ...range(0x0df2, 0x0df3),
].map(c => String.fromCharCode(c));
const REPEATED_VOWEL_SIGN = new RegExp(`([${escapeClass(INDIC_VOWEL_SIGNS.join(''))}])\\1+`, 'g');
const REPEATED_DEV_SIGN = new RegExp(`([${escapeClass([...DEV_VOWEL_SIGNS].join(''))}])\\1+`, 'g');

const NONSPEECH_TAGS = new Set([
  'noise', 'uhh', 'ugh', 'umm', 'talking', 'horn', 'unintelligible', 'stammers', 'buzz', 'buzzer', 'music', 'singing',
  'popping', 'breathing', 'inhaling', 'laugh', 'bird_squawk', 'throat_clearing', 'child_talking', 'phone_vibrating',
]);
const LATIN = 'A-Za-zÀ-ÖØ-öø-ɏ';
const LATIN_WORD = `[${LATIN}]+(?:['’.-][${LATIN}]+)*`;
const HAS_LATIN = new RegExp(`[${LATIN}]`);
const GLOSS = new RegExp(`\\s*(\\[[${LATIN} .'’&/-]*\\]|\\([${LATIN} .'’&/-]*\\))`, 'g');
const TAG = /\s*(?:\[\s*([A-Za-z_]+)\s*\]|\(\s*([a-z_]+)\s*\))/g;
const AS_LATIN_BRACKET = /\s*(?:\[[^\[\]]*[A-Za-z][^\[\]]*\]|\([^()]*[A-Za-z][^()]*\))/g;
const LATIN_SPAN = new RegExp(`${LATIN_WORD}(?:\\s+${LATIN_WORD})*`, 'g');
const I_DANDA_TAIL = `(?=\\s*(?:$|[^\\s${LATIN}.\\-'’0-9]))`;
const PA_I = new RegExp(`(?<=[\\u0a00-\\u0a7f])(\\s*)I${I_DANDA_TAIL}`);
const HI_I = new RegExp(`(?<=[\u0900-\u097f])()I${I_DANDA_TAIL}`);
const OR_I = new RegExp(`(?<=[\u0b00-\u0b7f])(\\s*)I(?=\\s*$)`);

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let c = from; c <= to; c++) out.push(c);
  return out;
}

/** The characters inside a regular-expression class, escaped. */
function escapeClass(chars: string): string {
  return chars.replace(/[\\\]\[^-]/g, ch => `\\${ch}`);
}

export const nfcWhitespace = (text: string) => text.normalize('NFC').split(/\s+/).filter(Boolean).join(' ');
const isLetterMark = (ch: string) => /[\p{L}\p{M}]/u.test(ch);
const isLatinLetter = (ch: string) => /[A-Za-zÀ-ÖØ-öø-ɏ]/.test(ch);
const replacePairs = (text: string, pairs: [string, string][]) => pairs.reduce((value, [from, to]) => value.split(from).join(to), text);

function devaVowelSigns(text: string): string {
  return replacePairs(text, [...HI_TWO_SIGN_VOWELS, ...HI_TYPO_SIGN_PAIRS]).replace(REPEATED_DEV_SIGN, '$1');
}

function hiNuktaMatra(text: string): string {
  const out: string[] = [];
  for (const ch of text) {
    if (ch !== DEV_NUKTA) { out.push(ch); continue; }
    if (out.length && HI_NUKTA_BASES.has(out[out.length - 1]!)) { out.push(ch); continue; }
    let j = out.length - 1;
    while (j >= 0 && (DEV_VOWEL_SIGNS.has(out[j]!) || DEV_MODIFIERS.has(out[j]!))) j--;
    if (j >= 0 && j < out.length - 1 && HI_NUKTA_BASES.has(out[j]!) && out[j + 1] !== DEV_NUKTA) out.splice(j + 1, 0, DEV_NUKTA);
  }
  return devaVowelSigns(out.join(''));
}

function mlChillu(text: string): string {
  return replacePairs(text.replace('ന്‍റ', 'ന്റ'), ML_LEGACY_CHILLU);
}

function asStrayNukta(text: string): string {
  const out: string[] = [];
  for (const ch of text) {
    if (ch === BENG_NUKTA && !(out.length && AS_NUKTA_BASES.has(out[out.length - 1]!))) continue;
    out.push(ch);
  }
  return out.join('');
}

function stripLatinGlossOnce(text: string): string {
  return text.replace(GLOSS, (match: string, _gloss: string, offset: number) => {
    if (offset > 0 && isIndicWordChar(text[offset - 1]!) && HAS_LATIN.test(match)) return '';
    return match;
  });
}

function isIndicWordChar(ch: string): boolean {
  return ch >= '\u0900' && ch <= '\u0dff' && isLetterMark(ch);
}

function stripLatinGloss(text: string): string {
  for (;;) {
    const next = nfcWhitespace(stripLatinGlossOnce(text));
    if (next === text) return text;
    text = next;
  }
}

function asLatinBracket(text: string): string {
  return text.replace(AS_LATIN_BRACKET, match => ([...match].some(ch => ch >= '\u0980' && ch <= '\u09ff' && (/[\p{L}]/u.test(ch) || /\p{Nd}/u.test(ch))) ? match : ' '));
}

export function findLatinSpans(text: string): string[] {
  return text.match(LATIN_SPAN) ?? [];
}

function flagsOf(set: Set<string>): string[] {
  return [...set];
}

const LANGUAGES: NormLanguage[] = ['hi', 'bn', 'ta', 'te', 'ml', 'gu', 'pa', 'kn', 'mr', 'as', 'or'];

export function normalizeForChars(text: string, lang: NormLanguage): NormResult {
  if (!LANGUAGES.includes(lang)) throw new Error(`textnorm has no rules for ${lang} (expected one of ${LANGUAGES.join(', ')})`);
  const applied: string[] = [], flags = new Set<string>();
  let current = nfcWhitespace(text);
  if (current !== text) applied.push('nfc');
  const step = (name: string, next: string) => {
    next = nfcWhitespace(next);
    if (next !== current) applied.push(name);
    current = next;
  };
  if (lang === 'ml') step('ml_chillu', mlChillu(current));
  step('zwj_removed', current.split(ZWJ).join(''));
  step('zwnj_removed', current.split(ZWNJ).join(''));
  step('zwsp_bom_removed', [...INVISIBLE].reduce((value, ch) => value.split(ch).join(''), current));
  if (lang === 'as') step('as_ra', current.split(AS_RA[0]).join(AS_RA[1]));
  if (lang === 'bn') step('bn_as_letters', [...current].map(ch => BN_AS_LETTERS[ch] ?? ch).join(''));
  if (lang === 'hi') step('hi_nukta_matra', hiNuktaMatra(current));
  if (lang === 'mr') step('deva_vowel_signs', devaVowelSigns(current));
  if (TYPO_SIGN_PAIRS[lang]) step(`${lang}_typo_signs`, replacePairs(current, TYPO_SIGN_PAIRS[lang]!));
  if (lang === 'as') step('as_stray_nukta_dropped', asStrayNukta(current));
  if (REPEATED_SIGN_LANGS.includes(lang)) step('repeated_vowel_sign', current.replace(REPEATED_VOWEL_SIGN, '$1'));
  step('nonspeech_tag_removed', current.replace(TAG, (match, square?: string, round?: string) => {
    const word = (square ?? round ?? '').toLowerCase();
    return NONSPEECH_TAGS.has(word) || /^[a-z]+(?:_[a-z]+)+$/.test(word) ? ' ' : match;
  }));
  if (applied.includes('nonspeech_tag_removed')) flags.add('nonspeech_tag_removed');
  if (lang === 'kn' || lang === 'pa') {
    if (stripLatinGloss(current) !== current) flags.add('latin_gloss_kept');
  } else {
    step('latin_gloss_removed', stripLatinGloss(current));
    if (applied.includes('latin_gloss_removed')) flags.add('latin_gloss_removed');
  }
  if (lang === 'as') {
    step('as_latin_bracket_removed', asLatinBracket(current));
    if (applied.includes('as_latin_bracket_removed')) flags.add('latin_gloss_removed');
  }
  if (lang === 'pa') step('pa_latin_i_danda', current.replace(PA_I, '$1।'));
  if (lang === 'hi') step('hi_latin_i_danda', current.replace(HI_I, '$1।'));
  if (lang === 'or') step('or_latin_i_danda', current.replace(OR_I, '$1।'));

  const spoken = verbalizeDigits(current, lang);
  spoken.flags.forEach(flag => flags.add(flag));
  step('digits_verbalized', spoken.text);
  return { text: current, flags: flagsOf(flags), applied, latinSpans: findLatinSpans(current) };
}

/* ------------------------------------------------------------------ numbers */

const NATIVE_DIGIT_ZEROS = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];
const DIGITS = '0123456789' + NATIVE_DIGIT_ZEROS.map(zero => range(zero, zero + 9).map(c => String.fromCharCode(c)).join('')).join('');
const DIGIT_SET = new Set(DIGITS);
const DIGIT_CLASS = escapeClass(DIGITS);
const NUM_TOKEN = new RegExp(`(?<cur>[₹$€£]\\s?)?(?<body>[${DIGIT_CLASS}](?:[${DIGIT_CLASS}]|[,.:/](?=[${DIGIT_CLASS}]))*)(?<pct>\\s?%)?`, 'g');
const WESTERN_GROUPS = /^\d{1,3}(?:,\d{3})+$/;
const INDIAN_GROUPS = /^\d{1,2}(?:,\d{2})+,\d{3}$/;

const HI_UNITS = `शून्य एक दो तीन चार पाँच छह सात आठ नौ
दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस
बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस
तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस
चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास
पचास इक्यावन बावन तिरेपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ
साठ इकसठ बासठ तिरेसठ चौंसठ पैंसठ छियासठ सरसठ अड़सठ उनहत्तर
सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी
अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अठासी नवासी
नब्बे इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे`
  .split(/\s+/).filter(Boolean);
if (HI_UNITS.length !== 100) throw new Error(`The Hindi number table has ${HI_UNITS.length} entries, expected 100`);

const asciiDigits = (digits: string) => [...digits].map(ch => {
  if (ch >= '0' && ch <= '9') return ch;
  for (const zero of NATIVE_DIGIT_ZEROS) if (ch >= String.fromCharCode(zero) && ch <= String.fromCharCode(zero + 9)) return String(ch.charCodeAt(0) - zero);
  return ch;
}).join('');

const hiUnit = (n: number) => HI_UNITS[n]!;

function hiCardinal(n: number): string {
  if (n < 100) return hiUnit(n);
  const parts: [number, string | undefined][] = [];
  let rest = n;
  for (const [value, scale] of [[10_000_000, 'करोड़'], [100_000, 'लाख'], [1_000, 'हज़ार'], [100, 'सौ']] as [number, string][]) {
    const count = Math.floor(rest / value);
    rest %= value;
    if (count) parts.push([count, scale]);
  }
  if (rest) parts.push([rest, undefined]);
  return parts.map(([value, scale]) => (scale ? `${hiUnit(value)} ${scale}` : hiUnit(value))).join(' ');
}

function hiInteger(digits: string, yearStyle: boolean): string {
  const ascii = asciiDigits(digits), n = Number(ascii);
  if ((ascii.length > 1 && ascii[0] === '0') || ascii.length > 9) return ascii.split('').map(d => hiUnit(Number(d))).join(' ');
  if (yearStyle && ascii.length === 4 && n >= 1100 && n <= 1999) {
    const high = Math.floor(n / 100), low = n % 100;
    return `${hiUnit(high)} सौ${low ? ` ${hiUnit(low)}` : ''}`;
  }
  return hiCardinal(n);
}

function groupedDigits(body: string): string | undefined {
  const ascii = [...body].map(ch => (ch === ',' ? ',' : asciiDigits(ch))).join('');
  if (WESTERN_GROUPS.test(ascii) || INDIAN_GROUPS.test(ascii)) return ascii.split(',').join('');
  return undefined;
}

/** Words for the digits of one numeric token, or undefined when the form is not read (dates, clock times, ratios). */
function hiBodyWords(body: string): string | undefined {
  if (body.includes(':') || body.includes('/') || body.split('.').length > 2) return undefined;
  if (body.includes('.')) {
    const [whole, fraction] = body.split('.') as [string, string];
    if (fraction.includes(',')) return undefined;
    const digits = whole.includes(',') ? groupedDigits(whole) : whole;
    if (!digits) return undefined;
    return `${hiInteger(digits, false)} दशमलव ${asciiDigits(fraction).split('').map(d => hiUnit(Number(d))).join(' ')}`;
  }
  if (body.includes(',')) {
    const digits = groupedDigits(body);
    if (digits) return hiInteger(digits, false);
    return body.split(',').map(part => hiInteger(part, true)).join(',');
  }
  return hiInteger(body, true);
}

/** Every numeric token in `text`, replaced by Hindi words; forms the model's textnorm leaves alone are flagged. */
export function verbalizeDigits(text: string, lang: NormLanguage): { text: string; flags: string[] } {
  if (lang !== 'hi') {
    const hasDigits = [...text].some(ch => DIGIT_SET.has(ch));
    return { text, flags: hasDigits ? ['numeric_unsupported'] : [] };
  }
  const flags: string[] = [];
  let out = '', pos = 0;
  for (const match of text.matchAll(NUM_TOKEN)) {
    const start = match.index ?? 0, token = match[0], body = match.groups?.body ?? '';
    const currency = match.groups?.cur, percent = match.groups?.pct;
    let words = hiBodyWords(body);
    if (!words || (currency && currency.trim() !== '₹')) {
      flags.push('numeric_unsupported');
      continue;
    }
    if (percent) words = `${words} प्रतिशत`;
    if (currency) words = `${words} रुपये`;
    words = words.normalize('NFC');
    const before = start > 0 ? text[start - 1]! : '', end = start + token.length;
    const after = end < text.length ? text[end]! : '';
    if (isLatinLetter(before)) words = ` ${words}`;
    if (isLatinLetter(after)) words = `${words} `;
    out += text.slice(pos, start) + words;
    pos = end;
  }
  out += text.slice(pos);
  return { text: out, flags };
}
