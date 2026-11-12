export function configError(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVER_KEY || !env.SUPABASE_PUBLISHABLE_KEY) {
    return 'Faltan SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY o SUPABASE_SERVER_KEY.';
  }
  if (!env.IP_HASH_SECRET || env.IP_HASH_SECRET.length < 32) {
    return 'IP_HASH_SECRET debe tener al menos 32 caracteres.';
  }
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
      return 'SUPABASE_URL debe apuntar a un proyecto Supabase HTTPS.';
    }
  } catch {
    return 'SUPABASE_URL no es válida.';
  }
  return null;
}

export async function supabaseRequest(env, path, options = {}) {
  const headers = new Headers(options.headers);
  const serverKey = env.SUPABASE_SERVER_KEY;
  headers.set('apikey', serverKey);
  if (!serverKey.startsWith('sb_secret_')) {
    headers.set('Authorization', `Bearer ${serverKey}`);
  }
  if (options.body) headers.set('Content-Type', 'application/json');
  const endpoint = new URL(`/rest/v1/${path}`, env.SUPABASE_URL);
  return (env.SUPABASE_FETCH || fetch)(endpoint, { ...options, headers });
}

export async function rpc(env, functionName, params) {
  const response = await supabaseRequest(env, `rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || `Supabase RPC ${functionName} failed`);
    error.code = body.code || String(response.status);
    throw error;
  }
  return response.json();
}

export async function getGoogleUser(env, accessToken) {
  const endpoint = new URL('/auth/v1/user', env.SUPABASE_URL);
  const response = await (env.SUPABASE_FETCH || fetch)(endpoint, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if ([400, 401, 403].includes(response.status)) return null;
  if (!response.ok) throw new Error(`Supabase Auth returned ${response.status}`);
  const user = await response.json();
  return user?.app_metadata?.provider === 'google' ? user : null;
}

export async function getPublicState(env) {
  return rpc(env, 'get_voting_public_state', { p_edition_id: 'intercanto-t3' });
}

export async function getUserState(env, userId) {
  return rpc(env, 'get_voting_user_state', {
    p_user_id: userId,
    p_edition_id: 'intercanto-t3',
  });
}

export async function castVotes(env, input) {
  return rpc(env, 'cast_intercanto_votes', {
    p_user_id: input.userId,
    p_edition_id: 'intercanto-t3',
    p_participant_id: input.participantId,
    p_quantity: input.quantity,
    p_request_id: input.requestId,
    p_ip_hash: input.ipHash,
  });
}

export async function recordPartnerVisit(env, userId, partnerId) {
  return rpc(env, 'record_voting_partner_visit', {
    p_user_id: userId,
    p_edition_id: 'intercanto-t3',
    p_partner_id: partnerId,
  });
}

export async function confirmPartners(env, userId, acknowledged) {
  return rpc(env, 'confirm_voting_partners', {
    p_user_id: userId,
    p_edition_id: 'intercanto-t3',
    p_acknowledged: acknowledged,
  });
}

export async function getAdminOverview(env, userId) {
  return rpc(env, 'get_voting_admin_overview', {
    p_user_id: userId,
    p_edition_id: 'intercanto-t3',
  });
}

export async function updatePartner(env, userId, input) {
  return rpc(env, 'admin_update_voting_partner', {
    p_user_id: userId,
    p_edition_id: 'intercanto-t3',
    p_partner_id: input.partnerId,
    p_url: input.url,
    p_active: input.active,
  });
}

export async function setVotingOpen(env, userId, isOpen) {
  return rpc(env, 'admin_set_voting_open', {
    p_user_id: userId,
    p_edition_id: 'intercanto-t3',
    p_is_open: isOpen,
  });
}
