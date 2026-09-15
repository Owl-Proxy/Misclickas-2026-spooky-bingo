// Local test fixtures only. This process never writes to GitHub.
import { createDevServer } from '../scripts/dev-server.mjs';
import { fixture, env } from './helpers.mjs';
import { signupDatabase } from './signup-db.mjs';
const { app } = fixture();
const previewEnv = { ...env, BOARD_PUBLIC: process.env.BOARD_PUBLIC ?? 'true', SIGNUPS_DB: signupDatabase() };
createDevServer(request => app.fetch(request, previewEnv)).listen(4173, '127.0.0.1', () => console.log('In-memory test preview: http://localhost:4173'));
