import { getAdminState, updateAdmin } from '../models/voting-model.js';
import { signInWithGoogle } from '../models/auth-model.js';
import { PARTNERS } from '../../config.js';

const $ = (selector) => document.querySelector(selector);
const fmt = (value) => new Intl.NumberFormat('es-GT').format(value || 0);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export class AdminController {
  constructor() {
    this.overview = null;
    this.working = false;
  }

  async start() {
    $('#admin-signin').addEventListener('click', () => this.signIn());
    $('#admin-toggle-voting').addEventListener('click', () => this.toggleVoting());
    $('#admin-partner-list').addEventListener('submit', (event) => {
      const form = event.target.closest('[data-partner-form]');
      if (!form) return;
      event.preventDefault();
      const input = form.querySelector('input[type="url"]');
      const active = form.querySelector('input[type="checkbox"]');
      this.savePartner(form.dataset.partnerForm, input.value.trim() || null, active.checked);
    });
    await this.refresh();
  }

  async signIn() {
    try {
      await signInWithGoogle();
    } catch (error) {
      this.showError(error.message || 'No se pudo iniciar sesión.');
    }
  }

  async refresh() {
    this.clearError();
    try {
      const result = await getAdminState();
      this.overview = result.overview;
      $('#admin-login').hidden = true;
      $('#admin-content').hidden = false;
      this.render();
    } catch (error) {
      if (error.status === 401) {
        $('#admin-login').hidden = false;
        $('#admin-content').hidden = true;
      } else {
        this.showError(error.message || 'No tienes permiso para administrar este proyecto.');
        $('#admin-login').hidden = true;
        $('#admin-content').hidden = true;
      }
    }
  }

  render() {
    const voting = this.overview.voting;
    $('#admin-voting-status').textContent = voting.isOpen ? 'VOTACIÓN ABIERTA' : 'VOTACIÓN CERRADA';
    $('#admin-total-votes').textContent = fmt(voting.totalVotes);
    $('#admin-toggle-voting').textContent = voting.isOpen ? 'CERRAR VOTACIÓN' : 'ABRIR VOTACIÓN';

    const partners = $('#admin-partner-list');
    partners.replaceChildren();
    this.overview.partners.forEach((partner) => {
      const form = node('form', 'admin-partner-form');
      form.dataset.partnerForm = partner.id;
      const identity = node('div', 'admin-partner-name');
      identity.append(node('strong', '', partner.name));
      identity.append(node('small', '', partner.required ? 'Obligatorio' : 'Opcional'));
      form.append(identity);

      const urlLabel = node('label', 'admin-url-label');
      urlLabel.append(node('span', '', 'URL oficial HTTPS'));
      const urlInput = node('input');
      urlInput.type = 'url';
      urlInput.required = partner.active;
      urlInput.value = partner.url || '';
      urlInput.placeholder = 'https://…';
      urlLabel.append(urlInput);
      form.append(urlLabel);

      const activeLabel = node('label', 'admin-active-label');
      const activeInput = node('input');
      activeInput.type = 'checkbox';
      activeInput.checked = partner.active;
      activeLabel.append(activeInput, document.createTextNode(' Activo'));
      form.append(activeLabel);

      const save = node('button', 'btn btn-primary admin-save', 'GUARDAR');
      save.type = 'submit';
      save.disabled = this.working;
      form.append(save);
      partners.append(form);
    });
  }

  async toggleVoting() {
    await this.send({ action: 'set-open', isOpen: !this.overview.voting.isOpen });
  }

  async savePartner(partnerId, url, active) {
    if (!PARTNERS.some((partner) => partner.id === partnerId)) return;
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
          throw new Error('El enlace debe usar HTTPS y no incluir credenciales.');
        }
      } catch (error) {
        this.showError(error.message || 'Ingresa una URL válida.');
        return;
      }
    }
    await this.send({ action: 'update-partner', partnerId, url, active });
  }

  async send(payload) {
    if (this.working) return;
    this.working = true;
    this.clearError();
    this.render();
    try {
      const result = await updateAdmin(payload);
      this.overview = result.overview;
      this.toast('Cambios guardados.');
    } catch (error) {
      this.showError(error.message || 'No se pudo guardar el cambio.');
    } finally {
      this.working = false;
      if (this.overview) this.render();
    }
  }

  showError(message) {
    const element = $('#admin-error');
    element.textContent = message;
    element.hidden = false;
  }

  clearError() {
    $('#admin-error').hidden = true;
  }

  toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => element.classList.remove('show'), 3000);
  }
}
