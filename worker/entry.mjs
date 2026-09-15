import app from './index.mjs';
import boardSVG from '../october-osrs-bingo.svg';

// Wrangler bundles the board as text; it is served only after the access check.
export default { fetch(request, env) { return app.fetch(request, { ...env, BOARD_SVG: boardSVG }); } };
