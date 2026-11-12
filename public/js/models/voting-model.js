import { getSession } from './auth-model.js';
import { apiUrl } from '../../config.js';

// No hay modo demo: toda respuesta y todo voto vienen del Worker conectado a Supabase.
async function api(path, options = {}) {
  let session;
  try {
    session = await getSession();
  } catch {
    throw new Error('No se pudo conectar con la votación. Intenta de nuevo más tarde.');
  }
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body) headers.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(apiUrl(path), { ...options, headers, cache: 'no-store' });
  } catch {
    throw new Error('No se pudo conectar con la votación. Intenta de nuevo más tarde.');
  }
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('No se pudo conectar con la votación. Intenta de nuevo más tarde.');
  }
  const body = await response.json();
  if (!response.ok) {
    const message = body.error === 'SERVER_NOT_CONFIGURED' || body.error === 'SERVER_ERROR'
      ? 'No se pudo conectar con la votación. Intenta de nuevo más tarde.'
      : body.message || 'No se pudo completar la solicitud. Intenta de nuevo.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function getVotingState() {
  return api('/api/state');
}

export function castVotes(input) {
  return api('/api/vote', { method: 'POST', body: JSON.stringify(input) });
}

export function getAdminState() {
  return api('/api/admin');
}

export function updateAdmin(input) {
  return api('/api/admin', { method: 'POST', body: JSON.stringify(input) });
}
