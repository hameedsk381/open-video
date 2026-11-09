// Command-line options per command. Every option a command accepts is listed here, so a typo (--crff 18) or an option from another
// command fails with a suggestion instead of being silently ignored, and a value option without its value fails too.
// `--name=value` is accepted as well as `--name value`.
type Spec = { values?: string[]; flags?: string[]; positionals?: number };
const variables = ['--var', '--vars'];
const renderValues = ['--output', '--format', '--codec', '--frames', '--crf', '--bitrate', '--audio-bitrate', '--scale', '--loudness', '--concurrency', '--preset', '--workers', '--chunk-size', '--token', '--batch', '--aspect'];
export const commandSpecs: Record<string, Spec> = {
  init: { values: ['--template'], flags: ['--force', '--no-skill'], positionals: 1 },
  schema: { values: ['--output'] },
  doctor: {},
  cache: { values: ['--older-than'], positionals: 1 },
  browser: { positionals: 1 },
  blocks: { flags: ['--json'] },
  build: { values: ['--output'], positionals: 1 },
  agent: { values: ['--brief', '--duration', '--fps', '--provider', '--model', '--format', '--url', '--aspect'], flags: ['--reel', '--landscape', '--render', '--no-render', '--no-plan', '--no-direction'], positionals: 2 },
  track: { values: ['--fps', '--output'], positionals: 1 },
  thumbnail: { values: ['--frame', '--title', '--width', '--output', ...variables], flags: ['--allow-code'], positionals: 1 },
  add: { values: ['--set', '--at', '--frames', '--track', '--scene', '--id', '--aspect', '--theme', '--name'], positionals: 2 },
  theme: { flags: ['--json'], positionals: 2 },
  figma: { values: ['--token', '--out', '--output-comp', '--fps', '--duration'], positionals: 1 },
  worker: { values: ['--port', '--host', '--token', '--concurrency'] },
  mcp: {},
  serve: {},
  'job-worker': {},
  dev: { values: ['--port', '--allow-host', '--aspect', ...variables], flags: ['--allow-code'], positionals: 1 },
  validate: { values: ['--aspect', ...variables], positionals: 1 },
  inspect: { values: ['--aspect', ...variables], positionals: 1 },
  captions: { values: ['--output', ...variables], positionals: 1 },
  script: { values: ['--output', '--set'], flags: ['--json'], positionals: 1 },
  production: { values: ['--output'], flags: ['--json'], positionals: 2 },
  explainer: { values: ['--output', '--voice', '--provider', '--model', '--base-url', '--scenes', '--language', '--media', '--speech-engine'], flags: ['--no-voice', '--images'], positionals: 2 },
  still: { values: ['--frame', '--output', '--aspect', ...variables], flags: ['--transparent', '--allow-code'], positionals: 1 },
  review: { values: ['--output', '--every', '--sheet-frames', '--frames', '--aspect', ...variables], flags: ['--json', '--allow-code', '--show-safe-zones'], positionals: 1 },
  render: { values: [...renderValues, ...variables], flags: ['--transparent', '--no-motion-blur', '--allow-code'], positionals: 1 },
  ai: { values: ['--public-port', '--host', '--allow-host', '--instruction', '--prompt', '--provider', '--model', '--base-url', '--speech-engine', '--brief', '--kind', '--aspect', '--duration', '--fps', '--out', '--voice', '--language', '--lang', '--size', '--composition', '--id', '--start', '--output', '--template', '--theme', '--typography', '--motion-pacing', '--pacing', '--audio-mood', '--mood', '--voice-tone', '--cta', '--out-dir', '--fields', '--max-attempts', '--tail', '--asset', '--source', '--content', '--limit', '--port', '--crf', '--bitrate', '--audio-bitrate', '--scale', '--loudness', '--concurrency', '--preset', '--codec', '--format', '--max-silence', '--width', '--height', '--count', '--min', '--max'],
    flags: ['--force', '--dry-run', '--json', '--review', '--strict', '--full', '--narration', '--render', '--schema', '--no-captions', '--no-plan', '--no-react', '--transparent', '--no-motion-blur', '--sfx', '--keep-fillers', '--no-cut', '--research', '--no-research'], positionals: 3 },
};
// Edit distance, for "did you mean".
const distance = (a: string, b: string) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]); for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i-1]![j]! + 1, d[i]![j-1]! + 1, d[i-1]![j-1]! + (a[i-1] === b[j-1] ? 0 : 1)); return d[a.length]![b.length]!; };
export const wantsHelp = (argv: string[]) => argv.includes('--help') || argv.includes('-h') || argv[0] === 'help';
export const wantsVersion = (argv: string[]) => argv.includes('--version') || argv.includes('-v') || argv[0] === 'version';
// Splits --name=value, then checks the command's options. Returns the argument list the rest of the CLI reads.
export function checkArgs(argv: string[]): string[] { const args = argv.flatMap(arg => /^--[a-z-]+=/.test(arg) ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg]);
  const [command] = args; if (command === undefined) return args; const spec = commandSpecs[command];
  if (!spec) { const near = Object.keys(commandSpecs).sort((a, b) => distance(command, a) - distance(command, b))[0]!; throw new Error(`Unknown command "${command}"${distance(command, near) <= 3 ? `; did you mean "ove ${near}"?` : ''}`); }
  const values = spec.values ?? [], flags = spec.flags ?? [], known = [...values, ...flags]; let positionals = 0;
  for (let i = 1; i < args.length; i++) { const arg = args[i]!;
    if (arg.startsWith('--')) { if (values.includes(arg)) { const value = args[i+1]; if (value === undefined || (value.startsWith('--') && !/^--?\d/.test(value))) throw new Error(`${arg} needs a value`); i++; continue; }
      if (flags.includes(arg)) continue; const near = [...known].sort((a, b) => distance(arg, a) - distance(arg, b))[0];
      throw new Error(`ove ${command} does not take ${arg}${near && distance(arg, near) <= 3 ? `; did you mean ${near}?` : known.length ? ` (it takes ${known.join(', ')})` : ' (it takes no options)'}`); }
    if (++positionals > (spec.positionals ?? 0)) throw new Error(`Unexpected argument "${arg}" for ove ${command}`); }
  return args; }
