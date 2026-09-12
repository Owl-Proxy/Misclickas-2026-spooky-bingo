// Local test fixtures only. This process never writes to GitHub.
import { createDevServer } from '../scripts/dev-server.mjs';
import { fixture, env } from './helpers.mjs';
const { app } = fixture();
createDevServer(request => app.fetch(request, env)).listen(4173, '127.0.0.1', () => console.log('In-memory test preview: http://localhost:4173'));
