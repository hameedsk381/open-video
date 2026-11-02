// The canvas drawing runtime, generated at build time from canvasRuntimeSource in @ove/graphics (see bundle.ts), so the Player draws
// with exactly the code the renderer uses.
declare module 'ove:canvas-runtime' {
  export type CanvasRuntime = {
    canvas: HTMLCanvasElement;
    images: Map<string, HTMLImageElement>;
    load(sources: Record<string, string>, fonts: { family: string; src: string; url: string; weight: number | string; style: string; unicodeRange?: string }[]): Promise<void>;
    draw(payload: { width: number; height: number; background?: unknown; transparent?: boolean; grain?: number; frame?: number; operations: unknown[]; videoFrames?: Record<string, string> }, drawables?: Map<string, CanvasImageSource>): Promise<void>;
  };
  export function createCanvasRuntime(canvas: HTMLCanvasElement, measurePath: SVGPathElement): CanvasRuntime;
}
