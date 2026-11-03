import { describe, it, expect } from 'vitest';
import { checkArgs, wantsHelp, commandSpecs } from '../../packages/cli/src/args';
describe('command-line options', () => {
  it('accepts each command\'s own options, in either form', () => { expect(checkArgs(['render', 'v.json', '--crf', '18', '--transparent', '--var', 'title=Hi'])).toEqual(['render', 'v.json', '--crf', '18', '--transparent', '--var', 'title=Hi']);
    expect(checkArgs(['render', 'v.json', '--crf=18', '--output=out/a=b.mp4'])).toEqual(['render', 'v.json', '--crf', '18', '--output', 'out/a=b.mp4']);
    expect(checkArgs(['render', 'v.json', '--loudness', '-14'])).toContain('-14'); expect(checkArgs(['browser', 'install'])).toEqual(['browser', 'install']);
    expect(checkArgs(['ai', 'refine', 'v.json', '--instruction', 'make it bigger'])).toContain('--instruction'); expect(checkArgs(['ai', 'transcribe', 'voice.wav', '--composition', 'v.json', '--start', '2.5'])).toContain('--start');
    expect(checkArgs(['ai', 'studio', '--port', '3100', '--out', 'demo'])).toEqual(['ai', 'studio', '--port', '3100', '--out', 'demo']); });
  it('rejects typos with a suggestion', () => { expect(() => checkArgs(['render', 'v.json', '--crff', '18'])).toThrow('ove render does not take --crff; did you mean --crf?');
    expect(() => checkArgs(['rendr', 'v.json'])).toThrow('Unknown command "rendr"; did you mean "ove render"?'); });
  it('rejects options that belong to another command', () => { expect(() => checkArgs(['still', 'v.json', '--crf', '18'])).toThrow(/ove still does not take --crf/); expect(() => checkArgs(['doctor', '--json'])).toThrow(/takes no options/); });
  it('rejects a value option without its value, and extra arguments', () => { expect(() => checkArgs(['render', 'v.json', '--output'])).toThrow('--output needs a value'); expect(() => checkArgs(['render', 'v.json', '--output', '--crf', '18'])).toThrow('--output needs a value');
    expect(() => checkArgs(['render', 'a.json', 'b.json'])).toThrow('Unexpected argument "b.json" for ove render'); });
  it('keeps --frames working for review alongside --sheet-frames', () => { expect(checkArgs(['review', 'v.json', '--frames', '12'])).toContain('--frames'); expect(checkArgs(['review', 'v.json', '--sheet-frames', '12'])).toContain('--sheet-frames'); });
  it('recognises help anywhere and covers every command', () => { expect(wantsHelp(['render', '--help'])).toBe(true); expect(wantsHelp(['-h'])).toBe(true); expect(wantsHelp(['help'])).toBe(true); expect(wantsHelp(['render', 'v.json'])).toBe(false);
    expect(Object.keys(commandSpecs).sort()).toEqual(['add', 'ai', 'blocks', 'browser', 'build', 'cache', 'captions', 'dev', 'doctor', 'init', 'inspect', 'render', 'review', 'schema', 'still', 'theme', 'thumbnail', 'track', 'validate', 'worker']); });
});
