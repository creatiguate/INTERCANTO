import { getGoogleUser } from '../models/supabase.js';
import { json } from './http.js';

export async function requireGoogleUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/);
  if (!match) {
    return { response: json({ error: 'AUTH_REQUIRED', message: 'Inicia sesión con Google para continuar.' }, 401) };
  }
  try {
    const user = await getGoogleUser(env, match[1]);
    if (!user) {
      return { response: json({ error: 'AUTH_REQUIRED', message: 'Inicia sesión con una cuenta de Google válida.' }, 401) };
    }
    return { user };
  } catch (error) {
    console.error('Supabase Auth validation failed:', error);
    return { response: json({ error: 'AUTH_UNAVAILABLE', message: 'No se pudo validar la sesión. Intenta nuevamente.' }, 503) };
  }
}
