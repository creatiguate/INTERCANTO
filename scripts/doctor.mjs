/** Comprobador sin efectos secundarios: nunca imprime ni publica secretos. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('.dev.vars');
const online = process.argv.includes('--online');
const issues = [];
const notes = [];

function readVars() {
  if (!existsSync(file)) {
    issues.push('Falta .dev.vars. Ejecuta npm run local:setup.');
    return {};
  }
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    try { values[match[1]] = JSON.parse(match[2]); }
    catch { values[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); }
  }
  return values;
}

const values = readVars();
const check = (name, valid, message) => {
  if (!values[name]) issues.push(`Falta ${name}.`);
  else if (!valid(values[name])) issues.push(`${name}: ${message}`);
  else notes.push(`${name}: formato correcto.`);
};

check('SUPABASE_URL', (v) => {
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') && url.pathname === '/';
  } catch { return false; }
}, 'debe ser https://<id>.supabase.co/');
check('SUPABASE_PUBLISHABLE_KEY', (v) => typeof v === 'string' && (
  v.startsWith('sb_publishable_') || jwtRole(v) === 'anon'
), 'usa publishable o anon, no secret.');
check('SUPABASE_SERVER_KEY', (v) => typeof v === 'string' && (
  v.startsWith('sb_secret_') || jwtRole(v) === 'service_role'
), 'usa secret o service_role, no publishable.');
check('GOOGLE_CLIENT_ID', (v) => typeof v === 'string' && /^[^\s]+\.apps\.googleusercontent\.com$/.test(v),
  'debe terminar en .apps.googleusercontent.com');
check('IP_HASH_SECRET', (v) => typeof v === 'string' && v.length >= 32,
  'debe tener al menos 32 caracteres.');

function jwtRole(key) {
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role; }
  catch { return null; }
}

if (online && issues.length === 0) {
  const headers = { apikey: values.SUPABASE_SERVER_KEY, 'Content-Type': 'application/json' };
  const origin = values.SUPABASE_URL.replace(/\/$/, '');
  try {
    const response = await fetch(`${origin}/rest/v1/rpc/get_voting_public_state`, {
      method: 'POST', headers, body: JSON.stringify({ p_edition_id: 'intercanto-t3' }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) issues.push(`Supabase: RPC get_voting_public_state devolvió HTTP ${response.status}. Revisa las migraciones SQL y la clave de servidor.`);
    else {
      const voting = await response.json();
      if (voting?.editionId !== 'intercanto-t3' || !Array.isArray(voting?.participants) || voting.participants.length !== 7) {
        issues.push('Supabase: la función respondió, pero faltan datos de los 7 participantes.');
      } else notes.push('Supabase: conexión real y participantes OK.');
    }
  } catch (error) { issues.push(`Supabase: no fue posible conectar (${error?.name || 'error de red'}).`); }

  try {
    const response = await fetch(`${origin}/auth/v1/settings`, {
      headers: { apikey: values.SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) issues.push(`Supabase Auth: HTTP ${response.status}.`);
    else {
      const settings = await response.json();
      if (settings?.external?.google === false) issues.push('Supabase Auth: el proveedor Google está deshabilitado.');
      else notes.push('Supabase Auth: API accesible (revisa los orígenes de Google Cloud manualmente).');
    }
  } catch (error) { issues.push(`Supabase Auth: no fue posible conectar (${error?.name || 'error de red'}).`); }
}

console.log(`\nDIAGNÓSTICO INTERCANTO (${online ? 'local + Supabase remoto' : 'formato local'})`);
for (const message of notes) console.log(`  OK   ${message}`);
for (const message of issues) console.error(`  ERROR ${message}`);
console.log('No se muestran secretos ni se escriben votos.');
if (!online) console.log('Para comprobar la base de datos de forma remota: npm run doctor:online');
if (!issues.length) console.log('Configuración comprobada. Google Cloud requiere también verificar manualmente sus orígenes OAuth.');
else process.exitCode = 1;
