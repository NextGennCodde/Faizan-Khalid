/*
 * Gift Guide Banner — mobile dropdown toggle.
 * Vanilla JS, no dependencies. Theme-editor safe (re-inits on section load).
 * The hamburger toggles a smooth slide-down menu (Figma Group 1000008120).
 */
(function () {
  var OPEN_CLASS = 'gift-banner--menu-open';

  function initBanner(section) {
    if (!section || section.dataset.gbBound === 'true') return;
    var button = section.querySelector('.gift-banner__hamburger');
    var menu = section.querySelector('.gift-banner__menu');
    if (!button || !menu) return;

    section.dataset.gbBound = 'true';

    function setOpen(open) {
      section.classList.toggle(OPEN_CLASS, open);
      button.setAttribute('aria-expanded', String(open));
    }

    button.addEventListener('click', function () {
      setOpen(button.getAttribute('aria-expanded') !== 'true');
    });

    // Close on Escape and return focus to the toggle for keyboard users.
    section.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        button.focus();
      }
    });
  }

  function initAll(root) {
    (root || document).querySelectorAll('.gift-banner').forEach(initBanner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initAll();
    });
  } else {
    initAll();
  }

  // Shopify theme editor: (re)initialise when a section is added/reloaded.
  document.addEventListener('shopify:section:load', function (event) {
    initBanner(event.target.querySelector('.gift-banner') || event.target);
  });
})();
