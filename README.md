# Chess.com → Lichess Import

> A Tampermonkey userscript that adds a one-click "Lichess Import" button to the Chess.com sidebar, automatically extracting the current game's PGN and opening it on Lichess.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-compatible-blue)](https://www.tampermonkey.net/)

---

## Why This Exists

Analyzing a Chess.com game on Lichess requires manually downloading a PGN, navigating to Lichess, and uploading it. This script eliminates all of that — one click and you're there.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open the Tampermonkey dashboard and click **Create a new script**.
3. Delete the default content, then paste the full contents of [`chesscom-to-lichess-import.js`](chesscom-to-lichess-import.js).
4. Press **Ctrl+S** (or **Cmd+S**) to save.
5. Navigate to any Chess.com game or analysis page — the button appears immediately.

## How It Works

The script inserts a **Lichess Import** button above the Search entry in the Chess.com left sidebar. The button is only shown on `/game/*` and `/analysis/*` pages. It handles two scenarios automatically:

**Scenario 1 — Share icon** (live games and most game pages)

The script clicks the Share icon in the sidebar, waits for the Share dialog to open, selects the PGN tab, reads the PGN text, and closes the dialog.

**Scenario 2 — Analyze → More → Share game** (analysis pages without a Share icon)

The script clicks the Analyze button, then the "..." (more) button that appears, then the "Share game" menu item, and reads the PGN from the resulting dialog.

Both paths use Lichess's public import API (`POST https://lichess.org/api/import`). No authentication or API tokens are required.

## Compatibility

| Browser | Extension |
|---------|-----------|
| Chrome / Chromium | Tampermonkey, Violentmonkey |
| Firefox | Tampermonkey, Violentmonkey, Greasemonkey |
| Edge | Tampermonkey, Violentmonkey |

The script uses `GM_xmlhttpRequest` and `GM_addStyle` — both available in Tampermonkey and Violentmonkey. Greasemonkey 4+ supports these as well but is less tested.

## Features

- One-click PGN extraction and import — no manual download needed
- Handles both Share icon and Analyze→Share flows automatically
- Button blends into the native Chess.com sidebar design
- Keyboard accessible (`focus-visible` outline, proper `disabled` state)
- No API tokens, no login, no data stored locally
- Falls back to a form-based POST if the API call fails

## Disclaimer

This is an unofficial tool with no affiliation with Chess.com or Lichess. Use it for your own games only — it is not intended for bulk import or scraping. Use at your own risk.

## Contributing

Pull requests and issues are welcome. Keep in mind that Chess.com redesigns can break the CSS selectors and DOM traversal this script relies on — if something stops working after a Chess.com update, a bug report or fix PR is the fastest path to a repair.

To contribute:

1. Fork the repository.
2. Make your changes in `chesscom-to-lichess-import.js`.
3. Test on both `/game/*` and `/analysis/*` pages, covering both share scenarios.
4. Open a pull request with a clear description of what changed and why.

## License

MIT © [Aleksei Blinov](https://github.com/puhhh)
