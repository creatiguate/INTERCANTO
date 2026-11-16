export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://*.supabase.co; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; script-src 'self' https://esm.sh https://accounts.google.com https://apis.google.com https://www.gstatic.com https://challenges.cloudflare.com; connect-src 'self' https://*.supabase.co https://accounts.google.com https://apis.google.com https://esm.sh https://www.gstatic.com https://challenges.cloudflare.com https://creatiguate-intercanto-votaciones.creatiguate2003.workers.dev; frame-src https://accounts.google.com https://challenges.cloudflare.com https://*.supabase.co; worker-src 'self' blob:",
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

export function errorResponse(error) {
  const code = error?.code;
  if (code === '28000') return json({ error: 'AUTH_REQUIRED', message: 'Inicia sesión con Google para continuar.' }, 401);
  if (code === '42501') return json({ error: 'FORBIDDEN', message: 'No tienes permiso para esta acción.' }, 403);
  if (code === '53300') return json({ error: 'RATE_LIMITED', message: 'Hay muchas solicitudes desde esta red. Intenta en unos minutos.' }, 429);
  if (code === '55000') return json({ error: 'REQUIREMENTS_NOT_MET', message: 'Completa los pasos requeridos antes de continuar.' }, 409);
  if (code === '22023') return json({ error: 'INVALID_REQUEST', message: 'La solicitud no es válida o excede tus votos disponibles.' }, 400);
  console.error('Intercanto request failed:', error);
  return json({ error: 'SERVER_ERROR', message: 'No se pudo completar la operación. Intenta nuevamente.' }, 503);
}

export function isAllowedOrigin(request, env = {}) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === 'null') return false;
  const ownOrigin = new URL(request.url).origin;
  if (origin === ownOrigin) return true;

  // Los navegadores de GitHub Pages pueden consultar el Worker. Nunca "*".
  const permitted = String(env.FRONTEND_ORIGINS || '').split(',').map((value) => value.trim());
  return permitted.some((value) => {
    if (!value || value === '*') return false;
    try {
      const url = new URL(value);
      return url.origin === origin && value === url.origin &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
    } catch {
      return false;
    }
  });
}

export function hasSameOrigin(request, env = {}) {
  return isAllowedOrigin(request, env);
}

export async function readJson(request, maxBytes = 4096) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return { error: json({ error: 'INVALID_CONTENT_TYPE', message: 'Se requiere JSON.' }, 415) };
  }
  const raw = await request.text();
  if (raw.length > maxBytes) {
    return { error: json({ error: 'TOO_LARGE', message: 'Solicitud demasiado grande.' }, 413) };
  }
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { error: json({ error: 'BAD_JSON', message: 'La solicitud no contiene JSON válido.' }, 400) };
  }
}
