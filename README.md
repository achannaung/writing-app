# Writing App

A quiet, single-purpose place to write — with auto-text shortcuts for Myanmar township and town names.

No accounts, no backend, no analytics. Text is stored in the browser's `localStorage` and never uploaded.

## Features

- **Distraction-free editor** with a live word and character count.
- **Auto text**: 454 place-name phrases (286 townships and 168 towns) plus your own. Type the first few letters of a name (or a shortcut such as `pro-res/`), then click a suggestion or press `Alt+1`–`Alt+5`.
- **Autosave** with a visible save status, plus debounced writes and a flush when the tab closes.
- **Recent entries**: save snapshots of your draft and reopen them; up to 30 are kept.
- **Export**: download the draft as `.txt`, or back up/restore everything (draft, auto text, recent entries) as JSON.
- **Light and dark mode** following the system setting.
- **Accessible basics**: keyboard-reachable controls, visible focus rings, AA-contrast text, labels for inputs.
- **No build step** and no runtime dependencies.

## Run locally

Any static file server works:

```sh
npm run serve        # or: python3 -m http.server 4173
# open http://localhost:4173
```

Opening `index.html` directly from the filesystem also works, but file downloads and clipboard access can be restricted by the browser.

## Auto-text data

`phrases.json` is the source of truth:

```json
{
  "version": 2,
  "phrases": [
    { "text": "pro-resistance media reported that", "trigger": "pro-res/" },
    { "text": "Sagaing Township (Sagaing Region)" }
  ]
}
```

`trigger` is optional. Use it only when the shortcut is not the first word of the phrase.

After editing `phrases.json`, regenerate the inline block in `index.html`:

```sh
npm run sync
npm run verify
```

`verify` also checks for duplicate phrases, invisible/control characters, over-long entries, towns whose parent township is missing, township/town region mismatches, duplicate triggers, and a stale `index.html`.

`version` controls seed merging: bump it when you add phrases, and they will be merged into existing users' lists once. Deleting a seeded phrase is permanent — the app records it and will not re-add it.

### Data notes

The place names were compiled from Myanmar township and town lists. The following corrections were applied on top of the original seed data:

- Removed a zero-width non-joiner from "Aungmyaythazan".
- Fixed spelling variants: `Thantlang`, `Langkho`, `Bawlakhe`, `Mawlamyine`.
- Fixed "aridropped" → "airdropped".
- Added 23 missing parent townships (e.g. Pyay, Tamu, Phyu, Yegyi, Thegon, Loilen), so every town resolves to a township.
- Replaced the two duplicated trigger maps with a single optional `trigger` field; other phrases match by prefix, which also fixes shortcuts that could never match (`PDF/`).

Place names are still worth checking against an authoritative source before publishing.

## Deploy

The app is static, so Vercel, GitHub Pages, Netlify, or Cloudflare Pages all work. `vercel.json` sets a strict Content-Security-Policy and other security headers.

> The previous demo URL in this repo's About section (`writing-app-pi-five.vercel.app`) returned `DEPLOYMENT_NOT_FOUND` when checked. Re-link the Vercel project after deploying, and update the URL here.

## Privacy and durability

- All content stays in the browser. There is no server, no sync, and no tracking.
- Browser storage is not permanent. Safari can evict script-writable storage after about seven days of non-use, and "clear browsing data" removes everything.
- Use **Back up** regularly. The app warns when storage is full or unavailable (for example, in private windows) instead of silently failing.

## Keyboard

| Key | Action |
| --- | --- |
| `Alt+1` … `Alt+5` | Insert the corresponding auto-text suggestion |
| `Esc` | Dismiss the suggestion bar (it does not clear your text) |
| `Ctrl/Cmd+Z` | Undo, including after inserting auto text or clearing |

## Roadmap

- Search across saved entries, titles, pinning.
- IndexedDB storage and a service worker for offline install.
- Import/export of individual documents.
- Optional Burmese UI and a character-based word count mode.

## License

MIT — see [LICENSE](LICENSE).
