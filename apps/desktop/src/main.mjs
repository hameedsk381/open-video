// MotionRender Studio as a desktop app: a native window around the studio the CLI already serves. The shell owns no video
// logic. It starts one `ai studio` server for the chosen project folder on a loopback port, loads the built studio from it,
// and gives the window the two things a browser cannot: the folder's real path, and shutdown that takes the server with it.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioServer } from './server.mjs';
import { readSettings, rememberProject, samePath, writeSettings } from './settings.mjs';
import { toolEnv, toolReport } from './tools.mjs';
import { cleanTheme, shellPalette, themeChoices } from './theme.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const repoRoot = resolve(appRoot, '..', '..');
const smoke = process.argv.includes('--smoke');
const version = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).version;

const toolsDir = app.isPackaged ? join(process.resourcesPath, 'tools') : join(appRoot, 'resources', 'tools');
const userData = app.getPath('userData');
const logDir = join(userData, 'logs');
const settingsFile = join(userData, 'settings.json');
const settings = readSettings(settingsFile, { projectRoot: join(app.getPath('documents'), 'MotionRender Studio') });

// An app opened from Explorer starts without the shell's environment, so the provider keys come from a .env in userData.
// The engine reads them itself, and every render job inherits them. Without one the studio runs on the offline mock.
// A development run also reads the repository's .env, so `pnpm dev:desktop` uses the same provider as the CLI.
for (const file of [join(userData, '.env'), ...(app.isPackaged ? [] : [join(repoRoot, '.env')])]) {
  if (!existsSync(file)) continue;
  try { process.loadEnvFile?.(file); } catch (error) { console.error(`Could not read ${file}: ${error.message}`); }
}

const server = new StudioServer({ repoRoot, packaged: app.isPackaged, env: toolEnv(toolsDir), logDir, port: 3123 });
let win = null;
let switching = false;
let leaving = false;

const state = () => ({
  version,
  projectRoot: server.root ?? settings.projectRoot,
  recent: settings.recent,
  packaged: app.isPackaged,
  logDir,
  logFile: join(logDir, 'studio.log'),
  tools: toolReport(toolsDir),
});

// The shell's own surfaces follow the studio's theme (light unless the person chose otherwise).
const palette = () => shellPalette(settings.theme, nativeTheme.shouldUseDarkColors);

const escapeHtml = text => String(text).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));

// A page that says what is happening while the server starts or restarts, drawn in the studio's own colours so the window
// never flashes a colour the studio does not use.
function messagePage(title, detail) {
  const color = palette();
  const html = `<!doctype html><meta charset="utf-8"><title>MotionRender Studio</title>
<style>
  html,body{height:100%;margin:0;background:${color.background};color:${color.text};font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
  main{height:100%;display:grid;place-items:center;padding:32px;box-sizing:border-box;text-align:center}
  .brand{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${color.faint};margin-bottom:14px}
  h1{font-size:18px;font-weight:500;letter-spacing:-.02em;margin:0 0 8px}
  p{max-width:560px;margin:0 auto;color:${color.muted};white-space:pre-wrap}
  .dot{width:7px;height:7px;border-radius:50%;background:${color.ink};display:inline-block;margin-right:8px;animation:pulse 1.2s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.25}}
</style>
<main><div><div class="brand">MotionRender Studio</div><h1><span class="dot"></span>${escapeHtml(title)}</h1><p>${escapeHtml(detail ?? '')}</p></div></main>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

const loadingPage = () => messagePage('Starting the studio', 'The local server is coming up. This takes a moment on the first run.');
const errorPage = (message) => messagePage('The studio server stopped', `${message}\n\nUse File → Open Project Folder to try again, or quit and reopen MotionRender Studio.`);

function createWindow() {
  const iconPath = join(appRoot, 'resources', 'icon.png');
  const window = new BrowserWindow({
    width: settings.bounds?.width ?? 1280,
    height: settings.bounds?.height ?? 820,
    x: settings.bounds?.x,
    y: settings.bounds?.y,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: palette().background,
    title: 'MotionRender Studio',
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  if (settings.maximized) window.maximize();

  const allow = (url) => url.startsWith('data:') || Boolean(server.origin && url.startsWith(`${server.origin}/`)) || url === server.origin;
  window.webContents.on('will-navigate', (event, url) => {
    if (allow(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  // The window is the product's name, not whichever project is open.
  window.on('page-title-updated', event => { event.preventDefault(); window.setTitle('MotionRender Studio'); });

  window.webContents.on('did-finish-load', () => void rememberTheme());
  window.webContents.on('did-navigate-in-page', () => void rememberTheme());
  if (!smoke) window.once('ready-to-show', () => window.show());
  window.on('close', () => {
    if (window.isMinimized()) return;
    settings.maximized = window.isMaximized();
    if (!settings.maximized) settings.bounds = window.getNormalBounds();
    writeSettings(settingsFile, settings);
  });
  return window;
}

// Reads the studio's theme from its page and keeps it, so the next launch (and any page the shell draws itself) matches.
async function rememberTheme() {
  if (!win || win.isDestroyed() || !server.origin || !win.webContents.getURL().startsWith(server.origin)) return;
  try {
    const stored = await win.webContents.executeJavaScript("localStorage.getItem('ove-theme')");
    const theme = themeChoices.includes(stored) ? stored : cleanTheme(undefined);
    if (theme !== settings.theme) { settings.theme = theme; writeSettings(settingsFile, settings); win.setBackgroundColor(palette().background); }
  } catch { /* the page is going away; the next launch uses what was kept */ }
}

function go(hash) {
  if (!win || !server.origin) return;
  if (!win.webContents.getURL().startsWith(server.origin)) return;
  void win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
}

async function revealProject() {
  const root = server.root ?? settings.projectRoot;
  const error = await shell.openPath(root);
  if (error) void dialog.showMessageBox({ type: 'warning', message: 'Could not open the project folder', detail: error });
}

async function openLogs() {
  const error = await shell.openPath(logDir);
  if (error) void dialog.showMessageBox({ type: 'warning', message: 'Could not open the log folder', detail: error });
}

async function switchProject(root) {
  if (switching || !win) return;
  if (samePath(root, server.root)) return;
  if (await server.busy()) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Switch Folder', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Open “${basename(root)}”?`,
      detail: `The studio is working on ${server.root}. Running jobs stop when you switch; files are kept.`,
    });
    if (response !== 0) return;
  }
  switching = true;
  try {
    await win.loadURL(loadingPage());
    rememberProject(settings, root);
    writeSettings(settingsFile, settings);
    await server.restart(root);
    buildMenu();
    await win.loadURL(server.url);
    win.webContents.send('desktop:state-changed', state());
  } catch (error) {
    await win.loadURL(errorPage(error instanceof Error ? error.message : String(error)));
    void dialog.showMessageBox(win, { type: 'error', message: 'Could not open that folder', detail: String(error instanceof Error ? error.message : error) });
  } finally {
    switching = false;
  }
}

async function chooseProject() {
  if (!win || switching) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Choose a project folder',
    defaultPath: server.root ?? settings.projectRoot,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Open Folder',
  });
  if (canceled || !filePaths[0]) return;
  await switchProject(filePaths[0]);
}

function openRecent(root) {
  void switchProject(root);
}

async function restartStudio() {
  if (switching || !win) return;
  switching = true;
  try {
    await win.loadURL(loadingPage());
    await server.restart(server.root ?? settings.projectRoot);
    await win.loadURL(server.url);
  } catch (error) {
    await win.loadURL(errorPage(error instanceof Error ? error.message : String(error)));
  } finally {
    switching = false;
  }
}

function buildMenu() {
  const recent = settings.recent.length
    ? settings.recent.map(root => ({ label: root, click: () => openRecent(root) }))
    : [{ label: 'No folders yet', enabled: false }];
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Video', accelerator: 'CmdOrCtrl+N', click: () => go('#/new') },
        { label: 'Open Project Folder…', accelerator: 'CmdOrCtrl+O', click: () => void chooseProject() },
        { label: 'Open Recent', submenu: recent },
        { type: 'separator' },
        { label: 'Reveal Project Folder', click: () => void revealProject() },
        { label: 'Open Log Folder', click: () => void openLogs() },
        { type: 'separator' },
        { label: 'Restart Studio Server', click: () => void restartStudio() },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: `MotionRender Studio ${version}`, enabled: false },
        { label: 'Open Log Folder', click: () => void openLogs() },
        { label: 'Check Server Status', click: () => void runSmokeFromMenu() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function runSmokeFromMenu() {
  if (!win) return;
  const healthy = await server.healthy();
  await dialog.showMessageBox(win, {
    type: healthy ? 'info' : 'error',
    message: healthy ? 'The studio server is healthy.' : 'The studio server is not answering.',
    detail: state().projectRoot,
  });
}

function registerIpc() {
  ipcMain.handle('desktop:state', () => state());
  ipcMain.handle('desktop:open-project', async () => {
    await chooseProject();
    return state();
  });
  ipcMain.on('desktop:reveal', () => void revealProject());
  ipcMain.on('desktop:open-logs', () => void openLogs());
  ipcMain.on('desktop:new-video', () => go('#/new'));
}

async function boot() {
  win = createWindow();
  await win.loadURL(loadingPage());
  buildMenu();
  server.onExit = (code, signal, tail) => {
    if (leaving || switching) return;
    void win.loadURL(errorPage(`It exited with ${signal ?? code}.\n\n${tail.slice(-1200)}`));
    void dialog.showMessageBox(win, {
      type: 'error',
      buttons: ['Restart', 'Open Log Folder', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      message: 'The studio server stopped unexpectedly',
      detail: [tail.trim().split('\n').slice(-8).join('\n'), '', `Log: ${join(logDir, 'studio.log')}`].join('\n'),
    }).then(async ({ response }) => {
      if (response === 0) await restartStudio();
      else if (response === 1) await openLogs();
      else app.quit();
    });
  };
  try {
    await server.start(settings.projectRoot);
  } catch (error) {
    await win.loadURL(errorPage(error instanceof Error ? error.message : String(error)));
    return;
  }
  rememberProject(settings, settings.projectRoot);
  writeSettings(settingsFile, settings);
  await win.loadURL(server.url);
}

async function smokeRun() {
  const started = Date.now();
  const root = join(app.getPath('temp'), 'motionrender-studio-smoke');
  const fail = async (message) => {
    console.error(`SMOKE FAILED after ${((Date.now() - started) / 1000).toFixed(1)}s: ${message}`);
    await server.stop();
    app.exit(1);
  };
  const timer = setTimeout(() => { void fail('timed out after 120 s'); }, 120_000);
  try {
    win = createWindow();
    await server.start(root);
    await win.loadURL(server.url);
    const probe = await win.webContents.executeJavaScript(`(async () => {
      const bridge = window.motionrender && window.motionrender.desktop;
      const state = bridge ? await bridge.getState() : null;
      const health = await fetch('/healthz').then(response => response.json()).catch(error => ({ error: String(error) }));
      return {
        bridge: Boolean(bridge),
        state,
        health,
        title: document.title,
        sidebar: Boolean(document.querySelector('.sidebar')),
        folderCard: Boolean(document.querySelector('.folder-card')),
        navItems: document.querySelectorAll('.side-nav a').length,
      };
    })()`);
    const ok = probe.bridge && probe.health?.ok && probe.sidebar && probe.folderCard && probe.navItems >= 5 && probe.state?.projectRoot === root;
    const report = { ok, seconds: Number(((Date.now() - started) / 1000).toFixed(1)), server: server.url, tools: toolReport(toolsDir), ...probe };
    console.log(`SMOKE ${ok ? 'OK' : 'FAILED'}`);
    console.log(JSON.stringify(report, null, 2));
    clearTimeout(timer);
    await server.stop();
    app.exit(ok ? 0 : 1);
  } catch (error) {
    clearTimeout(timer);
    await fail(error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error));
  }
}

if (!app.requestSingleInstanceLock()) {
  console.error('MotionRender Studio is already running.');
  app.exit(1);
} else {
  app.setAppUserModelId('com.motionrender.studio');
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  registerIpc();
  app.whenReady().then(() => (smoke ? smokeRun() : boot()));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && !smoke) void boot(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (leaving) return;
    event.preventDefault();
    leaving = true;
    void rememberTheme().finally(() => server.stop()).finally(() => app.quit());
  });
}
