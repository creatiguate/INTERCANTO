/**
 * Configuración PUBLICA del frontend (sin claves de Supabase).
 * - Cloudflare Worker / npm run dev: deja la cadena vacía (API del mismo sitio).
 * - GitHub Pages: escribe la URL HTTPS REAL de tu Worker, sin barra final.
 *   Ejemplo: 'https://mi-worker.mi-subdominio.workers.dev'
 * IMPORTANTÍSIMO: jamás incluyas aquí sb_secret_, service_role, contraseñas ni tokens.
 */
export const API_ORIGIN = 'https://creatiguate-intercanto-votaciones.creatiguate2003.workers.dev';
