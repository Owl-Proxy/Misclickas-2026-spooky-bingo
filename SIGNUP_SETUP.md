# Set up the Halloween signup page

The public page is `signup.html`. It collects an OSRS username and a Discord username, with a dark Halloween theme and no board link or tile details. The board's current URL stays the same.

Names are stored in **Cloudflare D1**, in your existing Cloudflare account. They do not go into this public repository or its `submissions` branch. `roster.html` reads the database only after an organiser signs in with an existing reviewer ID and code. Team codes cannot access it.

D1 has a free allowance that should comfortably cover a clan roster. You do not need a paid plan for this setup. See [Cloudflare's current D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). If a Free plan database exceeds its daily query allowance, queries fail until that allowance resets.

## 1. Create the database

Open PowerShell in this repository, as you did when deploying the Worker. Run:

```powershell
npx.cmd wrangler@4 d1 create misclickas-bingo-signups --config worker/wrangler.jsonc --binding SIGNUPS_DB --update-config
```

Use the same Cloudflare account as your existing Worker. This command creates the database and adds its binding to the configuration. A **binding** is the name the Worker uses to access the database.

## 2. Check the database binding

Open `worker/wrangler.jsonc`. The command should have added an active `d1_databases` section with a real `database_id`. Make sure its binding is exactly `SIGNUPS_DB`. Add `migrations_dir` if it is missing:

```json
"d1_databases": [{
  "binding": "SIGNUPS_DB",
  "database_name": "misclickas-bingo-signups",
  "database_id": "the-real-ID-returned-by-Cloudflare",
  "migrations_dir": "migrations"
}],
```

The repository includes a commented example beginning with `//`. That example does nothing until enabled. Use only **one active** `d1_databases` section, with your real ID. The database ID is configuration, not an access code, and can be committed to GitHub. Keep your existing secrets as they are.

## 3. Create the signup table

```powershell
npx.cmd wrangler@4 d1 migrations apply misclickas-bingo-signups --remote --config worker/wrangler.jsonc
```

Confirm applying `0001_signups.sql` when prompted. This creates the empty table; it does not change bingo submissions. `--remote` means your online database. Future runs apply only migrations that have not already run.

## 4. Deploy the Worker

```powershell
npx.cmd wrangler@4 deploy --config worker/wrangler.jsonc
```

Look for `SIGNUPS_DB` in the deployment's bindings list. Your existing Worker URL stays the same. The existing `REVIEWERS` secret also works for the roster; you do not need to upload a new code.

## 5. Publish the pages

In GitHub Desktop, review and commit the signup changes and your database binding, then **Push origin**. Wait for the GitHub Pages deployment to finish.

- Share with the clan: https://owl-proxy.github.io/Misclickas-2026-spooky-bingo/signup.html
- Keep for organisers: https://owl-proxy.github.io/Misclickas-2026-spooky-bingo/roster.html

The roster HTML itself is public, but it contains no names or access codes. Its API requires reviewer authentication to load names. The signup page never requests the bingo tile configuration.

## 6. Try one signup and assign a team

1. Open the signup link. Enter your OSRS and Discord usernames, tick the organiser-use checkbox, and submit. You should see **You're on the list**.
2. Open the roster link. Enter your existing **reviewer ID** (for example, `organiser`) and its **reviewer access code**. These are the same credentials used to review screenshots, not a team code or GitHub token.
3. Find your entry. Select Team Vampire or Team Werewolf and click **Save assignment**.
4. Give the member the team role in Discord. Then tick **Discord role assigned** and save again. This page tracks the role; it does not change Discord itself.
5. Use **Download CSV** if you want a local spreadsheet. The download contains participant names, so keep it with the organising team and outside this public repository.

Entries start as unassigned. An OSRS name can be registered once, ignoring case and equivalent spaces/underscores/hyphens. Repeated submissions keep the original details and show the same confirmation. Organisers can correct names in the Cloudflare dashboard's D1 database table editor after checking with the player. If changing an OSRS name there, update `player_key` too: lowercase the name, replace underscores/hyphens with spaces, and collapse repeated spaces.

Refreshing or signing out of the roster clears its login. Codes and names are not saved in browser local storage. Use **Refresh** inside the roster to fetch new signups while staying signed in.

## Close signups later

In `worker/wrangler.jsonc`, change `SIGNUPS_OPEN` from `"true"` to `"false"`, then deploy the Worker again. The roster remains available to organisers. No database records are deleted.

## Troubleshooting

- **Signups unavailable / closed before launch:** confirm the active `SIGNUPS_DB` binding, apply the migration with `--remote`, and deploy. Check `SIGNUPS_OPEN` is `"true"`.
- **Could not save or load:** the database binding may exist without the table. Run step 3, then retry.
- **Access code is not valid:** use the reviewer ID and its matching code from your existing `REVIEWERS` secret.
- **Another organiser changed the entry:** click Refresh to load their changes, then make your update.
- **Too many attempts:** wait a minute before trying again.

## Local verification

With Node 22.13 or newer, run `node --test --test-isolation=none tests/*.test.mjs` for board and signup tests. `node tests/preview-server.mjs` serves a local signup preview at http://localhost:4173/signup.html with a temporary SQLite database that disappears when stopped. Local roster credentials are `organiser` / `test-reviewer-code-123456789`; these are test fixtures only and do not work online.

The schema and prepared statements are tested using SQLite. The first live signup in step 6 verifies your actual Cloudflare binding and deployment.
