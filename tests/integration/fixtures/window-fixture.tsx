import { Audio } from '@ove/react';

// Reads window while rendering, which the build's Audio/Video scan cannot do in Node.
export const config = { id: 'win', width: 100, height: 100, durationInFrames: 10 };
export default function Win() { return <div style={{ width: (window as any).innerWidth }}><Audio src="sfx:pop" /></div>; }
