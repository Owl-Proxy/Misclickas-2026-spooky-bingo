# Keep the board under wraps

The board now requires an organiser's existing reviewer ID and code until you reveal it. The signup page and private roster keep working as before. Team codes do not unlock an unrevealed board.

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

Change `BOARD_PUBLIC` to `"true"` in `worker/wrangler.jsonc`, then deploy the Worker again using the command above. Commit that configuration change so future deploys retain the reveal setting.

Visitors can then view both boards without an organiser login. Team codes still control submissions and reviewer codes still control approvals. The signup roster remains private. Only an exact `"true"` opens the board; a missing setting leaves it locked.

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
