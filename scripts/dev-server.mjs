import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
export function createDevServer(apiHandler) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (apiHandler && url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const result = await apiHandler(new Request(`http://localhost${url.pathname.slice(4)}`, { method: request.method, headers: request.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
        response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer())); return;
      }
      const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const permitted = /^\/(index\.html|signup\.html|roster\.html|site-config\.json|october-bingo-ideas\.json|october-osrs-bingo\.svg|(?:web|shared|assets)\/[^?]+)$/.test(path);
      const filename = resolve(root, '.' + path);
      if (!permitted || !filename.startsWith(resolve(root) + sep) || path.split('/').some(part => part.startsWith('.'))) { response.writeHead(404); response.end('Not found'); return; }
      let bytes = await readFile(filename);
      if (apiHandler && path === '/site-config.json') { const settings = JSON.parse(bytes); settings.apiBaseUrl = '/api'; bytes = JSON.stringify(settings); }
      response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createDevServer().listen(4173, '127.0.0.1', () => console.log('Bingo preview: http://localhost:4173'));
}
