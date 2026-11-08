import { describe, expect, it } from 'vitest';
import { composeVideo, copyProblems, isLabelOnly, repairCopy, requiredLines, screenText, type AiProvider } from '@ove/ai';

// Built from what the pipeline really produced: a brief that said "end on the line: Ride more." and got a video that never says it, and a
// scene that printed "Hook / Problem / Proof / Offer / Call to Action" because those were the names of the beats.

const transit = 'A 12 second vertical explainer for Reykja Transit. Bus ridership grew 14 percent in 2025 to 2.3 million trips. Present it calmly and clearly with the figures, and end on the line: Ride more.';
const text = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, type: 'text', content, fontSize: 80, ...extra });
const video = (...scenes: any[][]) => ({ scenes: scenes.map((layers, index) => ({ id: `scene-${index + 1}`, layers })) }) as any;

describe('requiredLines', () => {
  it('reads the closing line out of the briefs this pipeline was given', () => {
    expect(requiredLines(transit)).toEqual(['Ride more']);
    expect(requiredLines('A launch teaser for Lumen. Show Lumen finding the culprit, and end on the line: See your slowest query.')).toEqual(['See your slowest query']);
    expect(requiredLines('A teaser for Tidewater. Warm and wry. End with the words: Order the winter box.')).toEqual(['Order the winter box']);
    expect(requiredLines('It should close on the tagline "Fresh every morning" and nothing more.')).toEqual(['Fresh every morning']);
  });

  it('takes quoted text that is introduced as something to read, and leaves other quotes alone', () => {
    expect(requiredLines('Headline reads "Spring is here". Mention the "smart" thermostat and the brand "Aster".')).toEqual(['Spring is here']);
    expect(requiredLines('A calm video about a so-called "quiet" street.')).toEqual([]);
    expect(requiredLines('')).toEqual([]);
  });

  it('keeps each line once and skips anything that is not a line', () => {
    expect(requiredLines('End on the line: Ride more. The tagline is "Ride more".')).toEqual(['Ride more']);
    expect(requiredLines('The headline says "x"')).toEqual([]);                       // too short to be a line
    expect(requiredLines(`The line is "${'word '.repeat(14)}"`)).toEqual([]);         // a paragraph is not a line
  });
});

describe('isLabelOnly', () => {
  it('knows the names beats and scenes are given', () => {
    for (const label of ['Hook', 'Problem Proof', 'Call to Action', 'Scene 2', 'beat 3', 'Offer', 'CTA']) expect(isLabelOnly(label), label).toBe(true);
    expect(isLabelOnly('Hook\nProblem\nProof\nOffer\nCall to Action')).toBe(true);
  });

  it('does not mistake real copy that contains one of those words', () => {
    for (const copy of ['Problem solved', 'Offer ends Friday', 'The hook is the price', 'Ride more.', 'See your slowest query']) expect(isLabelOnly(copy), copy).toBe(false);
    expect(isLabelOnly('')).toBe(false);
  });

  it('also knows the names this plan gave its beats, unless the brief itself uses the word', () => {
    expect(isLabelOnly('Reveal', ['Reveal'])).toBe(true);
    expect(isLabelOnly('Reveal', ['Reveal'], 'A film about the Reveal')).toBe(false);
    expect(isLabelOnly('Hook', [], 'A product called Hook')).toBe(false);
  });
});

describe('screenText', () => {
  it('reads text layers, nested ones and rich text, and skips narration and caption scenes', () => {
    const composition = { scenes: [{ id: 's1', layers: [text('a', 'One'), { id: 'g', type: 'group', children: [text('b', 'Two')] }, { id: 'c', type: 'text', spans: [{ text: 'Thr' }, { text: 'ee' }] }] }, { id: 'captions', layers: [text('x', 'ignored words')] }] } as any;
    expect(screenText(composition)!.map(entry => entry.text)).toEqual(['One', 'Two', 'Three']);
  });

  it('cannot read a video that is drawn as React, and says so by returning nothing', () => {
    expect(screenText(video([{ id: 'r', type: 'react', src: 'v.bundle.js' }]))).toBeUndefined();
    expect(screenText(video([{ id: 'r', type: 'react', src: 'v.bundle.js' }, text('t', 'Caption')]))!.map(entry => entry.text)).toEqual(['Caption']);
  });
});

describe('copyProblems', () => {
  it('finds the closing line missing, as in the Transit video that ended on "more.."', () => {
    const composition = video([text('a', 'Moving more people than ever before')], [text('b', 'more..')]);
    expect(copyProblems(transit, composition)).toMatchObject([{ kind: 'missing-line', line: 'Ride more' }]);
  });

  it('finds the beat names printed as copy, as in the Transit video that ended on "Hook / Problem / Proof"', () => {
    const composition = video([text('a', 'Reykja Transit')], [text('hook', 'Hook'), text('p', 'Problem Proof'), text('c', 'Call to Action')]);
    const problems = copyProblems(transit, composition);
    expect(problems.filter(problem => problem.kind === 'label').map(problem => problem.layer)).toEqual(['hook', 'p', 'c']);
    expect(problems.some(problem => problem.kind === 'missing-line')).toBe(true);
  });

  it('is quiet when the video says what the brief asked for', () => {
    expect(copyProblems(transit, video([text('a', '2.3 million trips')], [text('b', 'Ride more.')]))).toEqual([]);
    expect(copyProblems(transit, video([text('a', 'RIDE   MORE')]))).toEqual([]);           // case, spacing and punctuation do not matter
    expect(copyProblems(transit, video([text('a', 'Ride'), text('b', 'more')]))).toEqual([]);          // two layers of one scene still say it
    expect(copyProblems(transit, video([text('a', 'Ride')], [text('b', 'more')]))).toHaveLength(1);    // but "Ride" in one scene and "more" in another does not
  });

  it('does not judge a video it cannot read', () => {
    expect(copyProblems(transit, video([{ id: 'r', type: 'react', src: 'v.bundle.js' }]))).toEqual([]);
  });

  it('asks for the fix in words a model can act on', () => {
    const [problem] = copyProblems(transit, video([text('a', 'Hello')]));
    expect(problem!.message).toContain('"Ride more"'); expect(problem!.message).toContain('last scene');
  });
});

describe('repairCopy', () => {
  const beats = [{ name: 'Hook', onScreen: 'Reykja Transit' }, { name: 'Proof', onScreen: '2.3 million trips' }, { name: 'Call to action', onScreen: 'Ride more.' }];

  it("gives a label its beat's line, and drops one whose beat has none when another text layer is there to speak", () => {
    const raw = video([text('t1', 'Hook', { text: 'Hook' })], [text('t2', 'Proof'), text('t3', 'A real sentence')], [text('t4', 'Call to action')], [text('t5', 'Offer'), text('t6', 'Half price today')]);
    const notes = repairCopy(raw, transit, [...beats, { name: 'Offer' }]);
    expect(raw.scenes[0].layers[0]).toMatchObject({ content: 'Reykja Transit', text: 'Reykja Transit' });
    expect(raw.scenes[1].layers.map((layer: any) => layer.content)).toEqual(['2.3 million trips', 'A real sentence']);
    expect(raw.scenes[2].layers[0].content).toBe('Ride more.');
    expect(raw.scenes[3].layers.map((layer: any) => layer.id)).toEqual(['t6']);
    expect(notes).toHaveLength(4);
  });

  it("drops a label when the scene already says its beat's line, instead of printing the line twice", () => {
    const raw = video([text('label', 'Proof'), text('a', 'Calm design'), text('b', 'Premium security')]);
    const notes = repairCopy(raw, 'A calm, premium finance launch.', [{ name: 'Proof', onScreen: 'Calm design, premium security' }]);
    expect(raw.scenes[0].layers.map((layer: any) => layer.id)).toEqual(['a', 'b']);
    expect(notes).toEqual(['scene 1: dropped the beat label "Proof", because the scene already says "Calm design, premium security".']);
  });

  it('never prints a shot description in place of a label', () => {
    const raw = video([text('label', 'Problem Reveal'), text('a', 'Tracking your money')]);
    const notes = repairCopy(raw, 'A calm finance app.', [{ name: 'Problem Reveal', onScreen: 'Close-up of phone screen showing chaotic spreadsheet with red numbers flashing.' }]);
    expect(raw.scenes[0].layers.map((layer: any) => layer.id)).toEqual(['a']);
    expect(notes).toEqual(['scene 1: dropped the beat label "Problem Reveal".']);
  });

  it('drops the spoken line when a scene also prints it under the headline', () => {
    const raw = video([text('head', 'Clarity in your palm', { fontSize: 173 }), text('sub', 'Money clarity in the palm of your hand.', { fontSize: 86 })]);
    const notes = repairCopy(raw, 'A calm finance app.', [{ name: 'Hook', onScreen: 'Clarity in your palm', narration: 'Money clarity in the palm of your hand.' }]);
    expect(raw.scenes[0].layers.map((layer: any) => layer.id)).toEqual(['head']);
    expect(notes).toEqual(['scene 1: dropped "Money clarity in the palm of your hand.", which is the spoken line; narration is heard, not printed.']);
    // A scene with only the spoken line keeps it: dropping it would leave the scene wordless.
    const solo = video([text('only', 'Money clarity in the palm of your hand.')]);
    expect(repairCopy(solo, 'A calm finance app.', [{ narration: 'Money clarity in the palm of your hand.' }])).toEqual([]);
    expect(solo.scenes[0].layers).toHaveLength(1);
  });

  it('puts a missing required line into the last scene\'s biggest text, once per line', () => {
    const raw = video([text('a', 'Intro', { fontSize: 120 })], [text('small', 'detail', { fontSize: 40 }), text('big', 'more..', { fontSize: 140 })]);
    const notes = repairCopy(raw, transit, []);
    expect(raw.scenes[1].layers[1].content).toBe('Ride more');
    expect(raw.scenes[1].layers[0].content).toBe('detail');
    expect(raw.scenes[0].layers[0].content).toBe('Intro');
    expect(notes).toEqual(['the required line "Ride more" was missing, so a text layer in the last scene now says it.']);
    const two = video([text('a', 'x', { fontSize: 100 }), text('b', 'y', { fontSize: 90 })]);
    repairCopy(two, 'End on the line: First line. The tagline is "Second line".', []);
    expect(two.scenes[0].layers.map((layer: any) => layer.content).sort()).toEqual(['First line', 'Second line']);
  });

  it('changes nothing in a video that is already right', () => {
    const raw = video([text('a', '2.3 million trips')], [text('b', 'Ride more.')]);
    const before = JSON.stringify(raw);
    expect(repairCopy(raw, transit, beats)).toEqual([]);
    expect(JSON.stringify(raw)).toBe(before);
  });
});

describe('in composeVideo', () => {
  const reply = (...scenes: { id: string; texts: string[] }[]) => JSON.stringify({ version: '1.0', id: 'v', name: 'V', scenes: scenes.map((scene, index) => ({ id: scene.id, name: scene.id, startFrame: index * 60, durationFrames: 60, layers: scene.texts.map((content, n) => ({ id: `${scene.id}-t${n}`, type: 'text', content, x: 40, y: 40 + n * 120, fontSize: 64 - n * 8, color: '#ffffff' })) })) });
  const run = (replies: string[], brief = transit, extra: Record<string, unknown> = {}) => {
    let at = 0; const seen: any[] = [];
    const provider: AiProvider = { id: 'fake', model: 'm', baseUrl: 'fake://', chat: async messages => { seen.push(messages); return replies[Math.min(at++, replies.length - 1)]!; } };
    return composeVideo(provider, { brief, width: 1080, height: 1920, fps: 30, durationSeconds: 4, maxAttempts: 3, ...extra } as any).then(result => ({ result, seen }));
  };
  const lines = (result: any) => result.composition.scenes.map((scene: any) => scene.layers.map((layer: any) => layer.content));

  it('puts the line the brief asked for on the last scene, and says it did', async () => {
    const { result, seen } = await run([reply({ id: 'a', texts: ['2.3 million trips'] }, { id: 'b', texts: ['more..'] })]);
    expect(lines(result)).toEqual([['2.3 million trips'], ['Ride more']]);
    expect(result.warnings.join(' ')).toContain('the required line "Ride more" was missing');
    expect(seen).toHaveLength(1);                                   // repaired in place: no second model call
  });

  it('replaces a beat name with that beat\'s own line, when the plan lines up with the scenes', async () => {
    const motionPlan = { beats: [{ name: 'Hook', onScreen: 'Reykja Transit' }, { name: 'Call to action', onScreen: 'Ride more.' }] };
    const { result } = await run([reply({ id: 'a', texts: ['Hook'] }, { id: 'b', texts: ['Call to action'] })], transit, { motionPlan });
    expect(lines(result)).toEqual([['Reykja Transit'], ['Ride more.']]);
  });

  it('lays a scene out again after repair changes its words, so the copy below a grown headline is not left on top of it', async () => {
    // What the scene route really produced: the headline was the beat name "Proof", so it was measured as one line and the
    // sublines were placed 230px below it; repair then made the headline say the whole line and it wrapped to three lines.
    const raw = JSON.stringify({
      version: '1.0', id: 'v', name: 'V', durationFrames: 120,
      scenes: [
        { id: 'a', name: 'A', startFrame: 0, durationFrames: 60, layers: [
          { id: 'h', type: 'text', content: 'Proof', x: 540, y: 460, fontSize: 173, maxWidth: 800, textAlign: 'center', color: '#ffffff' },
          { id: 's', type: 'text', content: 'Calm design', x: 540, y: 689.6, fontSize: 86, maxWidth: 800, textAlign: 'center', color: '#ffffff' },
        ] },
        { id: 'b', name: 'B', startFrame: 60, durationFrames: 60, layers: [
          { id: 'x', type: 'text', content: 'Ride more.', x: 40, y: 40, fontSize: 64, color: '#ffffff' },
        ] },
      ],
    });
    const motionPlan = { beats: [{ name: 'Proof', onScreen: 'Calm design, premium security' }, { name: 'Call to action', onScreen: 'Ride more.' }] };
    const { result } = await run([raw], transit, { motionPlan });
    const [headline, subline] = result.composition.scenes[0].layers;
    expect(headline.content).toBe('Calm design, premium security');
    expect(headline.fontSize).toBeLessThan(173);                       // shrank to fit the line it now says
    expect(subline.y).toBeGreaterThanOrEqual(headline.y + 3 * headline.fontSize! * 1.2);   // three lines of room
  });

  it('leaves a video alone that already says it', async () => {
    const { result } = await run([reply({ id: 'a', texts: ['2.3 million trips'] }, { id: 'b', texts: ['Ride more.'] })]);
    expect(lines(result)).toEqual([['2.3 million trips'], ['Ride more.']]);
    expect(result.warnings.join(' ')).not.toContain('required line');
  });

  it('refuses to repair in strict mode, where the answer has to be right as it came', async () => {
    await expect(run([reply({ id: 'a', texts: ['one'] }, { id: 'b', texts: ['two'] })], transit, { strict: true })).rejects.toThrow(/Strict mode/);
  });
});
