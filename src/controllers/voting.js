import { PARTICIPANTS } from '../models/participants.js';
import {
  castVotes,
  confirmPartners,
  getPublicState,
  getUserState,
  recordPartnerVisit,
} from '../models/supabase.js';
import { requireGoogleUser } from './auth.js';
import { errorResponse, hasSameOrigin, json, readJson } from './http.js';
import { isOpen } from './voting-rules.js';

async function hashIp(request, env) {
  // Wrangler local no siempre envía CF-Connecting-IP. No confiar en cabeceras
  // manipulables para reemplazar la IP en producción.
  const hostname = new URL(request.url).hostname;
  const local = ['localhost', '127.0.0.1'].includes(hostname);
  const ip = request.headers.get('CF-Connecting-IP') || (local ? '127.0.0.1' : null);
  if (!ip || !env.IP_HASH_SECRET || env.IP_HASH_SECRET.length < 32) {
    throw new Error('CF client IP or a 32-character IP_HASH_SECRET is required.');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.IP_HASH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function participantExists(id) {
  return typeof id === 'string' && PARTICIPANTS.some((participant) => participant.id === id);
}

export async function getConfigController(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.GOOGLE_CLIENT_ID) {
    return json({ error: 'SERVER_NOT_CONFIGURED', message: 'Faltan SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY o GOOGLE_CLIENT_ID en el servidor.' }, 503);
  }
  return json({
    supabaseUrl: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
  }, 200, { 'Cache-Control': 'public, max-age=300' });
}

export async function getStateController(request, env) {
  try {
    const voting = await getPublicState(env);
    const authorization = request.headers.get('Authorization');
    let user = null;
    let personal = null;
    if (authorization) {
      const authenticated = await requireGoogleUser(request, env);
      if (authenticated.response) return authenticated.response;
      user = authenticated.user;
      personal = await getUserState(env, user.id);
    }
    return json({
      voting,
      personal,
      user: user ? { id: user.id, email: user.email || null } : null,
      open: isOpen(env) && voting?.isOpen !== false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function castVoteController(request, env) {
  if (!hasSameOrigin(request, env)) return json({ error: 'INVALID_ORIGIN', message: 'Origen no permitido.' }, 403);
  if (!isOpen(env)) return json({ error: 'VOTING_CLOSED', message: 'La votación está cerrada.' }, 423);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  if (
    !body || typeof body !== 'object' ||
    !participantExists(body.participantId) ||
    !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 10 ||
    typeof body.requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)
  ) {
    return json({ error: 'INVALID_VOTE', message: 'Participante, cantidad o identificador inválido.' }, 400);
  }

  const authenticated = await requireGoogleUser(request, env);
  if (authenticated.response) return authenticated.response;
  try {
    const result = await castVotes(env, {
      userId: authenticated.user.id,
      participantId: body.participantId,
      quantity: body.quantity,
      requestId: body.requestId,
      ipHash: await hashIp(request, env),
    });
    return json({ ok: true, result }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function recordPartnerVisitController(request, env) {
  if (!hasSameOrigin(request, env)) return json({ error: 'INVALID_ORIGIN', message: 'Origen no permitido.' }, 403);
  const parsed = await readJson(request, 1024);
  if (parsed.error) return parsed.error;
  if (!parsed.body || typeof parsed.body.partnerId !== 'string') {
    return json({ error: 'INVALID_PARTNER', message: 'Colaborador inválido.' }, 400);
  }
  const authenticated = await requireGoogleUser(request, env);
  if (authenticated.response) return authenticated.response;
  try {
    await recordPartnerVisit(env, authenticated.user.id, parsed.body.partnerId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function confirmPartnersController(request, env) {
  if (!hasSameOrigin(request, env)) return json({ error: 'INVALID_ORIGIN', message: 'Origen no permitido.' }, 403);
  const parsed = await readJson(request, 1024);
  if (parsed.error) return parsed.error;
  if (parsed.body?.acknowledged !== true) {
    return json({ error: 'ACKNOWLEDGMENT_REQUIRED', message: 'Confirma expresamente que visitaste las páginas.' }, 400);
  }
  const authenticated = await requireGoogleUser(request, env);
  if (authenticated.response) return authenticated.response;
  try {
    await confirmPartners(env, authenticated.user.id, true);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
