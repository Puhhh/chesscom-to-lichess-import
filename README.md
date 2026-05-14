# Chess.com → Lichess Import

> A Tampermonkey userscript that adds a one-click "Lichess Import" button to the Chess.com sidebar, automatically extracting the current game's PGN and opening it on Lichess.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-compatible-blue)](https://www.tampermonkey.net/)

---

## Why This Exists

Analyzing a Chess.com game on Lichess requires manually downloading a PGN, navigating to Lichess, and uploading it. This script eliminates that manual copy-paste flow.

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

Both paths save the extracted PGN in userscript storage, open `https://lichess.org/paste`, then submit Lichess's own import form from that Lichess tab. This avoids Chess.com's cross-origin form restrictions. The Lichess API import endpoint is not used because current Lichess API documentation shows it as token-authenticated.

## Compatibility

| Browser | Extension |
|---------|-----------|
| Chrome / Chromium | Tampermonkey, Violentmonkey |
| Firefox | Tampermonkey, Violentmonkey, Greasemonkey |
| Edge | Tampermonkey, Violentmonkey |

The script uses `GM_addStyle`, `GM_setValue`, `GM_getValue`, `GM_deleteValue`, and `GM_openInTab`, which are available in Tampermonkey and Violentmonkey. Greasemonkey 4+ supports similar APIs but is less tested.

## Features

- One-click PGN extraction and import — no manual download needed
- Handles both Share icon and Analyze→Share flows automatically
- Button blends into the native Chess.com sidebar design
- Keyboard accessible (`focus-visible` outline, proper `disabled` state)
- No API tokens and no login required; PGN is stored only temporarily while opening the Lichess tab
- Uses Lichess's public import form instead of a token-authenticated API call
- Avoids cross-origin form submission from Chess.com by completing the import on `lichess.org/paste`

## Troubleshooting

If the button does not appear, confirm you are on a Chess.com `/game/*` or `/analysis/*` page. The script intentionally hides the button on other pages.

If the script reports that PGN was not found, Chess.com may have changed the Share dialog or menu selectors. Re-test both the Share icon path and the Analyze → More → Share game path before changing selectors.

If Lichess opens but does not import the game, confirm the userscript is allowed to run on `https://lichess.org/paste`. Then paste the same PGN into <https://lichess.org/paste>. If manual import also fails, the extracted PGN is invalid or Lichess rejected it.

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
