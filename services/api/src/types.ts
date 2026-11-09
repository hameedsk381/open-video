import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JobKind } from '@ove/contracts';
import type { JobQueue, JobRequest } from '@ove/jobs';
import type { AiSettingsStore, FsProjectStore, Principal, StockSettingsStore } from '@ove/storage';
import type { StockOptions } from './stock';

/** Works out who is asking. Local use is always the one local person; a hosted setup reads a session. */
export interface Auth {
  authenticate(req: IncomingMessage): Promise<Principal | undefined>;
  /** Extra routes the login system needs (sign up, sign in, sign out, ...). They run before sign-in is required. */
  routes?(): Route[];
}

/** Limits per person. Each throws an Error the person sees, so the answer is a plain sentence. */
export interface Quotas {
  beforeJob(who: Principal, kind: JobKind): Promise<void>;
  beforeProject(who: Principal, existing: number): Promise<void>;
  beforeUpload(who: Principal, bytes: number): Promise<void>;
}

/** What the studio shows in its library: scene blocks and themes. They ship with the command line, so the caller supplies them. */
export type ApiLibrary = {
  listBlocks(): Promise<any[]>;
  listThemes(): Promise<any[]>;
  readBlock(id: string): Promise<any>;
  readTheme(id: string): Promise<any>;
  addBlock(raw: any, block: any, options: { at?: number; frames?: number; scene?: string; set?: Record<string, unknown> }): { composition: any; placed: string; where: string; files: string[] };
  /** The bytes of a support file a block draws from (named in the result of addBlock). */
  blockFile(file: string): Promise<Buffer>;
  applyTheme(raw: any, theme: any): any;
  emptyComposition(name: string, width: number, height: number, fps: number): any;
  themeTokens: readonly string[];
};

/** Files the browser Player loads next to itself. */
export type PlayerFiles = { script(): Promise<string>; /** p5.js, for videos with p5 layers; served beside the Player. */ p5?(): Promise<string>; /** three.js, for videos with 3D model layers; served beside the Player. */ three?(): Promise<string>; sound(name: string): Promise<Buffer | undefined>; font(path: string): Promise<Buffer | undefined> };

export type AppDeps = {
  /** Local: one person, loopback only, Chromium work may run in this process. Hosted: sign-in required, work only through the queue. */
  mode: 'local' | 'hosted';
  store: FsProjectStore;
  queue: JobQueue;
  /** Refuses a bad job request now; the job itself runs wherever the queue runs it. */
  validate(request: JobRequest): void;
  auth: Auth;
  quotas?: Quotas;
  library: ApiLibrary;
  player: PlayerFiles;
  /** Draws a thumbnail in this process (local mode only). */
  makeThumbnail(raw: any, values: Record<string, unknown>, baseDir: string, options: { width?: number }): Promise<{ png: Buffer }>;
  providerState(): { provider: unknown; error: string | null };
  /** Hosted: each person's own AI connection. Without it (local use) the machine's own provider is used. */
  aiSettings?: AiSettingsStore;
  /** Each person's own keys for stock libraries, and (for tests) where those libraries live. */
  stockSettings?: StockSettingsStore;
  stock?: Partial<StockOptions>;
  /** The built web app, and the plain page to show when there is none. */
  app: { dir: string; fallbackPage: string };
  /** Host names the server answers to besides loopback, and the one origin that may change things (hosted behind TLS). */
  allowHosts?: string[];
  publicPort?: number;
  publicOrigin?: string;
  /** Stores the page may load files from for the Player (pictures, video) are under /files/, always. */
};

export const ANONYMOUS: Principal = { userId: 'anonymous', tenantId: 'anonymous' };

export type Route = {
  method: 'GET' | 'POST';
  /** An exact path, or a prefix when it ends with `*`. */
  path: string;
  /** Reachable without signing in. */
  open?: boolean;
  handle(c: Ctx): Promise<void>;
};

export type Ctx = {
  req: IncomingMessage; res: ServerResponse; url: URL; deps: AppDeps;
  /** Who is asking. On an open route with nobody signed in it is ANONYMOUS, which no stored data belongs to. */
  who: Principal;
  signedIn: boolean;
  json(status: number, body: unknown, headers?: Record<string, string | string[]>): void;
  send(status: number, type: string, body: string | Buffer): void;
  /** The request body as a JSON object (refuses anything else). */
  body(): Promise<Record<string, any>>;
};
