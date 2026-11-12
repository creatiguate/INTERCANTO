import { PARTICIPANTS } from '../../config.js';

const $ = (selector, root = document) => root.querySelector(selector);
const fmt = (value) => new Intl.NumberFormat('es-GT').format(value || 0);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export class VotingView {
  constructor() {
    this.onboarding = $('#onboarding-dialog');
    this.voteDialog = $('#vote-dialog');
    this.successDialog = $('#success-dialog');
    this.currentData = null;
    this.currentParticipant = null;
    this.successParticipant = null;
    this.successLink = '';
    this.signInRequested = false;
    this.revealedParticipantIds = new Set();
    this.participantObserver = null;
    // La aplicación usa exclusivamente Google + Supabase; no hay acceso simulado.
    for (const button of [$('#google-signin-button'), $('#google-signin-modal-button')]) {
      button.dataset.status = 'fallback';
    }
    this.bindDialogs();
  }

  bind(actions) {
    for (const container of [$('#google-signin-button'), $('#google-signin-modal-button')]) {
      container.addEventListener('click', (event) => {
        if (event.target.closest('[data-google-oauth]')) actions.signInGoogle();
      });
    }
    $('#signout-button').addEventListener('click', actions.signOut);
    $('#participants-grid').addEventListener('click', (event) => {
      const vote = event.target.closest('[data-vote-id]');
      if (vote && !vote.disabled) actions.selectParticipant(vote.dataset.voteId);
      const share = event.target.closest('[data-share-id]');
      if (share) actions.shareParticipant(share.dataset.shareId);
    });
    $('#hero-carousel-track').addEventListener('click', (event) => {
      const vote = event.target.closest('[data-hero-vote-id]');
      if (vote) actions.selectParticipant(vote.dataset.heroVoteId);
    });
    this.bindParticipantTilt();
    this.bindParticipantReveal();
    $('#confirm-vote').addEventListener('click', actions.castVotes);
    $('#refresh-ranking').addEventListener('click', actions.refresh);
    $('#vote-quantity').addEventListener('change', () => this.updateVoteButton());
    $('#vote-confirm').addEventListener('change', () => this.updateVoteButton());
    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => button.closest('dialog')?.close());
    });
    $('#share-whatsapp').addEventListener('click', actions.shareSuccess);
    $('#share-copy').addEventListener('click', actions.copySuccess);
  }

  bindParticipantTilt() {
    const grid = $('#participants-grid');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supportsTilt = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!supportsTilt || reducedMotion) return;
    let activeCard = null;
    const resetTilt = (card) => {
      card.style.setProperty('--card-tilt-x', '0deg');
      card.style.setProperty('--card-tilt-y', '0deg');
      card.classList.remove('is-tilting');
    };

    grid.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const card = event.target.closest('.participant-card');
      if (activeCard && activeCard !== card) resetTilt(activeCard);
      if (!card || !grid.contains(card)) {
        activeCard = null;
        return;
      }

      const bounds = card.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const horizontal = (event.clientX - bounds.left) / bounds.width;
      const vertical = (event.clientY - bounds.top) / bounds.height;
      card.style.setProperty('--card-tilt-x', `${((0.5 - vertical) * 10).toFixed(2)}deg`);
      card.style.setProperty('--card-tilt-y', `${((horizontal - 0.5) * 10).toFixed(2)}deg`);
      card.style.setProperty('--card-glare-x', `${(horizontal * 100).toFixed(1)}%`);
      card.style.setProperty('--card-glare-y', `${(vertical * 100).toFixed(1)}%`);
      card.classList.add('is-tilting');
      activeCard = card;
    });

    grid.addEventListener('pointerout', (event) => {
      if (!activeCard || activeCard.contains(event.relatedTarget)) return;
      resetTilt(activeCard);
      activeCard = null;
    });
    grid.addEventListener('pointerleave', () => {
      if (!activeCard) return;
      resetTilt(activeCard);
      activeCard = null;
    });
  }

  bindParticipantReveal() {
    if (!('IntersectionObserver' in window) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    this.participantObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const card = entry.target;
        const id = card.dataset.participantId;
        this.revealedParticipantIds.add(id);
        observer.unobserve(card);
        const index = PARTICIPANTS.findIndex((participant) => participant.id === id);
        card.style.setProperty('--participant-entry-delay', `${index * 45}ms`);
        card.classList.add('participant-card-enter');
      });
    }, { threshold: 0.12 });
  }

  bindDialogs() {
    this.onboarding.addEventListener('cancel', (event) => event.preventDefault());
    for (const dialog of [this.voteDialog, this.successDialog]) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    }
    this.voteDialog.addEventListener('close', () => {
      this.currentParticipant = null;
    });
    this.successDialog.addEventListener('close', () => {
      this.successParticipant = null;
      this.successLink = '';
    });
  }

  render(data, selectedId) {
    this.currentData = data;
    this.renderAccount(data);
    this.renderParticipants(data, selectedId);
    this.renderRanking(data);
    this.renderHistory(data);
    this.renderOnboarding(data);
  }

  renderAccount(data) {
    const user = data?.user;
    $('#account-label').textContent = user?.email || '';
    for (const button of [$('#google-signin-button'), $('#google-signin-modal-button')]) {
      button.hidden = Boolean(user);
    }
    if (user) {
      $('#google-signin-error').hidden = true;
      $('#google-signin-error').textContent = '';
    }
    $('#signout-button').hidden = !user;
    const balance = $('#account-balance');
    balance.hidden = !data?.personal;
    $('#votes-remaining').textContent = String(data?.personal?.votesRemaining ?? 10);
    const notice = $('#votes-notice-copy');
    if (!data?.ready) notice.textContent = 'Cargando votaciones…';
    else if (!data.open) notice.textContent = 'La votación está cerrada.';
    else if (!user) notice.textContent = 'Inicia sesión con Google para votar.';
    else if (data.personal.votesRemaining === 0) notice.textContent = 'Ya usaste tus 10 votos.';
    else notice.textContent = `Te quedan ${data.personal.votesRemaining} votos.`;
    $('#hero-status').textContent = !data?.ready ? 'CONECTANDO CON LA VOTACIÓN' : data.open ? 'VOTACIONES ABIERTAS' : 'VOTACIONES CERRADAS';
  }

  renderParticipants(data, selectedId) {
    const counts = new Map((data?.voting?.participants || []).map((item) => [item.id, item]));
    const total = data?.voting?.totalVotes || 0;
    const grid = $('#participants-grid');
    grid.querySelectorAll('.participant-card').forEach((card) => this.participantObserver?.unobserve(card));
    grid.replaceChildren();

    PARTICIPANTS.forEach((participant, index) => {
      const result = counts.get(participant.id);
      const votes = result?.votes || 0;
      const percentage = total ? votes / total * 100 : 0;
      const card = node('article', `participant-card${selectedId === participant.id ? ' is-selected' : ''}`);
      card.dataset.participantId = participant.id;
      card.style.setProperty('--card-accent', participant.accent);

      const photo = node('div', 'participant-photo');
      const img = node('img');
      img.src = participant.photo;
      img.alt = `Retrato de ${participant.name}`;
      img.loading = index < 3 ? 'eager' : 'lazy';
      photo.append(img);
      photo.append(node('span', 'participant-badge', `#${String(index + 1).padStart(2, '0')}`));

      const share = node('button', 'participant-share', '↗');
      share.type = 'button';
      share.dataset.shareId = participant.id;
      share.setAttribute('aria-label', `Compartir el perfil de ${participant.name}`);
      photo.append(share);

      const info = node('div', 'participant-info');
      info.append(node('span', 'participant-mini', 'PARTICIPANTE'));
      info.append(node('h3', '', participant.name));
      const stats = node('div', 'participant-stats');
      const votesText = node('span');
      const votesStrong = node('strong', '', fmt(votes));
      votesText.append(votesStrong, document.createTextNode(` ${votes === 1 ? 'voto' : 'votos'}`));
      stats.append(votesText, node('span', 'participant-percent', `${percentage.toFixed(1)}%`));
      info.append(stats);
      const track = node('div', 'percent-track');
      const fill = node('span');
      fill.style.width = `${percentage}%`;
      track.append(fill);
      info.append(track);

      const vote = node('button', '', this.voteLabel(data, participant.id));
      vote.type = 'button';
      vote.dataset.voteId = participant.id;
      vote.disabled = !data?.ready || !data.open;
      info.append(vote);

      card.append(photo, info);
      grid.append(card);
      if (this.participantObserver && !this.revealedParticipantIds.has(participant.id)) {
        this.participantObserver.observe(card);
      }
    });
  }

  voteLabel(data, participantId) {
    if (!data?.ready) return 'CARGANDO…';
    if (!data.open) return 'VOTACIÓN CERRADA';
    if (!data.user) return 'ENTRAR PARA VOTAR';
    if (data.personal.votesRemaining < 1) return 'SIN VOTOS DISPONIBLES';
    return 'ELEGIR PARA VOTAR';
  }

  renderRanking(data) {
    const participants = PARTICIPANTS.map((participant, ordinal) => {
      const result = data?.voting?.participants?.find((item) => item.id === participant.id);
      return { ...participant, ordinal, votes: result?.votes || 0 };
    }).sort((a, b) => b.votes - a.votes || a.ordinal - b.ordinal);
    const total = data?.voting?.totalVotes || 0;
    $('#total-votes').textContent = data?.ready ? fmt(total) : '—';
    const list = $('#ranking-list');
    list.replaceChildren();
    participants.forEach((participant, index) => {
      const row = node('div', 'ranking-row');
      row.append(node('span', 'ranking-position', String(index + 1)));
      const img = node('img');
      img.src = participant.photo;
      img.alt = '';
      img.loading = 'lazy';
      row.append(img);
      const entry = node('div', 'ranking-entry');
      const title = node('div', 'ranking-entry-top');
      title.append(node('strong', '', participant.name), node('small', '', `${total ? (participant.votes / total * 100).toFixed(1) : '0.0'}%`));
      entry.append(title);
      const track = node('div', 'percent-track');
      const fill = node('span');
      fill.style.width = `${total ? participant.votes / total * 100 : 0}%`;
      track.append(fill);
      entry.append(track);
      row.append(entry);
      const number = node('div', 'ranking-numbers', fmt(participant.votes));
      number.append(node('small', '', participant.votes === 1 ? 'VOTO' : 'VOTOS'));
      row.append(number);
      list.append(row);
    });
    $('#ranking-updated').textContent = data?.ready
      ? `Actualizado a las ${new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}`
      : 'Sin conexión con el servidor';
  }

  renderHistory(data) {
    const container = $('#vote-history');
    const summary = container.querySelector('summary');
    container.replaceChildren(summary);
    if (!data?.personal) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    $('#history-count').textContent = String(data.personal.history.length);
    if (!data.personal.history.length) {
      container.append(node('p', '', 'Aún no has emitido votos en esta edición.'));
      return;
    }
    const list = node('ul');
    data.personal.history.forEach((entry) => {
      const row = node('li');
      row.append(node('strong', '', entry.participantName));
      row.append(node('span', '', `${entry.quantity} ${entry.quantity === 1 ? 'voto' : 'votos'}`));
      const time = node('time', '', new Date(entry.createdAt).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }));
      time.dateTime = entry.createdAt;
      row.append(time);
      list.append(row);
    });
    container.append(list);
  }

  requestSignIn(data) {
    this.signInRequested = true;
    this.clearError('signin-dialog-error');
    this.renderOnboarding(data);
  }

  renderOnboarding(data) {
    if (!data?.ready) return;
    if (data.user) {
      this.signInRequested = false;
      if (this.onboarding.open) this.onboarding.close();
      return;
    }
    if (!this.signInRequested) return;
    if (!this.onboarding.open) this.onboarding.showModal();
  }

  openVote(participant, available) {
    this.currentParticipant = participant;
    $('#modal-img').src = participant.photo;
    $('#modal-img').alt = `Retrato de ${participant.name}`;
    $('#modal-name-visual').textContent = participant.name;
    $('#modal-name').textContent = participant.name;
    $('#vote-remaining-copy').textContent = `Te quedan ${available} votos.`;
    const select = $('#vote-quantity');
    select.replaceChildren();
    for (let amount = 1; amount <= available; amount += 1) {
      const option = node('option', '', `${amount} ${amount === 1 ? 'voto' : 'votos'}`);
      option.value = String(amount);
      select.append(option);
    }
    $('#vote-confirm').checked = false;
    $('#vote-error').hidden = true;
    this.updateVoteButton();
    this.voteDialog.showModal();
  }

  updateVoteButton(working = false) {
    const remaining = this.currentData?.personal?.votesRemaining || 0;
    const amount = Number($('#vote-quantity').value);
    const confirmed = $('#vote-confirm').checked;
    const participantName = this.currentParticipant?.name || 'esta persona';
    const voteWord = amount === 1 ? 'voto' : 'votos';
    $('#vote-confirm-copy').textContent = `Confirmo que mis ${amount} ${voteWord} van para ${participantName}.`;
    $('#vote-confirm').disabled = working;
    $('#confirm-vote').disabled = working || !confirmed || !Number.isInteger(amount) || amount < 1 || amount > remaining;
    $('#confirm-vote').textContent = working ? 'REGISTRANDO…' : `CONFIRMAR ${amount} ${amount === 1 ? 'VOTO' : 'VOTOS'}`;
  }

  showSuccess(participant, quantity, link) {
    this.successParticipant = participant;
    this.successLink = link;
    this.voteDialog.close();
    $('#success-message').textContent = `Enviaste ${quantity} ${quantity === 1 ? 'voto' : 'votos'} a ${participant.name}.`;
    this.successDialog.showModal();
  }

  showError(message, target = 'signin-dialog-error') {
    const element = $(`#${target}`);
    element.textContent = message;
    element.hidden = false;
  }

  showSignInError(message) {
    const status = $('#google-signin-error');
    status.textContent = message;
    status.hidden = false;
    if (this.onboarding.open) this.showError(message, 'signin-dialog-error');
  }

  clearError(target = 'signin-dialog-error') {
    const element = $(`#${target}`);
    element.textContent = '';
    element.hidden = true;
  }

  toast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3200);
  }

  setPageError(message) {
    $('#votes-notice-copy').textContent = message;
    $('#vote-notice').classList.add('notice-error');
  }

  clearPageError() {
    $('#vote-notice').classList.remove('notice-error');
  }

  currentVote() {
    return {
      participant: this.currentParticipant,
      quantity: Number($('#vote-quantity').value),
      confirmed: $('#vote-confirm').checked,
    };
  }
}
