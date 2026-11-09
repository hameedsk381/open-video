import { inflateSync } from 'node:zlib';
// A tiny glTF binary built in memory for the model-layer tests: a red box (1 × 0.4 × 0.4, so turning it is visible) that spins once about the
// vertical axis in one second under the animation name "Turn". No file is committed; the bytes are made here.
export function makeGlb(options: { animated?: boolean } = {}): Buffer {
  const w = 0.5, h = 0.2, d = 0.2;
  const positions = new Float32Array([-w, -h, -d, w, -h, -d, w, h, -d, -w, h, -d, -w, -h, d, w, -h, d, w, h, d, -w, h, d]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3]);
  const times = new Float32Array([0, 0.5, 1]);
  const turns = new Float32Array([0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1]);
  const parts = options.animated === false ? [positions, indices] : [positions, indices, times, turns];
  const bytes = Buffer.concat(parts.map(part => Buffer.from(part.buffer, part.byteOffset, part.byteLength)));
  const lengths = parts.map(part => part.byteLength), offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  const json: Record<string, unknown> = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Box' }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.1, 0.1, 1], metallicFactor: 0, roughnessFactor: 0.6 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    buffers: [{ byteLength: bytes.length }],
    bufferViews: parts.map((_, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: lengths[i] })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-w, -h, -d], max: [w, h, d] },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
      ...(options.animated === false ? [] : [{ bufferView: 2, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [1] }, { bufferView: 3, componentType: 5126, count: 3, type: 'VEC4' }]),
    ],
    ...(options.animated === false ? {} : { animations: [{ name: 'Turn', samplers: [{ input: 2, output: 3, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }] }),
  };
  const pad = (data: Buffer, fill: number) => Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20), binChunk = pad(bytes, 0);
  const header = Buffer.alloc(12), jsonHead = Buffer.alloc(8), binHead = Buffer.alloc(8);
  header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  jsonHead.writeUInt32LE(jsonChunk.length, 0); jsonHead.write('JSON', 4, 'ascii');
  binHead.writeUInt32LE(binChunk.length, 0); binHead.write('BIN\0', 4, 'ascii');
  return Buffer.concat([header, jsonHead, jsonChunk, binHead, binChunk]);
}

/** Decodes an 8-bit RGBA or RGB PNG (what the renderer writes) into pixels, so tests can look at colours. */
export function decodePng(png: Buffer): { width: number; height: number; data: Uint8Array } {
  
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), channels = png[25] === 6 ? 4 : 3, idat: Buffer[] = [];
  for (let at = 8; at < png.length;) { const size = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8); if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + size)); at += 12 + size; }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, out = new Uint8Array(width * height * 4), prev = new Uint8Array(stride), line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!, a = x >= channels ? line[x - channels]! : 0, b = prev[x]!, c = x >= channels ? prev[x - channels]! : 0;
      const guess = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })();
      line[x] = (value + guess) & 255;
    }
    for (let x = 0; x < width; x++) for (let k = 0; k < 4; k++) out[(y * width + x) * 4 + k] = k < channels ? line[x * channels + k]! : 255;
    prev.set(line);
  }
  return { width, height, data: out };
}
