import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../src/index.js';

const participantId = 'eyfrid-enrique-matias';
const validVote = {
  participantId,
  quantity: 2,
  requestId: '37cdd9e7-7588-4ed1-8c43-34c079358344',
};

function setup({ rpcResponses = {}, authUser } = {}) {
  const calls = [];
  const env = {
    SUPABASE_URL: 'https://creatiguate-test.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
    SUPABASE_SERVER_KEY: 'sb_secret_test-key',
    IP_HASH_SECRET: 'test-secret-with-at-least-thirty-two-characters',
    GOOGLE_CLIENT_ID: 'example.apps.googleusercontent.com',
    SUPABASE_FETCH: async (input, options = {}) => {
      const url = new URL(input);
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, options, body });

      if (url.pathname === '/auth/v1/user') {
        return authUser
          ? Response.json(authUser)
          : Response.json({ message: 'Invalid token' }, { status: 401 });
      }

      const rpcName = url.pathname.split('/').pop();
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const result = rpcResponses[rpcName] ?? {};
        if (result.status) {
          return Response.json(result.body, { status: result.status });
        }
        return Response.json(result);
      }

      throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    },
  };

  const request = (path, { method = 'GET', body, headers = {}, ip = '10.0.0.1' } = {}) => {
    const requestHeaders = {
      'CF-Connecting-IP': ip,
      ...(method !== 'GET' && body !== undefined ? { 'Content-Type': 'application/json', Origin: 'https://intercanto.example' } : {}),
      ...headers,
    };
    return new Request(`https://intercanto.example${path}`, {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };

  return { env, calls, request };
}

const googleUser = {
  id: 'b6f8fb45-9f4b-4b3b-bbb5-40f335f94207',
  email: 'voter@example.test',
  app_metadata: { provider: 'google' },
};

test('public state is read through the aggregate RPC', async () => {
  const state = {
    editionId: 'intercanto-t3',
    isOpen: true,
    participants: [{ id: participantId, votes: 4 }],
  };
  const app = setup({ rpcResponses: { get_voting_public_state: state } });

  const response = await handler.fetch(app.request('/api/state'), app.env);

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).voting, state);
  assert.equal(app.calls[0].url.pathname, '/rest/v1/rpc/get_voting_public_state');
});

test('worker responses include transport and browser security headers', async () => {
  const app = setup();
  const response = await handler.fetch(app.request('/api/config'), app.env);

  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'self'/);
});

test('voting requires a valid Google session and same-origin request', async () => {
  const app = setup();
  const noSession = await handler.fetch(
    app.request('/api/vote', { method: 'POST', body: validVote }),
    app.env,
  );
  assert.equal(noSession.status, 401);
  assert.equal(app.calls.length, 0);

  const externalOrigin = await handler.fetch(
    app.request('/api/vote', {
      method: 'POST',
      body: validVote,
      headers: {
        Origin: 'https://attacker.example',
        Authorization: 'Bearer test-access-token-long-enough',
      },
    }),
    app.env,
  );
  assert.equal(externalOrigin.status, 403);
  assert.equal(app.calls.length, 0);
});

test('an authenticated vote sends the server-only HMAC to the cast RPC', async () => {
  const app = setup({
    authUser: googleUser,
    rpcResponses: {
      cast_intercanto_votes: { votesUsed: 2, votesRemaining: 8, replayed: false },
    },
  });

  const response = await handler.fetch(
    app.request('/api/vote', {
      method: 'POST',
      body: validVote,
      headers: { Authorization: 'Bearer test-access-token-long-enough' },
    }),
    app.env,
  );

  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).result, {
    votesUsed: 2,
    votesRemaining: 8,
    replayed: false,
  });
  const castCall = app.calls.find((call) => call.url.pathname.endsWith('/cast_intercanto_votes'));
  assert.match(castCall.body.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.equal(new Headers(castCall.options.headers).get('apikey'), app.env.SUPABASE_SERVER_KEY);
  assert.equal(new Headers(castCall.options.headers).get('Authorization'), null);
});

test('configured Turnstile rejects a vote without a challenge token', async () => {
  const app = setup({ authUser: googleUser });
  app.env.TURNSTILE_SITE_KEY = 'test-site-key';
  app.env.TURNSTILE_SECRET_KEY = 'test-secret-key';

  const response = await handler.fetch(
    app.request('/api/vote', {
      method: 'POST',
      body: validVote,
      headers: { Authorization: 'Bearer test-access-token-long-enough' },
    }),
    app.env,
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'TURNSTILE_REQUIRED');
  assert.equal(app.calls.some((call) => call.url.pathname.endsWith('/cast_intercanto_votes')), false);
});

test('an authenticated vote requires Turnstile success for the origin and vote action', async () => {
  const app = setup({
    authUser: googleUser,
    rpcResponses: {
      cast_intercanto_votes: { votesUsed: 2, votesRemaining: 8, replayed: false },
    },
  });
  app.env.TURNSTILE_SITE_KEY = 'test-site-key';
  app.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
  const originalFetch = globalThis.fetch;
  let verifyRequest;
  globalThis.fetch = async (input, options) => {
    verifyRequest = { url: String(input), options };
    return Response.json({ success: true, hostname: 'intercanto.example', action: 'vote' });
  };

  try {
    const response = await handler.fetch(
      app.request('/api/vote', {
        method: 'POST',
        body: { ...validVote, turnstileToken: 'test-turnstile-token' },
        headers: { Authorization: 'Bearer test-access-token-long-enough' },
      }),
      app.env,
    );

    assert.equal(response.status, 201);
    assert.equal(verifyRequest.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.match(String(verifyRequest.options.body), /secret=test-secret-key/);
    assert.equal(app.calls.some((call) => call.url.pathname.endsWith('/cast_intercanto_votes')), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Turnstile rejects a successful response for another hostname or action', async () => {
  const app = setup({ authUser: googleUser });
  app.env.TURNSTILE_SITE_KEY = 'test-site-key';
  app.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
  const originalFetch = globalThis.fetch;

  try {
    for (const result of [
      { success: true, hostname: 'attacker.example', action: 'vote' },
      { success: true, hostname: 'intercanto.example', action: 'other' },
    ]) {
      globalThis.fetch = async () => Response.json(result);
      const response = await handler.fetch(
        app.request('/api/vote', {
          method: 'POST',
          body: { ...validVote, turnstileToken: 'test-turnstile-token' },
          headers: { Authorization: 'Bearer test-access-token-long-enough' },
        }),
        app.env,
      );

      assert.equal(response.status, 403);
    }
    assert.equal(app.calls.some((call) => call.url.pathname.endsWith('/cast_intercanto_votes')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid vote input is rejected before contacting Supabase', async () => {
  const app = setup();

  const response = await handler.fetch(
    app.request('/api/vote', { method: 'POST', body: { ...validVote, quantity: 11 } }),
    app.env,
  );

  assert.equal(response.status, 400);
  assert.equal(app.calls.length, 0);
});

test('missing HMAC configuration blocks protected state requests', async () => {
  const app = setup();
  delete app.env.IP_HASH_SECRET;

  const response = await handler.fetch(app.request('/api/state'), app.env);

  assert.equal(response.status, 503);
  assert.equal(app.calls.length, 0);
});

test('legacy participant links redirect to planet slugs', async () => {
  const app = setup();

  const response = await handler.fetch(
    app.request('/c/angel-gabriel-tevalan'),
    app.env,
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), 'https://intercanto.example/venus');
});

test('clean section and participant aliases redirect to existing routes', async () => {
  const app = setup();
  const participants = await handler.fetch(app.request('/participantes'), app.env);
  const ranking = await handler.fetch(app.request('/ranking'), app.env);
  const profile = await handler.fetch(app.request('/participantes/venus'), app.env);

  assert.equal(participants.status, 308);
  assert.equal(participants.headers.get('Location'), 'https://intercanto.example/#participantes');
  assert.equal(ranking.status, 308);
  assert.equal(ranking.headers.get('Location'), 'https://intercanto.example/#ranking');
  assert.equal(profile.status, 308);
  assert.equal(profile.headers.get('Location'), 'https://intercanto.example/venus');
});

test('planet profile routes return participant-specific social metadata', async () => {
  const app = setup();
  app.env.ASSETS = {
    fetch: async () => new Response(
      '<title>Intercanto</title><meta property="og:title" content="Intercanto"><meta property="og:description" content="demo"><meta property="og:image" content="/assets/poster.webp"><!-- OG_DYNAMIC -->',
      { headers: { 'Content-Type': 'text/html' } },
    ),
  };

  const response = await handler.fetch(app.request('/venus'), app.env);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Apoya a Ángel Gabriel Tevalán/);
  assert.match(html, /angel-gabriel-tevalan\.webp/);
});


test('cross-origin API preflight only accepts explicitly configured GitHub Pages', async () => {
  const app = setup();
  app.env.FRONTEND_ORIGINS = 'https://creatiguate.github.io';
  const allowed = await handler.fetch(
    app.request('/api/vote', { method: 'OPTIONS', headers: {
      Origin: 'https://creatiguate.github.io',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    } }), app.env,
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://creatiguate.github.io');
  assert.match(allowed.headers.get('access-control-allow-headers'), /Authorization/);
  const rejected = await handler.fetch(
    app.request('/api/vote', { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } }), app.env,
  );
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('authorized GitHub Pages origin can submit authenticated real votes', async () => {
  const app = setup({ authUser: googleUser, rpcResponses: {
    cast_intercanto_votes: { votesUsed: 2, votesRemaining: 8, replayed: false },
  } });
  app.env.FRONTEND_ORIGINS = 'https://creatiguate.github.io';
  const result = await handler.fetch(
    app.request('/api/vote', { method: 'POST', body: validVote, headers: {
      Origin: 'https://creatiguate.github.io', Authorization: 'Bearer test-access-token-long-enough',
    } }), app.env,
  );
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('access-control-allow-origin'), 'https://creatiguate.github.io');
  assert.equal((await result.json()).result.votesUsed, 2);
});

test('public /api/config never returns a Supabase server key', async () => {
  const app = setup();
  const response = await handler.fetch(app.request('/api/config'), app.env);
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.googleClientId, app.env.GOOGLE_CLIENT_ID);
  assert.equal(config.publishableKey, app.env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(config.turnstileSiteKey, null);
  assert.equal(JSON.stringify(config).includes(app.env.SUPABASE_SERVER_KEY), false);
});

test('partial Turnstile configuration fails closed', async () => {
  const app = setup();
  app.env.TURNSTILE_SITE_KEY = 'test-site-key';

  const response = await handler.fetch(app.request('/api/config'), app.env);

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'SERVER_NOT_CONFIGURED');
});

test('local Wrangler without Cloudflare IP header can cast votes, but public host cannot', async () => {
  const app = setup({ authUser: googleUser, rpcResponses: {
    cast_intercanto_votes: { votesUsed: 2, votesRemaining: 8 },
  } });
  const headers = { Authorization: 'Bearer test-access-token-long-enough',
    Origin: 'http://localhost:8787', 'Content-Type': 'application/json' };
  const local = await handler.fetch(new Request('http://localhost:8787/api/vote', {
    method: 'POST', headers, body: JSON.stringify(validVote),
  }), app.env);
  assert.equal(local.status, 201);
  const remote = await handler.fetch(new Request('https://intercanto.example/api/vote', {
    method: 'POST', headers: { ...headers, Origin: 'https://intercanto.example' },
    body: JSON.stringify(validVote),
  }), app.env);
  assert.equal(remote.status, 503);
});
