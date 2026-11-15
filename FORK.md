# Hvergelmir office engine

Fork of [`openinterpreter/oo-editors`](https://github.com/openinterpreter/oo-editors), which bundles
ONLYOFFICE `sdkjs` + `web-apps` behind a small Express server. The Hvergelmir desktop app uses it as a
**local, Windows-only** editor for `.docx` / `.xlsx` / `.pptx` files that live on the user's own disk.

Upstream tag this fork tracks: **v1.0.40**. Licence: AGPL-3.0, unchanged (see `LICENSE`).

## Why the fork exists

Upstream serves the editor on `0.0.0.0` and accepts `GET /open?filepath=<any path>` from anyone, with
`Access-Control-Allow-Origin: *`. That is fine for a single-user demo on a trusted machine; it is not
acceptable inside a desktop app that can open a document from `C:\Users\...\Documents`. Any other program
— or any web page the user visits — could drive the local server to read a document or overwrite it.

The fix has to live inside the process, so it lives here.

## What changed, and why

| Change | Reason |
| --- | --- |
| `app.listen(PORT, BIND_HOST)` with `OO_EDITOR_BIND_HOST` default `127.0.0.1` | Never reachable from the network, even when the firewall is off. |
| `OO_EDITOR_ACCESS_TOKEN`: `/open` requires `?token=`, then sets an `HttpOnly; SameSite=Lax` cookie that every later request must carry | The host generates a fresh token per run. Loopback is shared with every other process and page on the machine, so address alone is not authentication. |
| `Access-Control-Allow-Origin` reflects only the editor's own origin | A wildcard let any website read the server's responses; nothing legitimate needs it, since page and assets share one origin. |
| `OO_EDITOR_KILL_PORT_ON_CONFLICT` defaults to **false** | We pick a free port per run. Evicting the current holder could only ever kill an unrelated process. |
| `BASE_URL` and the loader/document URLs all use one host (`BIND_HOST`) | Mixed `localhost` / `127.0.0.1` broke the cookie, which is host-scoped. |
| Version `1.0.40-hvergelmir.N` | The app pins exact engine builds; upstream version alone would make our builds indistinguishable. |
| `scripts/build-release.mjs` | Reproducible artifact: upstream release zip (sha256 pinned) + a `server.js` bundle built from **this** repo. |

Without `OO_EDITOR_ACCESS_TOKEN` the server behaves exactly like upstream — that is what upstream's own
tests and a bare `bun start` rely on.

## Build the artifact the desktop app downloads

```bash
npm install                       # only for local runs/tests
node scripts/build-release.mjs    # -> dist/hvergelmir-office-engine-windows-x64-<version>.tar.gz + .json
```

The script downloads the pinned upstream asset, verifies its sha256, unpacks it, replaces `server.js` with a
bundle built from this repo, and writes a `.json` next to the archive with `bytes` + `sha256`. Editors,
converter and `node_modules` are upstream's — untouched.

The archive is a `.tar.gz` rather than a zip because Windows has shipped bsdtar in `System32` since 1803:
the app extracts it with `tar` and we never carry a zip parser into the product. The desktop app pins
`version` + `sha256` in its own source and verifies the download before extracting; the `.json` is for
operators, not an input.

Do **not** rebuild the SDK (`npm run build`): it needs a full grunt build of `sdkjs` per editor and upstream
already ships the output.

## How the desktop app runs it

`ELECTRON_RUN_AS_NODE=1` with the app's own Electron binary, `PORT` chosen by the host, `OO_EDITOR_ACCESS_TOKEN`
generated per run, `FONT_DATA_DIR` pointing at the extracted `assets/onlyoffice-fontdata`. The host waits on
`/healthcheck` and opens `http://127.0.0.1:<port>/open?filepath=<path>&token=<token>` in a sandboxed
`WebContentsView`. Saving is `POST /api/save?filepath=<path>` from inside the editor page.

## Licence notes

AGPL-3.0 travels with this fork: `LICENSE`, `NOTICE` and the upstream copyright headers stay as they are. Any
change deployed to users must have its source available — which is this repository.
