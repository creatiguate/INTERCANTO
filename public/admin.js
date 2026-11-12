import { getAdminState, updateAdmin } from './js/models/voting-model.js';
import { getPublicConfig, getSession, signInWithGoogle, subscribeToAuth } from './js/models/auth-model.js';
import { AdminController } from './js/controllers/admin-controller.js';

if (window.location.hostname.endsWith('.github.io') || window.location.pathname.includes('/public/')) {
  const homeLink = document.querySelector('.admin-back');
  if (homeLink) homeLink.href = new URL('./index.html', window.location.href).href;
}

const app = new AdminController();
Promise.all([getPublicConfig(), getSession()])
  .then(() => app.start())
  .then(() => subscribeToAuth(() => app.refresh()))
  .catch((error) => {
    console.error('Admin panel failed to start:', error);
    app.showError(error.message || 'No se pudo iniciar el panel.');
  });

export { getAdminState, updateAdmin, signInWithGoogle };
