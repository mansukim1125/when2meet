import postgres from 'npm:postgres@3.4.9';
import { handleApi } from '../_shared/api.js';
import { createStore } from '../_shared/store.js';

const client = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  prepare: false,
  max: 1,
  connect_timeout: 5,
  idle_timeout: 20,
});
const db = createStore((sql) => (...params) => client.unsafe(sql, params), 'nalmoa.', 'response_order');
const origin = Deno.env.get('NALMOA_CORS_ORIGIN') || 'https://mansukim1125.github.io';

Deno.serve((request) => {
  const path = new URL(request.url).pathname;
  // Supabase keeps the function name in the path it passes to the handler.
  const pathname = path.replace(/^(?:\/functions\/v1)?\/nalmoa(?=\/|$)/, '');
  return handleApi({
    method: request.method,
    pathname,
    headers: request.headers,
    body: request.body,
  }, db, origin);
});
