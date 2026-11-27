import { createHash, randomBytes } from 'node:crypto';

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(headers, body) {
  if (headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'JSON 형식으로 요청해 주세요.');
  }
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for await (const chunk of body ?? []) {
    size += chunk.length;
    if (size > 16_384) throw new RequestError(413, '요청이 너무 큽니다.');
    text += decoder.decode(chunk, { stream: true });
  }
  try {
    const value = JSON.parse(text + decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
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

function tokenHash(headers) {
  const header = headers.get('authorization');
  if (header === null) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  if (!match) throw new RequestError(401, '응답 수정 권한을 확인해 주세요.');
  return createHash('sha256').update(match[1]).digest('hex');
}

async function pollView(db, poll, hash) {
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

export async function handleApi({ method, pathname, headers, body }, db, origin) {
  const responseHeaders = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  });
  if (origin && headers.get('origin') === origin) {
    responseHeaders.set('Access-Control-Allow-Origin', origin);
  }
  const json = (status, data) => {
    responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
    return Response.json(data, { status, headers: responseHeaders });
  };

  try {
    if (method === 'OPTIONS') {
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return new Response(null, { status: 204, headers: responseHeaders });
    }
    if (pathname === '/api/health' && method === 'GET') {
      try {
        await db.checkHealth();
        return json(200, { ok: true });
      } catch {
        return json(503, { ok: false });
      }
    }
    if (pathname === '/api/polls' && method === 'POST') {
      const input = await readJson(headers, body);
      const title = inputText(input.title, 80, '모임 이름');
      const description = inputText(input.description ?? '', 300, '모임 설명', false);
      const dates = inputDates(input.dates);
      const id = randomBytes(12).toString('base64url');
      await db.createPoll(id, title, description, JSON.stringify(dates));
      return json(201, { id });
    }

    const match = /^\/api\/polls\/([A-Za-z0-9_-]{16})(\/responses)?$/.exec(pathname);
    if (!match) throw new RequestError(404, '요청한 주소를 찾을 수 없습니다.');
    const [, id, responsesPath] = match;
    const poll = await db.getPoll(id);
    if (!poll) throw new RequestError(404, '모임을 찾을 수 없습니다. 공유 링크를 확인해 주세요.');
    const hash = tokenHash(headers);
    if (!responsesPath && method === 'GET') return json(200, await pollView(db, poll, hash));
    if (responsesPath && method === 'PUT') {
      if (!hash) throw new RequestError(401, '응답 수정 권한을 확인해 주세요.');
      const input = await readJson(headers, body);
      const name = inputText(input.name, 40, '이름');
      const dates = JSON.stringify(inputDates(input.dates, JSON.parse(poll.dates)));
      await db.saveResponse(id, hash, name, dates);
      return json(200, await pollView(db, poll, hash));
    }
    throw new RequestError(405, '지원하지 않는 요청입니다.');
  } catch (error) {
    if (error instanceof RequestError) return json(error.status, { error: error.message });
    console.error('API request failed:', error.code ?? error.name);
    return json(500, { error: '서버에서 오류가 발생했습니다.' });
  }
}
