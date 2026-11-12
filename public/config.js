// Identificadores internos para la API; las rutas públicas usan slugs planetarios.
export const PARTICIPANTS = [
  {id:'eyfrid-enrique-matias',slug:'mercurio',name:'Eyfrid Enrique Matías',photo:'./assets/eyfrid-enrique-matias.webp',short:'Eyfrid Enrique',accent:'#2d9cce'},
  {id:'angel-gabriel-tevalan',slug:'venus',name:'Ángel Gabriel Tevalán',photo:'./assets/angel-gabriel-tevalan.webp',short:'Ángel Gabriel',accent:'#8953af'},
  {id:'anyeli-eunice-perez',slug:'tierra',name:'Anyeli Eunice Pérez',photo:'./assets/anyeli-eunice-perez.webp',short:'Anyeli Eunice',accent:'#dc5897'},
  {id:'elian-daniel-aguilar',slug:'marte',name:'Elián Daniel Aguilar',photo:'./assets/elian-daniel-aguilar.webp',short:'Elián Daniel',accent:'#efaa42'},
  {id:'yinyel-maricecy-santizo',slug:'jupiter',name:'Yinyel Maricecy Santizo',photo:'./assets/yinyel-maricecy-santizo.webp',short:'Yinyel Maricecy',accent:'#ad6a9c'},
  {id:'nelida-etelvina',slug:'saturno',name:'Nélida Etelvina R.',photo:'./assets/nelida-etelvina.webp',short:'Nélida Etelvina',accent:'#60b2b7'},
  {id:'yhetel-zucely-molina',slug:'neptuno',name:'Yhetel Zucely Molina',photo:'./assets/yhetel-zucely-molina.webp',short:'Yhetel Zucely',accent:'#9560bf'}
];

export const PARTNERS = [
  {id:'cci',name:'Centro Comercial Internacional',logo:'./assets/logo-cci.webp'},
  {id:'esmeraldas',name:"Esmeralda's Cosmetic",logo:'./assets/logo-esmeraldas-cosmetic.webp'},
  {id:'aguileon',name:'Restaurante Aguileón',logo:'./assets/logo-aguileon-restaurante.webp'},
  {id:'genesis',name:'Financiera Génesis',logo:'./assets/logo-financiera-genesis.webp'},
  {id:'creatiguate',name:'CreatiGuate',logo:'./assets/logo-creatiguate.webp'},
  {id:'despensa',name:'Despensa Familiar',logo:'./assets/logo-despensa-familiar.webp'}
];

import { API_ORIGIN } from './backend-config.js';

export function apiUrl(path) {
  // Wrangler siempre debe consultar su API local, incluso si el repositorio
  // también contiene la dirección de producción para GitHub Pages.
  if (typeof window !== 'undefined') {
    const current = new URL(window.location.href);
    if (['localhost', '127.0.0.1'].includes(current.hostname) && current.port === '8787') return path;
  }
  const origin = API_ORIGIN.trim();
  if (!origin) return path;
  let url;
  try { url = new URL(origin); } catch { throw new Error('La URL de Cloudflare en backend-config.js no es válida.'); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('API_ORIGIN debe ser el origen HTTPS de tu Worker, sin rutas.');
  }
  return new URL(path, url.origin).href;
}

export function participantUrl(slug) {
  const current = new URL(window.location.href);
  // GitHub Pages no admite rutas dinámicas con metadatos personalizados.
  // Conservamos el perfil elegido en la URL sin romper la ruta del repositorio.
  if (current.hostname.endsWith('.github.io') || current.pathname.includes('/public/') ||
      (current.hostname === 'localhost' && current.port !== '8787')) {
    current.searchParams.set('participant', slug);
    current.hash = '';
    return current.href;
  }
  return new URL(`/${slug}`, current.origin).href;
}
