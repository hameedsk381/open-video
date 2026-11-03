import { Audio, Img, Sequence, Video } from '@ove/react';
import './media-fixture.css';

// A React video that brings its own sound and footage with Audio and Video, and imports a stylesheet.
export const config = { id: 'media', width: 320, height: 180, fps: 30, durationInFrames: 60, background: '#101820', assets: [{ id: 'clip', type: 'video', src: 'clip.mp4' }] };

export default function Media() {
  return (
    <div>
      <Video src="clip" volume={0.5} />
      <Audio src="sfx:whoosh" />
      <Sequence from={20} durationInFrames={15} layout="none"><Audio src="sfx:ding" volume={2} startFrom={3} /></Sequence>
      <Img src="clip" className="from-css" />
    </div>
  );
}
