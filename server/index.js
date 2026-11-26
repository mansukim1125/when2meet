import { createHash, randomBytes } from 'node:crypto';
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

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'JSON 형식으로 요청해 주세요.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 16_384) {
      req.resume();
      throw new RequestError(413, '요청이 너무 큽니다.');
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new RequestError(400, '요청 형식을 확인해 주세요.');
  }
}

function inputText(value, max, label, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new RequestError(400, `${label}을(를) 확인해 주세요. 최대 ${max}자입니다.`);
  }
  return value.trim();
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function inputDates(value, candidates) {
  if (!Array.isArray(value) || value.length > 60 || (!candidates && !value.length) ||
      !value.every((date) => candidates ? candidates.includes(date) : validDate(date))) {
    throw new RequestError(400, '후보 날짜를 확인해 주세요. 최대 60일까지 선택할 수 있습니다.');
  }
  return [...new Set(value)].sort();
}

function tokenHash(req) {
  const header = req.headers.authorization;
  if (header === undefined) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  if (!match) throw new RequestError(401, '응답 수정 권한을 확인해 주세요.');
  return createHash('sha256').update(match[1]).digest('hex');
}

async function pollView(poll, hash) {
  const rows = await db.getResponses(poll.id, hash);
  const responses = rows.map((row) => ({ name: row.name, dates: JSON.parse(row.dates) }));
  const ownIndex = rows.findIndex((row) => row.is_own === 1);
  return {
    ...poll,
    dates: JSON.parse(poll.dates),
    responses,
    ownResponse: responses[ownIndex] ?? null,
  };
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (pathname.startsWith('/api/')) {
      res.setHeader('Vary', 'Origin');
      if (origin && req.headers.origin === origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        });
        return res.end();
      }
      if (pathname === '/api/health' && req.method === 'GET') {
        try {
          await db.checkHealth();
          return json(res, 200, { ok: true });
        } catch {
          return json(res, 503, { ok: false });
        }
      }
      if (pathname === '/api/polls' && req.method === 'POST') {
        const body = await readJson(req);
        const title = inputText(body.title, 80, '모임 이름');
        const description = inputText(body.description ?? '', 300, '모임 설명', false);
        const dates = inputDates(body.dates);
        const id = randomBytes(12).toString('base64url');
        await db.createPoll(id, title, description, JSON.stringify(dates));
        return json(res, 201, { id });
      }

      const match = /^\/api\/polls\/([A-Za-z0-9_-]{16})(\/responses)?$/.exec(pathname);
      if (!match) throw new RequestError(404, '요청한 주소를 찾을 수 없습니다.');
      const [, id, responsesPath] = match;
      const poll = await db.getPoll(id);
      if (!poll) throw new RequestError(404, '모임을 찾을 수 없습니다. 공유 링크를 확인해 주세요.');
      const hash = tokenHash(req);
      if (!responsesPath && req.method === 'GET') return json(res, 200, await pollView(poll, hash));
      if (responsesPath && req.method === 'PUT') {
        if (!hash) throw new RequestError(401, '응답 수정 권한을 확인해 주세요.');
        const body = await readJson(req);
        const name = inputText(body.name, 40, '이름');
        const dates = JSON.stringify(inputDates(body.dates, JSON.parse(poll.dates)));
        await db.saveResponse(id, hash, name, dates);
        return json(res, 200, await pollView(poll, hash));
      }
      throw new RequestError(405, '지원하지 않는 요청입니다.');
    }

    if (!['GET', 'HEAD'].includes(req.method) || !assets.has(pathname)) {
      throw new RequestError(404, '페이지를 찾을 수 없습니다.');
    }
    const [file, type] = assets.get(pathname);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(new URL(`../web/${file}`, import.meta.url)));
  } catch (error) {
    if (error instanceof RequestError) return json(res, error.status, { error: error.message });
    console.error(error);
    if (!res.headersSent) return json(res, 500, { error: '서버에서 오류가 발생했습니다.' });
    res.end();
  }
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`날모아 http://${host}:${server.address().port}`));
