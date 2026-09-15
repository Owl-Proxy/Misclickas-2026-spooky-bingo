# Misclickas Spooky Bingo

An Old School RuneScape Halloween bingo board for the Misclickas clan.

<img width="1122" height="1402" alt="image" src="https://github.com/user-attachments/assets/617e8d9f-f756-4fbd-8981-5dc99155ad6c" />


## Share the board

The repository includes a responsive `index.html` viewer for GitHub Pages. It embeds the SVG as a document so boss backgrounds and tile hover descriptions work.

To publish, commit and push the project to `main`, then open the repository's **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/ (root)**, and save.

Once Pages is enabled and deployment completes, the sharing URL is:

https://owl-proxy.github.io/Misclickas-2026-spooky-bingo/

The SVG is also available at that address followed by `october-osrs-bingo.svg`.

## Update the board

Edit `october-bingo-ideas.json`, then regenerate the SVG with either:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\generate-bingo-board.ps1
```

```sh
node generate-bingo-board.js
```

Commit and push the regenerated SVG and any changed assets to update the published board. The viewer's aspect ratio matches the default 6×9 board; update it if changing the board dimensions.

OSRS image sources and credits are listed in [assets/README.md](assets/README.md). Decorative images are embedded in the SVG; some boss backgrounds and item icons still load from the OSRS Wiki.

## Interactive team boards

Team Vampire and Team Werewolf have separate boards, shareable links, screenshot submissions, and organiser reviews. See [SETUP.md](SETUP.md) to connect the submission service and open uploads. The site remains browsable before that setup is complete.

## Clan signups

`signup.html` is a separate Halloween signup page. Names are stored privately in Cloudflare D1, with reviewer-only access through `roster.html`, team assignment, Discord role tracking and CSV export. Follow [SIGNUP_SETUP.md](SIGNUP_SETUP.md) to create the database and publish the pages.
