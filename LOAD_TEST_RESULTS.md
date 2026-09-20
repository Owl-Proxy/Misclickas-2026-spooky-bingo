# Local load test results

Tested on September 15, 2026. Baseline source: commit `623c0e9`. These are offline simulations and local Workers runtime checks, not a measurement of the deployed site's capacity. No real signups, submissions, GitHub commits or Cloudflare data were changed.

## Before and after

The load harness calls the real Worker routes and `GitHubStore`, replacing only the upstream GitHub API. It models network delays, file SHA conflicts, optional conflicts between changes to the same branch, the shared 5,000-request allowance, and a conservative shared 20-attempts/minute/team upload throttle. The viewer test advances a virtual clock through one hour of 30-second refreshes. Each simulated location has its own Worker instance and cache.

| Scenario | Original implementation | Updated implementation |
| --- | --- | --- |
| 50 active viewers, one virtual hour, one location | 6,000 GitHub calls; 1,000 reads failed after the modeled quota | 240 GitHub calls; all 6,000 viewer requests succeeded |
| 75 active viewers, one virtual hour, one location | 9,000 GitHub calls; 4,000 reads failed | 240 GitHub calls; all 9,000 viewer requests succeeded |
| 75 active viewers across five locations | 9,000 GitHub calls; 4,000 reads failed | 1,200 GitHub calls; all viewer requests succeeded |
| 20 simultaneous uploads plus 75 viewers, file conflicts | 10 saved, 10 failed | All 20 saved |
| Same burst, strict branch conflicts too | 3 saved, 17 failed | All 20 saved |
| 50 simultaneous uploads plus 75 viewers, strict conflicts | 3 saved, 37 failed, 10 throttled | 40 saved, 10 throttled by the existing team limit |

The final 20-upload simulations completed in roughly 3 seconds, and the 50-upload simulation in roughly 6 seconds, with a modeled 20 ms delay per upstream call. **Those timings are not predictions for real GitHub latency.** Baseline immediate retries synchronized badly; their failure counts describe this model, not the proportion of real uploads previously expected to fail. No acknowledged entries were lost or duplicated in either version. The baseline file-conflict scenario did leave some screenshots without a corresponding submission after archive saves failed.

## Stricter limits and retries

Additional tests conservatively charged every attempted PUT, including conflicts, against 80 write attempts per minute, alongside 900 API points per minute. GitHub's actual secondary enforcement may differ. These runs exercise overload handling rather than promise that every burst can be accepted immediately.

| Updated implementation | Initial result | Result after users wait and retry unchanged entries |
| --- | --- | --- |
| 20 uploads, one location | 20 saved | No retry needed |
| 20 uploads, five locations | 20 saved | No retry needed |
| 75 uploads, one location | 40 saved; 35 team-throttled | All 75 saved after one virtual waiting window |
| 75 uploads, five locations | 11 saved; 35 team-throttled; 29 storage-throttled | All 75 saved after two virtual waiting windows |

Retries in this test were sequential after advancing the clock by a minute; they were not another simultaneous rush. In every scenario, an exact repeat of a successful submission kept one entry. Five simultaneous reviews of different submissions preserved all approvals. Five concurrent 3 MiB synthetic payloads also saved successfully. These synthetic images test byte handling, not image rendering.

The browser now also has bounded automatic retries, described in [SETUP.md](SETUP.md). The recorded load results above predate that browser feature; they do not measure many browsers retrying together. `tests/upload-retry.test.mjs` verifies retry limits, server waits and cancellation with a fake clock. `tests/retry-browser-smoke.mjs` checks countdown display, recovery and lost acknowledgements against the local preview, including preservation of the same submission ID and screenshot.

## Local Cloudflare runtime check

The actual local `workerd` runtime was tested with HTTP requests and the real Cache API. Its GitHub transport was redirected to a loopback-only server. A burst of 75 viewer requests needed two upstream reads, and all 20 simultaneous uploads saved with no write conflicts. This verifies request-context compatibility for caching and write coordination; it does not reproduce Cloudflare's production CPU limits or worldwide routing.

## First-time browser loads — September 20, 2026

Ran the actual website in Chrome 153 using separate empty browser contexts with browser caching disabled. All tabs were prepared first, then navigated concurrently. The local server ran the real board-status, configuration, SVG, and team-progress Worker routes with in-memory test storage. Team Vampire had one approved test entry; Team Werewolf had none, so each session had to display its correct team total. The live event was not contacted or modified.

| Scenario | Result | Slowest local completion |
| --- | --- | --- |
| 1 first-time visitor, revealed board | Passed | 0.60 seconds |
| 30 simultaneous first-time visitors, revealed board | 30/30 passed | 8.44 seconds |
| 40 simultaneous first-time visitors, revealed board | 40/40 passed | 13.56 seconds |
| 40 simultaneous visitors, unrevealed board | 40/40 showed the gate; no tile catalog or board image requests | 1.35 seconds |

Each revealed-board session loaded all 54 interactive SVG tiles, showed the expected team score, and opened The Hungry Chest with the current five-completion requirement. There were no recorded API errors, JavaScript exceptions, or failed network requests. No page needed a reload. The test blocked submission writes and verified that its fixture data was unchanged. Screenshots were captured and the 30-session screenshot was visually checked.

The board's 87 external Wiki image URLs all returned image responses successfully when fetched once for the test. Those actual image files were then mirrored locally, with the SVG's image URLs rewritten only in the test service. The 40-session run served 3,480 image requests, rather than sending that burst to the Wiki. Embedded SVG images were also retained. The production board was not changed.

**Limits:** these are browser rendering and startup checks on one computer, not 40 physical devices or a Cloudflare/GitHub production benchmark. Local rendering contention affects the timings, while local storage and mirrored images remove internet latency and upstream throttling. The timings are not predicted participant wait times. This test does not measure concurrent uploads, automatic upload retries, large submission archives, reviewer login bursts, or resilience to a real service outage. Together with the earlier backend load simulations, the results support the expected 30–40-person turnout without guaranteeing that an initial load can never fail.

Reproduce with headless Chrome listening on `127.0.0.1:9333`, then run `node tests/board-load-browser.mjs`. The script starts and stops its own local service on port 4175 and closes every browser context it creates. It downloads each external image at most once into ignored `test-results/board-load-images/`; subsequent runs reuse those files. Results are saved as `test-results/board-browser-load.json`, with screenshots named `board-load-1.png`, `board-load-30.png`, and `board-load-40.png` in the same directory.

## Implementation changes

- Cache the read-only team progress response for 20 seconds using Cloudflare's built-in Cache API. Share concurrent reads within an instance. Cache failures fall back to GitHub.
- Keep the board access check ahead of cache reads. Cached replies never bypass the organiser gate, and client responses remain `no-store`.
- Read fresh data for all uploads and review decisions. Successful writes invalidate the local cached progress; other locations expire naturally.
- Save one repository change at a time within each running Worker instance, with bounded waiting. Conflicts between instances use up to eight attempts with randomised increasing delays. This is not a durable background queue.
- Return explicit retryable responses when storage is busy or throttled. Show the wait in the browser and pause automatic progress polling during an indicated cooldown. Keep the existing submission ID for unchanged retries.

No database migration, new binding, secret, account or paid service is required. The 20/minute/team throttle, 3 MiB screenshot limit and 1,500-entry/team archive cap remain in place.

## Interpretation for a 50–75-person event

These changes substantially reduce viewer traffic and improve ordinary submission bursts. They do **not** guarantee that 75 people can all upload at exactly the same instant without waiting. Caches and write coordination are local to a location/instance; scattered viewers, cold instances, larger archives, write volume and slower GitHub responses can raise costs and delays. Free-plan Worker CPU limits were not benchmarked here. A small controlled live check remains useful before the event; a storage migration would be the next step if frequent large upload bursts must succeed immediately.

## Publish

Deploy the Worker with `npx.cmd wrangler@4 deploy --config worker/wrangler.jsonc`, then commit and push the website changes. Existing URLs, access codes, board reveal setting and saved records are unchanged.

## Reproduce locally

```powershell
node --test --test-isolation=none tests/*.test.mjs
node tests/load-harness.mjs current
node tests/load-stress.mjs
```

The last two commands write raw JSON reports under ignored `test-results/`. Recorded reports from this session are `load-baseline.json`, `load-final.json` and `load-stress.json`. To reproduce the original behavior, run the harness against the baseline source in a separate checkout.

For the real local runtime check, use two terminal windows to start:

```powershell
node tests/load-upstream-server.mjs
```

```powershell
npx.cmd wrangler@4 dev --local --ip 127.0.0.1 --port 8788 --config tests/wrangler.load.jsonc
```

Then run `node tests/load-runtime-smoke.mjs` in a third terminal. Start with fresh local test processes. Stop both servers afterward with Ctrl+C. The test Worker uses fake credentials and forwards storage requests only to `127.0.0.1`; do not deploy the test configuration.

References: [GitHub REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [GitHub retry and concurrency guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api), [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
