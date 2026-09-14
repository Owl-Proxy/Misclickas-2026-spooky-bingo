# Open team submissions

The site now has separate **Team Vampire** and **Team Werewolf** boards. Each team has its own shareable URL, submission history, and approved progress. GitHub Pages serves the site; a small Cloudflare Worker accepts screenshots and writes them to this repository. Until the Worker is connected, the site displays the boards with submissions disabled.

## 1. Prepare repository storage

In GitHub, create a branch named `submissions` from `main`. Keep GitHub Pages publishing from `main`, so screenshot commits do not rebuild the site.

Create a fine-grained GitHub personal access token with access to **only this repository** and **Contents: Read and write**. Choose an expiry covering the event, and replace the token before it expires. You do not need Actions or administration permissions. The token is used by the Worker, never by a visitor's browser.

## 2. Deploy the submission service

Install Node.js 22 or newer and sign into a Cloudflare account. From the repository folder:

```sh
npx wrangler@4 login
npx wrangler@4 deploy --config worker/wrangler.jsonc
```

This initial deployment remains closed until its secrets are set. Save the Worker URL printed by the command. The settings in `worker/wrangler.jsonc` already point at `Owl-Proxy/Misclickas-2026-spooky-bingo`, the `submissions` branch, and the GitHub Pages origin `https://owl-proxy.github.io`. If you use a custom domain, add its exact origin to `ALLOWED_ORIGINS` and redeploy.

Set the secrets using these prompts; do not paste actual secrets into a source file or commit them:

```sh
npx wrangler@4 secret put GITHUB_TOKEN --config worker/wrangler.jsonc
npx wrangler@4 secret put TEAM_CODES --config worker/wrangler.jsonc
npx wrangler@4 secret put REVIEWERS --config worker/wrangler.jsonc
```

For `GITHUB_TOKEN`, paste the token from step 1. For `TEAM_CODES`, enter one line of JSON shaped like this, replacing each placeholder with a different random code of at least 20 characters:

```json
{"vampire":"REPLACE_WITH_RANDOM_VAMPIRE_CODE","werewolf":"REPLACE_WITH_RANDOM_WEREWOLF_CODE"}
```

For `REVIEWERS`, use a separate code for each organiser:

```json
{"organiser":{"name":"Your organiser name","code":"REPLACE_WITH_RANDOM_REVIEWER_CODE"}}
```

The object key (`organiser` here) is the reviewer ID used to sign in. Add more entries for additional reviewers. Use a password manager to generate codes. Share team codes with their respective teams and reviewer codes only with organisers. Codes are limited to 256 characters. Player names are self-reported; organisers still verify the screenshots.

## 3. Connect the website

Set `apiBaseUrl` in `site-config.json` to your actual Worker URL, with no trailing slash:

```json
"apiBaseUrl": "https://misclickas-bingo-submissions.YOUR-SUBDOMAIN.workers.dev"
```

Publish the changed site files to the branch used by GitHub Pages. The two shareable links will be:

- [Team Vampire](https://owl-proxy.github.io/Misclickas-2026-spooky-bingo/?team=vampire)
- [Team Werewolf](https://owl-proxy.github.io/Misclickas-2026-spooky-bingo/?team=werewolf)

Use **Copy team link** on either board. Team IDs in the URL, upload request, and archive path must agree; signing into one team does not authorise uploads for the other. Everyone can view both boards and screenshots.

## Using the boards

1. Open your team's link and choose **Team sign in**.
2. Select a tile, choose the drop or activity, enter the quantity and RuneScape name, and attach a screenshot. On phones, swipe the board sideways or use **Jump to a tile** below it.
3. Submit the evidence. It appears as **pending** and does not count yet.
4. An organiser uses **Reviewer sign in**, filters the team's submissions to **Pending review**, and opens the evidence to approve or reject it. Rejections require a reason. Approved evidence can be reopened or rejected if a mistake is found.

The explicit “any one” and alternative completion paths (including raids, pets, and Vorkath) are calculated from approved quantities. For other tiles, organisers check the existing written requirements and tick **All requirements for this tile are now met** when appropriate. This preserves the original rules without guessing whether a list means “any” or “all.” Approval without that checkbox records progress but leaves those tiles incomplete.

Access codes are kept in the current browser tab's session storage. Sign out on a shared computer. Review decisions record the organiser's server-verified identity and timestamp; stale decisions are refused if another reviewer has already changed the same submission.

## Storage and operating limits

### Witching Hour bonus scoring

Witching Hour stays open and awards **at most 1 bonus point per eligible board tile per team**. The tile may be complete or incomplete. Choose the board tile, then one of its listed drops; quantity is fixed at one. The free space, Witching Hour itself, and activity-only tiles are excluded. Drops that are not listed on the selected tile do not qualify.

Include the time received and time zone in Notes, with a screenshot showing the drop and clock. Reviewers verify that it was received from midnight (inclusive) to 1 a.m. (exclusive), under the existing local-time rule; upload time is not drop time. Agree on the meaning of local time before the event begins. The same screenshot may be submitted separately to the normal tile for completion progress and to Witching Hour for the bonus; each requires its own review.

Pending and approved claims reserve the selected tile's bonus slot for that team. Another drop from that tile cannot earn another bonus. Approval awards one point; returning it to pending removes the point but keeps the slot reserved. Rejection removes the point and permits a replacement claim. Duplicate approvals are also capped defensively when calculating scores. The completion checkbox remains unavailable.

Older Witching Hour submissions using the generic activity choice cannot be attributed to a board tile and no longer earn points. Their screenshots and review history are retained; resubmit eligible evidence with the correct tile and listed drop. The new rule does not guess which tile an old entry belongs to.

The tile badge and detail panel show bonus points and credited tile names, and the team score shows points separately from the **52 completable tiles**. All 54 board positions remain. Other tiles keep their existing rules; bonus approval does not complete a normal tile. Archive and upload limits still apply.

To publish this logic change, deploy the updated Worker (`npx.cmd wrangler@4 deploy --config worker/wrangler.jsonc`) and publish the changed site files to GitHub Pages. The site reads its live tile catalog from the Worker, so both need the update. Existing secrets and stored submissions are retained.

### Archive limits

- Screenshots and metadata live under `submissions/<team-id>/` on the `submissions` branch. GitHub commits keep the history. Screenshots and names are public.
- The browser accepts PNG, JPEG, and WebP files up to 20 MB, resizes the longest edge to at most 2560 pixels, and converts them to WebP. The saved image must be at most 3 MB. Check that evidence remains readable.
- Uploads are limited to 20 per team per minute. Sign-in attempts and invalid credentials are rate-limited by IP. Cloudflare rate limits are best effort; platform/GitHub quotas also apply.
- Each team archive accepts at most 1,500 submissions. This repository storage design suits a clan event; a much larger event would benefit from dedicated object storage and a database.
- A screenshot is saved before its index entry. If an interrupted request never succeeds on retry, an unreferenced image can remain; it does not count toward progress. Retrying the same form is safe. Exact duplicate screenshots for the same team's drop are refused unless the previous entry was rejected.
- Keep existing `tile_id` values when renaming tiles. Changing a tile's completion rules after submissions begin recalculates approved progress under the new rules. Redeploy the Worker whenever you change tile data or team configuration, then publish the website update.
- If storage fails, the site reports an error and keeps any previously loaded progress marked as stale. It never claims an unsaved upload succeeded. Check the token expiry, branch name, repository permissions, and Worker logs if uploads fail.

## Local checks

```sh
npm test
npm run dev
```

Open `http://localhost:4173`. With an empty API URL this is a browse-only preview. The automated suite covers completion paths, quantities, team permissions, review history, concurrency conflicts, duplicate uploads, and file validation.

For a complete local upload/review preview, run `node tests/preview-server.mjs` instead of `npm run dev`. It uses temporary in-memory data and the clearly marked test codes in `tests/helpers.mjs`; stopping it discards every submission. This does not connect to GitHub. `tests/browser-smoke.mjs` exercises that preview through a separate headless Chrome instance with remote debugging on port 9333. Keep remote debugging bound to your own computer.

Validate a production bundle without deploying:

```sh
npx wrangler@4 deploy --dry-run --outdir test-results/worker --config worker/wrangler.jsonc
```

References: [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents), [Cloudflare rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
