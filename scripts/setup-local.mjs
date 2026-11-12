import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const target = new URL('../.dev.vars', import.meta.url);
const original = existsSync(target) ? readFileSync(target, 'utf8') : '';

function readValue(name) {
  const line = original.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  if (!line) return '';
  const value = line.slice(name.length + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return ''; }
  }
  return value;
}

function isServerKey(value) {
  if (value.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString());
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

function isPublishableKey(value) {
  if (value.startsWith('sb_publishable_')) return true;
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString());
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

function validSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname.endsWith('.supabase.co')
      && url.pathname === '/'
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

const rl = createInterface({ input: stdin, output: stdout });
try {
  console.log('Configuración local de Supabase para el Worker.');
  console.log('Pega URL y claves de Supabase, y el Client ID web de Google.');
  console.log('Deja un campo vacío para conservar el valor local que ya exista.');

  const currentUrl = readValue('SUPABASE_URL');
  const enteredUrl = (await rl.question(`URL de Supabase${currentUrl ? ' [configurada]' : ''}: `)).trim();
  const supabaseUrl = enteredUrl || currentUrl;
  if (!supabaseUrl) throw new Error('Falta la URL de Supabase.');
  if (!validSupabaseUrl(supabaseUrl)) throw new Error('La URL debe tener el formato https://<project-ref>.supabase.co.');

  const currentPublishableKey = readValue('SUPABASE_PUBLISHABLE_KEY');
  const enteredPublishableKey = (await rl.question(`Clave publishable/anon${currentPublishableKey ? ' [configurada]' : ''}: `)).trim();
  const publishableKey = enteredPublishableKey || currentPublishableKey;
  if (!publishableKey) throw new Error('Falta la clave publishable de Supabase.');
  if (!isPublishableKey(publishableKey)) throw new Error('La clave debe ser sb_publishable_... o una clave heredada anon; no uses service_role.');

  const currentKey = readValue('SUPABASE_SERVER_KEY');
  const enteredKey = (await rl.question(`Clave de servidor${currentKey ? ' [configurada]' : ''}: `)).trim();
  const serverKey = enteredKey || currentKey;
  if (!serverKey) throw new Error('Falta una clave de servidor de Supabase.');
  if (!isServerKey(serverKey)) throw new Error('La clave debe ser sb_secret_... o una clave heredada service_role; no uses la publishable/anon key.');

  const currentGoogleClientId = readValue('GOOGLE_CLIENT_ID');
  const enteredGoogleClientId = (await rl.question(`Client ID web de Google${currentGoogleClientId ? ' [configurado]' : ''}: `)).trim();
  const googleClientId = enteredGoogleClientId || currentGoogleClientId;
  if (!googleClientId) throw new Error('Falta el Client ID web de Google para Google Identity Services.');
  if (!googleClientId.endsWith('.apps.googleusercontent.com')) {
    throw new Error('El Client ID web de Google debe terminar en .apps.googleusercontent.com.');
  }

  const values = {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SERVER_KEY: serverKey,
    GOOGLE_CLIENT_ID: googleClientId,
  };
  const ipHashSecret = readValue('IP_HASH_SECRET');
  if (ipHashSecret && ipHashSecret.length < 32) {
    throw new Error('El IP_HASH_SECRET existente es demasiado corto. Reemplázalo por un secreto aleatorio de al menos 32 caracteres.');
  }
  values.IP_HASH_SECRET = ipHashSecret || randomBytes(32).toString('hex');
  const lines = original ? original.split(/\r?\n/) : [];
  for (const [name, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${name}=`));
    if (index === -1) lines.push(`${name}=${JSON.stringify(value)}`);
    else lines[index] = `${name}=${JSON.stringify(value)}`;
  }

  writeFileSync(target, `${lines.filter((line, index) => line || index < lines.length - 1).join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log('\nConfiguración guardada en .dev.vars (archivo ignorado por Git).');
  console.log('Siguiente paso: npm run dev');
} catch (error) {
  console.error(`\nNo se guardó la configuración: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
