import { createHandler } from '../backend/server.js';

// One function shares the same routing and caches as the local Node server.
const handle = createHandler();
export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('__route');
  if (route !== null) {
    url.searchParams.delete('__route');
    // Vercel forwards the matched path in a query parameter; keep search filters.
    req.url = `/api/${route}${url.search ? url.search : ''}`;
  }
  return handle(req, res);
}
