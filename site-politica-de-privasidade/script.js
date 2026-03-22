/* ─────────────────────────────────────────
   Deu Mico — Política de Privacidade
   script.js
───────────────────────────────────────── */

(function () {
  'use strict';

  // ── Data de atualização ──────────────────────────────────────────────────
  const UPDATE_DATE = '22 de março de 2026';

  const updateDateEl = document.getElementById('update-date');
  if (updateDateEl) {
    updateDateEl.textContent = UPDATE_DATE;
  }

  // ── Ano no footer ────────────────────────────────────────────────────────
  const footerYearEl = document.getElementById('footer-year');
  if (footerYearEl) {
    footerYearEl.textContent = new Date().getFullYear();
  }

  // ── Intersection Observer — fade-in ao entrar na viewport ────────────────
  const fadeSections = document.querySelectorAll('.fade-section');

  if ('IntersectionObserver' in window) {
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -60px 0px',
      threshold: 0.08,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);   // anima só uma vez
        }
      });
    }, observerOptions);

    fadeSections.forEach((el, index) => {
      // escalonamento suave: cada card atrasa um pouco mais
      el.style.transitionDelay = `${index * 0.05}s`;
      observer.observe(el);
    });
  } else {
    // Fallback para navegadores sem suporte
    fadeSections.forEach((el) => el.classList.add('visible'));
  }

  // ── Smooth scroll para âncoras internas ──────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href').slice(1);
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      e.preventDefault();
      const headerHeight = document.querySelector('.site-header')?.offsetHeight ?? 0;
      const top = targetEl.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  // ── Highlight do header ao rolar ─────────────────────────────────────────
  const siteHeader = document.querySelector('.site-header');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (siteHeader) {
      siteHeader.style.boxShadow =
        y > 20 ? '0 4px 24px rgba(0,0,0,0.5)' : 'none';
    }
    lastScroll = y;
  }, { passive: true });

})();
