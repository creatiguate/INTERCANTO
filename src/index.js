import { configError } from './models/supabase.js';
import { getAdminController, updateAdminController } from './controllers/admin.js';
import {
  castVoteController,
  confirmPartnersController,
  getConfigController,
  getStateController,
  recordPartnerVisitController,
} from './controllers/voting.js';
import { SECURITY_HEADERS, isAllowedOrigin, json } from './controllers/http.js';
import { shareParticipant } from './controllers/share.js';
import { PARTICIPANTS } from './models/participants.js';

function withSecurityHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (new URL(request.url).pathname.startsWith('/api/')) {
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
    headers.set('Vary', 'Origin');
    if (isAllowedOrigin(request, env)) {
      headers.set('Access-Control-Allow-Origin', request.headers.get('Origin'));
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
      headers.set('Access-Control-Max-Age', '600');
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  // Preflight CORS para un frontend publicado en GitHub Pages.
  if (path.startsWith('/api/') && request.method === 'OPTIONS') {
    if (!isAllowedOrigin(request, env)) {
      return json({ error: 'INVALID_ORIGIN', message: 'Origen no permitido.' }, 403);
    }
    return new Response(null, { status: 204 });
  }

  if (path === '/api/config') {
    if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    return getConfigController(env);
  }

  if (path.startsWith('/api/')) {
    if (path === '/api/state' && request.method === 'GET') {
      const error = configError(env);
      return error ? json({ error: 'SERVER_NOT_CONFIGURED', message: error }, 503) : getStateController(request, env);
    }

    if (path === '/api/vote' && request.method === 'POST') {
      const error = configError(env);
      return error ? json({ error: 'SERVER_NOT_CONFIGURED', message: error }, 503) : castVoteController(request, env);
    }

    if (path === '/api/partner-visit' && request.method === 'POST') {
      const error = configError(env);
      return error ? json({ error: 'SERVER_NOT_CONFIGURED', message: error }, 503) : recordPartnerVisitController(request, env);
    }

    if (path === '/api/confirm-partners' && request.method === 'POST') {
      const error = configError(env);
      return error ? json({ error: 'SERVER_NOT_CONFIGURED', message: error }, 503) : confirmPartnersController(request, env);
    }

    if (path === '/api/admin' && ['GET', 'POST'].includes(request.method)) {
      const error = configError(env);
      if (error) return json({ error: 'SERVER_NOT_CONFIGURED', message: error }, 503);
      return request.method === 'GET'
        ? getAdminController(request, env)
        : updateAdminController(request, env);
    }
    return json({ error: 'NOT_FOUND' }, 404);
  }

  if (path === '/admin') {
    return env.ASSETS.fetch(new URL('/admin.html', request.url));
  }

  const legacyShare = path.match(/^\/c\/([a-z0-9-]+)$/);
  if (legacyShare) {
    const oldParticipant = PARTICIPANTS.find((item) => item.id === legacyShare[1]);
    if (oldParticipant) {
      return Response.redirect(new URL(`/${oldParticipant.slug}`, request.url), 308);
    }
  }

  const participant = PARTICIPANTS.find((item) => `/${item.slug}` === path);
  if (participant) return shareParticipant(request, env, participant.slug);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return withSecurityHeaders(await route(request, env), request, env);
    } catch (error) {
      console.error('Intercanto Worker request failed:', error);
      const path = new URL(request.url).pathname;
      if (path.startsWith('/api/')) return json({ error: 'SERVER_ERROR', message: 'Error temporal del servidor.' }, 503);
      return new Response('Error temporal', { status: 503, headers: SECURITY_HEADERS });
    }
  },
};
