// The desktop shell (apps/desktop) exposes window.motionrender.desktop; the browser build of the studio does not. This is the
// whole of the page's knowledge of the difference: the card in the sidebar offers the folder's real path and the two native
// actions a browser cannot give, and everything else in the studio stays identical.
export type DesktopProject = { path: string; name: string };

export type DesktopState = {
  version: string;
  projectRoot: string;
  recent: string[];
  packaged: boolean;
  logDir: string;
  logFile: string;
  tools: { dir: string | null; ffmpeg: boolean; ffprobe: boolean; chromium: boolean };
};

export type DesktopBridge = {
  version: number;
  getState(): Promise<DesktopState>;
  openProjectFolder(): Promise<DesktopState>;
  revealProjectFolder(): void;
  openLogFolder(): void;
  newVideo(): void;
  onState(callback: (state: DesktopState) => void): () => void;
};

export const desktop: DesktopBridge | undefined = (globalThis as { motionrender?: { desktop?: DesktopBridge } }).motionrender?.desktop;

export const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
