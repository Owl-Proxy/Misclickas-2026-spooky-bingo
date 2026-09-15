# Misclickas Spooky Bingo

An Old School RuneScape Halloween bingo board for the Misclickas clan.

<img width="1122" height="1402" alt="image" src="https://github.com/user-attachments/assets/617e8d9f-f756-4fbd-8981-5dc99155ad6c" />


## Share the board

The repository includes a responsive `index.html` viewer for GitHub Pages. It embeds the SVG as a document so boss backgrounds and tile hover descriptions work.

To publish, select **Settings → Pages → Source → GitHub Actions**, then commit and push the project to `main`. The workflow publishes only the approved website files. Follow [BOARD_ACCESS.md](BOARD_ACCESS.md) to deploy the organiser gate and reveal the board when the event starts.

Once Pages is enabled and deployment completes, the sharing URL is:

https://owl-proxy.github.io/Misclickas-2026-spooky-bingo/

The SVG and tile data are served by the Worker after its access check; they are excluded from GitHub Pages. Signups remain available at `signup.html` while the board is locked.

## Update the board

Edit `october-bingo-ideas.json`, then regenerate the SVG with either:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\generate-bingo-board.ps1
```

```sh
node generate-bingo-board.js
```

Deploy the Worker after regenerating the SVG or changing tile data, then commit and push changes. The viewer's aspect ratio matches the default 6×9 board; update it if changing the board dimensions.

OSRS image sources and credits are listed in [assets/README.md](assets/README.md). Decorative images are embedded in the SVG; some boss backgrounds and item icons still load from the OSRS Wiki.

## Interactive team boards

Team Vampire and Team Werewolf have separate boards, shareable links, screenshot submissions, and organiser reviews. See [SETUP.md](SETUP.md) to connect the submission service. The board stays locked until an organiser signs in or `BOARD_PUBLIC` is set to `"true"` and the Worker is deployed.

## Clan signups

`signup.html` is a separate Halloween signup page. Names are stored privately in Cloudflare D1, with reviewer-only access through `roster.html`, team assignment, Discord role tracking and CSV export. Follow [SIGNUP_SETUP.md](SIGNUP_SETUP.md) to create the database and publish the pages.
