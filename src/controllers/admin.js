import { PARTNERS } from '../models/participants.js';
import { getAdminOverview, setVotingOpen, updatePartner } from '../models/supabase.js';
import { requireGoogleUser } from './auth.js';
import { errorResponse, hasSameOrigin, json, readJson } from './http.js';

export async function getAdminController(request, env) {
  const authenticated = await requireGoogleUser(request, env);
  if (authenticated.response) return authenticated.response;
  try {
    const overview = await getAdminOverview(env, authenticated.user.id);
    return json({ overview });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function updateAdminController(request, env) {
  if (!hasSameOrigin(request, env)) return json({ error: 'INVALID_ORIGIN', message: 'Origen no permitido.' }, 403);
  const parsed = await readJson(request, 4096);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  const authenticated = await requireGoogleUser(request, env);
  if (authenticated.response) return authenticated.response;

  try {
    if (body?.action === 'set-open' && typeof body.isOpen === 'boolean') {
      await setVotingOpen(env, authenticated.user.id, body.isOpen);
    } else if (
      body?.action === 'update-partner' &&
      PARTNERS.some((partner) => partner.id === body.partnerId) &&
      (typeof body.url === 'string' || body.url === null) &&
      typeof body.active === 'boolean'
    ) {
      if (body.url !== null) {
        let url;
        try {
          url = new URL(body.url);
        } catch {
          return json({ error: 'INVALID_URL', message: 'Ingresa una URL válida.' }, 400);
        }
        if (url.protocol !== 'https:' || url.username || url.password) {
          return json({ error: 'INVALID_URL', message: 'El enlace debe usar HTTPS y no incluir credenciales.' }, 400);
        }
      }
      await updatePartner(env, authenticated.user.id, {
        partnerId: body.partnerId,
        url: body.url,
        active: body.active,
      });
    } else {
      return json({ error: 'INVALID_ACTION', message: 'Acción o valores inválidos.' }, 400);
    }
    const overview = await getAdminOverview(env, authenticated.user.id);
    return json({ ok: true, overview });
  } catch (error) {
    return errorResponse(error);
  }
}
