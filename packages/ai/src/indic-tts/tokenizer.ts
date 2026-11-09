/**
 * The released models' vocabulary lives in `config.json` (`vocab.symbols`), built from their training text: `<blank>`,
 * `<unk>`, then one `c:<character>` entry per character. A chunk is encoded character by character, with a blank
 * between and around every symbol (the Matcha convention), so a 10-character line becomes 21 tokens.
 */
export type VocabConfig = { symbols: string[]; add_blank?: boolean; mode?: string; normalizer?: string; normalization_version?: string };

export class Tokenizer {
  readonly symbols: string[];
  readonly addBlank: boolean;
  readonly ids: Map<string, number>;

  constructor(vocab: VocabConfig) {
    if (!Array.isArray(vocab?.symbols) || vocab.symbols.length < 2 || vocab.symbols[0] !== '<blank>' || vocab.symbols[1] !== '<unk>') {
      throw new Error('The model config has no usable vocabulary (symbols must start with <blank> and <unk>)');
    }
    if (vocab.mode && vocab.mode !== 'chr') throw new Error(`This model reads ${vocab.mode === 'ipa' ? 'phonemes' : vocab.mode}, which this engine cannot prepare`);
    this.symbols = vocab.symbols;
    this.addBlank = vocab.add_blank !== false;
    this.ids = new Map(vocab.symbols.map((symbol, id) => [symbol, id]));
  }

  /** The character is something the model can read. Space is always allowed (it is a symbol in every vocab). */
  knows(char: string): boolean {
    return char === ' ' || this.ids.has(`c:${char}`);
  }

  /** Character ids for one chunk, blank-interspersed; unknown characters are not expected here (normalize drops them). */
  encode(chunk: string): number[] {
    const ids = [...chunk].map(char => this.ids.get(`c:${char}`) ?? 1);
    if (!this.addBlank) return ids;
    const out = new Array<number>(ids.length * 2 + 1).fill(0);
    for (let i = 0; i < ids.length; i++) out[i * 2 + 1] = ids[i]!;
    return out;
  }
}
