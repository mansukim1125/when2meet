import { handleApi } from '../supabase/functions/_shared/api.js';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { openDatabase } from './database.js';

let db;
try {
  db = await openDatabase();
} catch (error) {
  const mode = process.env.DATABASE_URL === undefined ? 'SQLite' : 'PostgreSQL';
  console.error(`${mode} initialization failed:`, error.code ?? error.name);
  process.exit(1);
}

const origin = process.env.CORS_ORIGIN;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/config.js', ['config.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
]);

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (pathname.startsWith('/api/')) {
      const response = await handleApi({
        method: req.method,
        pathname,
        headers: new Headers(req.headers),
        body: req.iterator({ destroyOnReturn: false }),
      }, db, origin);
      req.resume();
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(response.body ? await response.text() : undefined);
    }

    if (!['GET', 'HEAD'].includes(req.method) || !assets.has(pathname)) {
      return json(res, 404, { error: '페이지를 찾을 수 없습니다.' });
    }
    const [file, type] = assets.get(pathname);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(new URL(`../web/${file}`, import.meta.url)));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) return json(res, 500, { error: '서버에서 오류가 발생했습니다.' });
    res.end();
  }
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`날모아 http://${host}:${server.address().port}`));
