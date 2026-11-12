import { VotingController } from './js/controllers/voting-controller.js';
import { PARTICIPANTS } from './config.js';

function startHeroCarousel() {
  const carousel = document.querySelector('#hero-carousel');
  const track = document.querySelector('#hero-carousel-track');
  const currentCount = document.querySelector('#hero-carousel-current');
  const totalCount = document.querySelector('#hero-carousel-total');
  const previous = document.querySelector('#hero-carousel-previous');
  const next = document.querySelector('#hero-carousel-next');
  if (!carousel || !track || !currentCount || !totalCount || !previous || !next || !PARTICIPANTS.length) return;

  const slides = PARTICIPANTS.map((participant, index) => {
    const slide = document.createElement('article');
    slide.className = 'hero-carousel-slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'diapositiva');
    slide.setAttribute('aria-label', `Participante ${index + 1} de ${PARTICIPANTS.length}`);
    slide.setAttribute('aria-hidden', 'true');
    slide.inert = true;
    slide.style.setProperty('--slide-accent', participant.accent);

    const photo = document.createElement('div');
    photo.className = 'hero-slide-photo';
    const image = document.createElement('img');
    image.src = participant.photo;
    image.alt = `Retrato de ${participant.name}`;
    image.loading = 'eager';
    image.fetchPriority = index === 0 ? 'high' : 'low';
    photo.append(image);

    const copy = document.createElement('div');
    copy.className = 'hero-slide-copy';
    const order = document.createElement('span');
    order.className = 'hero-slide-order';
    order.textContent = `VOZ ${String(index + 1).padStart(2, '0')}`;
    const name = document.createElement('h2');
    name.textContent = participant.name;
    const vote = document.createElement('button');
    vote.className = 'hero-slide-vote';
    vote.type = 'button';
    vote.dataset.heroVoteId = participant.id;
    vote.textContent = 'VOTAR POR ESTA PERSONA';
    copy.append(order, name, vote);
    slide.append(photo, copy);
    return slide;
  });
  track.replaceChildren(...slides);
  totalCount.textContent = String(slides.length).padStart(2, '0');

  let activeIndex = 0;
  let timer;
  let pointerInside = false;
  let focusInside = false;
  let stopped = false;
  const interval = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 6000 : 5000;

  const show = (index) => {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
      slide.querySelector('[data-hero-vote-id]').tabIndex = active ? 0 : -1;
    });
    currentCount.textContent = String(activeIndex + 1).padStart(2, '0');
  };

  const scheduleNext = () => {
    window.clearTimeout(timer);
    if (stopped || document.hidden || pointerInside || focusInside) return;
    timer = window.setTimeout(() => {
      show(activeIndex + 1);
      scheduleNext();
    }, interval);
  };

  previous.addEventListener('click', () => {
    show(activeIndex - 1);
    scheduleNext();
  });
  next.addEventListener('click', () => {
    show(activeIndex + 1);
    scheduleNext();
  });
  carousel.addEventListener('pointerenter', () => {
    pointerInside = true;
    scheduleNext();
  });
  carousel.addEventListener('pointerleave', () => {
    pointerInside = false;
    scheduleNext();
  });
  carousel.addEventListener('focusin', () => {
    focusInside = true;
    scheduleNext();
  });
  carousel.addEventListener('focusout', (event) => {
    if (carousel.contains(event.relatedTarget)) return;
    focusInside = false;
    scheduleNext();
  });
  document.addEventListener('visibilitychange', scheduleNext);
  window.addEventListener('pagehide', () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', scheduleNext);
  }, { once: true });

  show(0);
  scheduleNext();
}

startHeroCarousel();

const app = new VotingController();
app.start().catch((error) => {
  console.error('Intercanto app failed to start:', error);
});
