import { AbsoluteFill } from '@ove/react';

// One line of text in whichever family the layer's props name, with no stylesheet of its own: whether the family draws as itself is
// up to the renderer.
export const config = { id: 'font-fixture', width: 900, height: 140, fps: 30, durationInFrames: 1, props: { family: 'Inter' } };

export default function Video({ family }: { family: string }) {
  return (
    <AbsoluteFill style={{ background: '#ffffff', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontFamily: `"${family}", serif`, fontSize: 64, fontWeight: 400, color: '#000000', whiteSpace: 'nowrap' }}>Hamburgefonstiv 0123 Rag</div>
    </AbsoluteFill>
  );
}
