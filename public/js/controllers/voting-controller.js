import {
  castVotes,
  getVotingState,
} from '../models/voting-model.js';
import {
  getSession,
  mountGoogleSignIn,
  signInWithGoogle,
  signOut,
  subscribeToAuth,
} from '../models/auth-model.js';
import { PARTICIPANTS, participantUrl } from '../../config.js';
import { VotingView } from '../views/voting-view.js';

export class VotingController {
  constructor() {
    this.view = new VotingView();
    this.data = null;
    this.selectedId = null;
    this.pendingRequest = null;
    this.toastTimer = null;
  }

  async start() {
    this.view.bind({
      signOut: () => this.signOut(),
      signInGoogle: () => this.signInGoogle(),
      refresh: () => this.refresh(true),
      selectParticipant: (id) => this.selectParticipant(id),
      castVotes: () => this.submitVotes(),
      shareParticipant: (id) => this.shareParticipant(id),
      shareSuccess: () => this.shareSuccess(),
      copySuccess: () => this.copySuccess(),
    });
    await this.refresh(false);
    try {
      this.unsubscribe = await subscribeToAuth(() => this.refresh(false));
    } catch (error) {
      console.error('Intercanto auth listener unavailable:', error);
    }
    {
      const googleButtons = [
        document.querySelector('#google-signin-button'),
        document.querySelector('#google-signin-modal-button'),
      ];
      if (googleButtons.some((button) => !button)) {
        this.view.showSignInError('No se pudo cargar el inicio de sesión con Google. Intenta de nuevo más tarde.');
      } else {
        mountGoogleSignIn(googleButtons, () => this.view.showSignInError('No se pudo iniciar sesión con Google. Intenta de nuevo.'))
          .then(() => {
            googleButtons.forEach((button) => { button.dataset.status = 'ready'; });
            this.view.renderAccount(this.data);
          })
          .catch(() => {
            googleButtons.forEach((button) => {
              button.dataset.status = 'fallback';
            });
            this.view.showSignInError('No se pudo cargar el inicio de sesión con Google. Intenta de nuevo más tarde.');
          });
      }
    }
    const slug = new URL(window.location.href).searchParams.get('participant')
      || window.location.pathname.replace(/^\/+|\/+$/g, '');
    const participant = PARTICIPANTS.find((item) => item.slug === slug);
    if (participant && this.data?.open && this.data.user) {
      this.selectParticipant(participant.id);
    }
    if (window.location.hostname.endsWith('.github.io') || window.location.pathname.includes('/public/')) {
      const homeLink = document.querySelector('.site-header .logo');
      if (homeLink) homeLink.href = new URL('./index.html', window.location.href).href;
    }
    window.addEventListener('beforeunload', () => this.unsubscribe?.());
    document.querySelector('#year').textContent = String(new Date().getFullYear());
  }

  async refresh(showToast) {
    try {
      const session = await getSession();
      const response = await getVotingState();
      this.data = {
        ...response,
        user: response.user || session?.user || null,
        ready: true,
        open: response.open === true,
      };
      this.view.clearPageError();
      this.view.render(this.data, this.selectedId);
      if (showToast) this.view.toast('Clasificación actualizada.');
    } catch (error) {
      this.data = { ready: false, open: false, user: null, personal: null, voting: null };
      this.view.render(this.data, this.selectedId);
      this.view.setPageError('No se pudo conectar con la votación. Intenta de nuevo más tarde.');
      console.error('Intercanto state error:', error);
    }
  }

  async signOut() {
    try {
      await signOut();
      this.selectedId = null;
      await this.refresh(false);
    } catch (error) {
      this.view.toast(error.message || 'No se pudo cerrar sesión.');
    }
  }

  async signInGoogle() {
    try {
      await signInWithGoogle();
    } catch {
      this.view.showSignInError('No se pudo iniciar sesión con Google. Intenta de nuevo.');
    }
  }

  selectParticipant(id) {
    const participant = PARTICIPANTS.find((item) => item.id === id);
    if (!participant || !this.data?.open) return;
    if (!this.data.user) {
      this.view.requestSignIn(this.data);
      return;
    }
    const remaining = this.data.personal?.votesRemaining || 0;
    if (remaining < 1) return;
    this.selectedId = id;
    this.view.render(this.data, id);
    this.view.openVote(participant, remaining);
  }

  async submitVotes() {
    const { participant, quantity, confirmed } = this.view.currentVote();
    if (!participant || !this.data?.user || !confirmed) return;
    const fingerprint = `${participant.id}:${quantity}`;
    if (this.pendingRequest?.fingerprint !== fingerprint) {
      this.pendingRequest = { fingerprint, id: crypto.randomUUID() };
    }
    this.view.updateVoteButton(true);
    this.view.clearError('vote-error');
    try {
      await castVotes({
        participantId: participant.id,
        quantity,
        requestId: this.pendingRequest.id,
      });
      this.pendingRequest = null;
      const link = participantUrl(participant.slug);
      this.view.showSuccess(participant, quantity, link);
      this.selectedId = null;
      await this.refresh(false);
    } catch (error) {
      this.view.showError(error.message || 'No se pudo guardar el voto.', 'vote-error');
      this.view.updateVoteButton(false);
    }
  }

  async shareParticipant(id) {
    const participant = PARTICIPANTS.find((item) => item.id === id);
    if (!participant) return;
    await this.share(participant);
  }

  async shareSuccess() {
    if (this.view.successParticipant) await this.share(this.view.successParticipant);
  }

  async share(participant) {
    const url = participantUrl(participant.slug);
    const text = `¡Apoya a ${participant.name} en Intercanto T3! ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Intercanto T3', text, url });
      } else {
        await navigator.clipboard.writeText(text);
        this.view.toast('Mensaje y enlace copiados.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') this.view.toast('No se pudo compartir automáticamente. Copia el enlace del perfil.');
    }
  }

  async copySuccess() {
    const link = this.view.successLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.view.toast('¡Enlace copiado!');
    } catch {
      window.prompt('Copia este enlace:', link);
    }
  }
}

const $ = (selector) => document.querySelector(selector);
