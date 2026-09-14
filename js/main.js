// Mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-mobile');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => nav.classList.remove('open'));
    });
  }

  // Lightbox for travel galleries
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    const lightboxImg = lightbox.querySelector('img');
    const closeBtn = lightbox.querySelector('.lightbox-close');
    document.querySelectorAll('.gallery button').forEach(btn => {
      btn.addEventListener('click', () => {
        const fullSrc = btn.dataset.full || btn.querySelector('img').src;
        lightboxImg.src = fullSrc;
        lightboxImg.alt = btn.querySelector('img').alt;
        lightbox.classList.add('open');
      });
    });
    const close = () => lightbox.classList.remove('open');
    closeBtn.addEventListener('click', close);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
});
