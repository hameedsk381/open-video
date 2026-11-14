// `mr make <file>`: see make.ts. Exits with 1 when the file cannot be built or the review found errors, so a script or an agent can branch on it.
import { makeReport, makeVideo, type MakeRender } from './make';

const option = (argv: string[], name: string) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };

export async function runMake(argv: string[]): Promise<void> {
  const file = argv[1];
  if (!file || file.startsWith('--')) throw new Error('Usage: mr make <explainer.json|composition.json> [--draft|--final] [--no-voice] [--no-react] [--voice <name>] [--output file.mp4] [--sheet review.png] [--every N] [--allow-code] [--json]');
  if (argv.includes('--draft') && argv.includes('--final')) throw new Error('Choose --draft or --final, not both');
  const render: MakeRender | undefined = argv.includes('--final') ? 'final' : argv.includes('--draft') ? 'draft' : undefined;
  const every = option(argv, '--every') === undefined ? undefined : Number(option(argv, '--every'));
  if (every !== undefined && !(Number.isInteger(every) && every > 0)) throw new Error('--every must be a whole number of frames');
  const asJson = argv.includes('--json');
  const result = await makeVideo({
    file, render, output: option(argv, '--output'), sheet: option(argv, '--sheet'), voice: !argv.includes('--no-voice'), voiceName: option(argv, '--voice'),
    allowCode: argv.includes('--allow-code'), react: !argv.includes('--no-react'), every, log: asJson ? undefined : message => console.error(`  ${message}`),
  });
  console.log(asJson ? JSON.stringify(result, null, 2) : makeReport(result));
  if (!result.ok) process.exitCode = 1;
}
