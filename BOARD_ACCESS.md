# Keep the board under wraps

The board requires an organiser's existing reviewer ID and code until you reveal it manually or its scheduled reveal time arrives. The signup page and private roster keep working as before. Team codes do not unlock an unrevealed board.

There are two parts to publishing this change: the Worker enforces access, and GitHub Pages must publish only the approved website files. Complete both before sharing the signup link more widely.

## 1. Deploy the Worker

In the project PowerShell window:

```powershell
npx.cmd wrangler@4 deploy --config worker/wrangler.jsonc
```

The output should include `BOARD_PUBLIC ("false")`. Your existing reviewer credentials unlock the preview; no new secret or database migration is needed. The SVG is bundled into the Worker and `/config`, `/board.svg`, team submissions and screenshots all require reviewer access before reveal.

## 2. Change the GitHub Pages publishing source

On GitHub, open this repository's **Settings → Pages**. Under **Build and deployment → Source**, select **GitHub Actions**, replacing **Deploy from a branch**.

This is necessary: publishing the repository root directly would leave the original SVG and tile JSON accessible by URL. The new workflow builds a website containing only the files explicitly listed in `scripts/public-files.mjs`.

## 3. Commit and push

Use GitHub Desktop to commit all the gate changes (including `.github/workflows/pages.yml`), then **Push origin**. In the repository's **Actions** tab, wait for **Publish signup and gated board** to finish successfully. If you pushed before selecting GitHub Actions as the Pages source, select this workflow and use **Run workflow** on `main` afterward.

This replaces the published site, rather than just hiding elements in the browser. The board and signup URLs stay the same.

## 4. Check in a private browser window

- Open the main board URL: you should see **The board is under wraps** and a signup link.
- Open `/signup.html`: signups should work normally.
- Open `/october-osrs-bingo.svg` and `/october-bingo-ideas.json` on the Pages site: both should return 404 after deployment. If either still loads, check the Pages publishing source and latest workflow, then retry after the Pages cache updates.
- Open the Worker URL followed by `/config` or `/board.svg`: without reviewer credentials, each should return an access error.
- Sign into the gate with your existing reviewer ID and code. Both team boards should be available. Signing out locks the board again.

The preview login is stored only in that browser tab's session storage, just like the existing board reviewer login. An already signed-in organiser tab may open directly, so use a private window to test what clan members see.

## Reveal the board for the event

The board is scheduled to open **Monday, September 28, 2026 at noon Eastern (EDT)**. In `worker/wrangler.jsonc`:

```json
"BOARD_PUBLIC": "false",
"BOARD_REVEAL_AT": "2026-09-28T12:00:00-04:00"
```

Deploy the Worker to activate this schedule, and commit/push the website changes to publish the countdown. No database migration is needed. The Worker checks its own clock on each request and opens access at the scheduled time, without a scheduled job or another deployment at noon. This reveals the board; it does not change the bingo event dates or Wise Old Man competition.

Visitors see days, hours, minutes and seconds on the locked page. The clock ticks locally, using the server's time as its starting point. Visible locked pages check access once a minute and at the reveal, then open the board automatically when the service confirms access. Hidden pages stop checks and catch up when visible again. Temporary connection errors retry on the next check. An organiser already previewing the board will not see the countdown; use a private window to check it.

To change the scheduled time, edit `BOARD_REVEAL_AT` and deploy again. Always include the timezone offset (`-04:00` for this September date). To cancel the schedule and keep the board locked, remove `BOARD_REVEAL_AT` and keep `BOARD_PUBLIC` set to `"false"`, then deploy. **Setting `BOARD_PUBLIC` to `"false"` alone does not re-lock a board whose scheduled reveal has passed.**

After reveal, fresh visits show team selection immediately while the board loads, without displaying the expired countdown. The service still checks access before loading any tiles; if the board is locked again, the organiser gate appears instead.

To reveal early, change `BOARD_PUBLIC` to `"true"` and deploy. Commit configuration changes so future deploys retain your settings.

Visitors can then view both boards without an organiser login. Team codes still control submissions and reviewer codes still control approvals. The signup roster remains private. Without an explicit `"true"` or a valid scheduled time that has arrived, the board stays locked.

Whenever you change tile data or regenerate the SVG, deploy the Worker again to update the board contents. Push website changes to update Pages.

## Scope of the protection

This gate protects access through the website and Worker API. The repository itself is still public: source files, Git history, the README's existing screenshot, and the submissions branch can be viewed on GitHub. Previously downloaded copies cannot be recalled. Fully hiding those would require a private source repository and an appropriate publishing arrangement; this change does not alter repository visibility.

## Local checks

`node --test --test-isolation=none tests/*.test.mjs` checks gate permissions alongside existing signup and bingo behavior. `node scripts/build-pages.mjs` builds the Pages artifact at `test-results/pages`.

For a locked local preview in PowerShell:

```powershell
$env:BOARD_PUBLIC = 'false'
node tests/preview-server.mjs
```

Use the fixture reviewer ID `organiser` and code `test-reviewer-code-123456789` locally only. With headless Chrome on port 9333, `node tests/gate-browser-smoke.mjs` exercises the locked gate. Set the preview environment variable to `'true'` and restart the preview server before running the normal `tests/browser-smoke.mjs` test.

Publishing reference: [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
