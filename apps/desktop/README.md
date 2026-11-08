# MotionRender Studio, as a desktop app

The studio in a native window. The shell owns no video logic: it starts one `ai studio` server for the chosen project folder on a
loopback port (`127.0.0.1`, 3123 when free), loads the built studio from it, and gives the window two things a browser cannot: the
folder's real path, and a shutdown that takes the server with it.

```sh
pnpm build:studio        # the window shows the built studio (packages/cli/studio)
pnpm dev:desktop         # opens the window; a development run uses the machine's own ffmpeg and Chromium
pnpm --filter @ove/desktop smoke   # starts the server inside Electron and checks it: health, the bridge, the sidebar and folder card
```

- **Projects** live in `Documents/MotionRender Studio` unless you choose another folder (File, Open Project Folder). Recent folders are remembered.
- **Provider keys** come from a `.env` in the app's user-data folder when the app is opened from the file manager (the shell's environment is
  not inherited). A development run also reads the repository's `.env`. With no key the studio runs on the offline mock.
- **Look.** The window follows the studio's design (light by default). The surfaces the shell draws itself, the window behind the page and the
  pages shown while the server starts or stops, use the studio's colours; the theme you chose in the studio is read back from the page and kept in
  `settings.json`, so the next launch opens in it without a flash of another colour.
- **Logs** are written to `logs/studio.log` in the user-data folder (File, Open Log Folder).
- **Packaged builds** carry ffmpeg, ffprobe and Chromium. `pnpm --filter @ove/desktop fetch-tools` puts them in `resources/tools`
  (it reuses the engine's ffmpeg downloads and Playwright's Chromium); that folder and `release/` are ignored by git. `pnpm --filter @ove/desktop build`
  runs electron-builder.

## What the page can reach

The window is sandboxed, with context isolation on and Node integration off, and it may only navigate to its own server (other links open in
the browser). The preload exposes one object, `window.motionrender.desktop`, with `getState`, `openProjectFolder`, `revealProjectFolder`,
`openLogFolder`, `newVideo` and `onState`. None takes a path from the page: opening a folder is a native dialog the person answers.

## Checked, and not

Checked: the smoke run passes on Windows (server healthy, bridge present, sidebar and folder card drawn, bundled tools found). Not
checked: an installer built with `electron-builder`, macOS or Linux, signing and auto-update (there is none).
