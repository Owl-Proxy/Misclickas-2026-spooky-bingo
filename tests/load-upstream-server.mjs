// Local GitHub API stand-in for testing inside workerd; binds to loopback only.
import { createServer } from 'node:http';
import { FakeGitHub } from './load-harness.mjs';
const model = new FakeGitHub({ latency: 20, branchConflicts: true });
createServer(async (req, res) => {
  if (req.url === '/metrics') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...model.metrics, saved: model.entries().length })); return; }
  const chunks = []; for await (const part of req) chunks.push(part);
  const response = await model.fetch('https://api.github.com' + req.url, { method: req.method, headers: { Accept: req.headers.accept || '' }, body: Buffer.concat(chunks).toString() });
  res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
}).listen(4175, '127.0.0.1', () => console.log('Offline GitHub stand-in: http://127.0.0.1:4175'));
