import { PARTICIPANTS } from '../models/participants.js';

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export async function shareParticipant(request, env, slug) {
  const participant = PARTICIPANTS.find((item) => item.slug === slug);
  if (!participant) return new Response('Participante no encontrado', { status: 404 });

  const response = await env.ASSETS.fetch(new URL('/index.html', request.url));
  if (!response.ok) return response;
  const html = await response.text();
  const title = `Apoya a ${participant.name} en INTERCANTO T3`;
  const description = `Conoce a ${participant.name} y apoya su talento en Intercanto Temporada 3.`;
  const image = new URL(participant.photo, request.url).href;
  const canonical = new URL(`/${participant.slug}`, request.url).href;
  const metadata = [
    `<meta property="og:url" content="${escapeAttribute(canonical)}">`,
    `<meta name="twitter:title" content="${escapeAttribute(title)}">`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}">`,
    `<meta name="twitter:image" content="${escapeAttribute(image)}">`,
  ].join('');
  const personalized = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(title)}</title>`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeAttribute(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeAttribute(description)}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeAttribute(image)}">`)
    .replace('<!-- OG_DYNAMIC -->', metadata);

  return new Response(personalized, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
