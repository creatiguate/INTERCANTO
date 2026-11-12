import { apiUrl } from '../../config.js';

let configPromise;
let clientPromise;
let googleIdentityPromise;

export async function getPublicConfig() {
  if (!configPromise) {
    configPromise = fetch(apiUrl('/api/config'), { cache: 'no-store' }).then(async (response) => {
      const contentType = response.headers.get('Content-Type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('No se pudo conectar con la votación. Intenta de nuevo más tarde.');
      }
      const data = await response.json();
      if (!response.ok) throw new Error('No se pudo cargar la votación. Intenta de nuevo más tarde.');
      return data;
    }).catch((error) => {
      // Permite reintentar cuando se ha iniciado el servidor después de abrir la página.
      configPromise = null;
      if (error instanceof TypeError || error instanceof SyntaxError) {
        throw new Error('No se pudo conectar con la votación. Intenta de nuevo más tarde.');
      }
      throw error;
    });
  }
  return configPromise;
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = await getPublicConfig();
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.119.0');
      return createClient(config.supabaseUrl, config.publishableKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!googleIdentityPromise) {
    googleIdentityPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google?.accounts?.id) resolve(window.google);
        else reject(new Error('Google Identity Services no pudo inicializarse.'));
      };
      script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'));
      document.head.append(script);
    }).catch((error) => {
      googleIdentityPromise = null;
      throw error;
    });
  }
  return googleIdentityPromise;
}

async function createGoogleNonce() {
  const rawNonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
  const googleNonce = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { rawNonce, googleNonce };
}

export async function mountGoogleSignIn(buttonContainers, onError) {
  const containers = Array.isArray(buttonContainers) ? buttonContainers : [buttonContainers];
  if (!containers.length || containers.some((container) => !container)) {
    throw new Error('No se pudo cargar el inicio de sesión con Google. Intenta de nuevo más tarde.');
  }

  const config = await getPublicConfig();
  if (!config.googleClientId) {
    throw new Error('No se pudo iniciar sesión con Google. Intenta de nuevo más tarde.');
  }
  if (!/^[^\s]+\.apps\.googleusercontent\.com$/.test(config.googleClientId)) {
    throw new Error('No se pudo iniciar sesión con Google. Intenta de nuevo más tarde.');
  }

  const google = await loadGoogleIdentityServices();
  const { rawNonce, googleNonce } = await createGoogleNonce();
  google.accounts.id.initialize({
    client_id: config.googleClientId,
    nonce: googleNonce,
    ux_mode: 'popup',
    auto_select: false,
    callback: async (response) => {
      if (!response?.credential) {
        onError(new Error('No se pudo iniciar sesión con Google. Intenta de nuevo.'));
        return;
      }
      try {
        const client = await getClient();
        const { error } = await client.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
          nonce: rawNonce,
        });
        if (error) throw error;
      } catch (error) {
        onError(error instanceof Error ? error : new Error('No se pudo validar la cuenta de Google.'));
      }
    },
  });

  containers.forEach((buttonContainer) => {
    buttonContainer.replaceChildren();
    google.accounts.id.renderButton(buttonContainer, {
      type: 'standard',
      theme: 'filled_blue',
      size: 'large',
      text: 'signup_with',
      shape: 'pill',
      logo_alignment: 'left',
      locale: 'es',
      width: Math.min(Math.floor(buttonContainer.getBoundingClientRect().width) || 320, 400),
      use_fedcm_for_button: true,
    });
  });
}

export async function getSession() {
  const client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle() {
  const client = await getClient();
  const next = `${window.location.pathname}${window.location.search}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${next}`,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  const client = await getClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function subscribeToAuth(callback) {
  const client = await getClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
