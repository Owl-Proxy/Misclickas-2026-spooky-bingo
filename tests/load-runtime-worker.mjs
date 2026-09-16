// Only used by wrangler.load.jsonc. This Worker cannot send requests to GitHub.
import { createApp } from '../worker/index.mjs';
import { GitHubStore } from '../worker/github.mjs';
const app = createApp(env => new GitHubStore(env, (url, options) => {
  const target = new URL(url);
  return fetch('http://127.0.0.1:4175' + target.pathname + target.search, options);
}));
const env = {
  BOARD_PUBLIC: 'true', GITHUB_TOKEN: 'local-only', GITHUB_OWNER: 'offline', GITHUB_REPO: 'load-test', GITHUB_BRANCH: 'submissions',
  TEAM_CODES: JSON.stringify({ vampire: 'test-vampire-code-123456789', werewolf: 'test-werewolf-code-123456789' }),
  REVIEWERS: JSON.stringify({ organiser: { name: 'Local Reviewer', code: 'test-reviewer-code-123456789' } })
};
export default { fetch(request) { return app.fetch(request, env); } };
