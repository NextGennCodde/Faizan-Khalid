/*
 * Gift Guide Grid (Section 2) — quick-shop popups + Ajax add to cart.
 * Vanilla JS, no dependencies. Registered as a custom element so it re-inits
 * automatically when the Shopify theme editor adds/reloads the section.
 *
 * Behaviour:
 *  - "+" hotspot opens the matching product popup (focus trapped, Esc/✕/outside
 *    to close, focus returned to the hotspot on close).
 *  - Variant selectors (swatch row + custom dropdown) resolve the chosen variant
 *    from the embedded variant matrix; price + Add to Cart state update live.
 *  - Add to Cart posts to routes.cart_add_url. Business rule: if the chosen
 *    options include BOTH "Black" and "Medium" (case-insensitive), the section's
 *    auto-add product is added in the same request.
 *  - Header cart bubble refreshed via the Section Rendering API.
 */
class GiftGuideGrid extends HTMLElement {
  connectedCallback() {
    if (this._init) return;
    this._init = true;

    this.cartAddUrl = this.dataset.cartAddUrl || '/cart/add.js';
    this.autoAdd = this._readJSON(this.querySelector('[data-ggrid-autoadd]'));
    this.status = this.querySelector('.ggrid__sr-status');
    this.activePopup = null;
    this.lastTrigger = null;

    this._onKeydown = this._onKeydown.bind(this);
    this._onDocClick = this._onDocClick.bind(this);

    this.querySelectorAll('.ggrid__hotspot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const popup = document.getElementById(btn.getAttribute('aria-controls'));
        if (popup) this.open(popup, btn);
      });
    });

    this.querySelectorAll('.ggrid__popup').forEach((popup) => this._setupPopup(popup));
  }

  /* ---------- Popup wiring ---------- */
  _setupPopup(popup) {
    const data = this._readJSON(popup.querySelector('[data-ggrid-product]')) || { variants: [] };
    const state = { data: data, selections: {}, variant: null };
    popup._gg = state;

    popup.querySelectorAll('[data-ggrid-close]').forEach((el) =>
      el.addEventListener('click', () => this.close())
    );

    // Swatch options
    popup.querySelectorAll('[data-ggrid-swatch]').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        const pos = swatch.dataset.optionPosition;
        popup
          .querySelectorAll('[data-ggrid-swatch][data-option-position="' + pos + '"]')
          .forEach((s) => s.setAttribute('aria-checked', String(s === swatch)));
        state.selections[pos] = swatch.dataset.value;
        this._resolve(popup);
      });
    });

    // Custom dropdown options
    popup.querySelectorAll('[data-ggrid-select]').forEach((select) => {
      const toggle = select.querySelector('.ggrid__select-toggle');
      const list = select.querySelector('.ggrid__select-list');
      const valueEl = select.querySelector('[data-ggrid-select-value]');
      const pos = select.dataset.optionPosition;

      const closeList = () => {
        list.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      };

      toggle.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        // close any other open dropdowns in this popup first
        popup.querySelectorAll('.ggrid__select-list').forEach((l) => {
          if (l !== list) l.hidden = true;
        });
        popup.querySelectorAll('.ggrid__select-toggle').forEach((t) => {
          if (t !== toggle) t.setAttribute('aria-expanded', 'false');
        });
        list.hidden = isOpen;
        toggle.setAttribute('aria-expanded', String(!isOpen));
      });

      list.querySelectorAll('.ggrid__select-option').forEach((option) => {
        option.addEventListener('click', () => {
          list
            .querySelectorAll('.ggrid__select-option')
            .forEach((o) => o.setAttribute('aria-selected', String(o === option)));
          valueEl.textContent = option.dataset.value;
          state.selections[pos] = option.dataset.value;
          closeList();
          this._resolve(popup);
        });
      });
    });

    // Add to cart
    const atc = popup.querySelector('[data-ggrid-atc]');
    if (atc) atc.addEventListener('click', () => this._addToCart(popup));
  }

  /* ---------- Variant resolution ---------- */
  _resolve(popup) {
    const state = popup._gg;
    const data = state.data;
    const atc = popup.querySelector('[data-ggrid-atc]');
    const label = popup.querySelector('[data-ggrid-atc-label]');
    const count = data.optionCount || 0;

    const chosen = [];
    for (let i = 1; i <= count; i++) chosen.push(state.selections[i]);
    const complete = chosen.every((v) => v != null);

    state.variant = complete
      ? data.variants.find((v) => v.options.every((opt, i) => opt === chosen[i])) || null
      : null;

    if (state.variant && state.variant.priceFormatted) {
      const price = popup.querySelector('[data-ggrid-price]');
      if (price) price.innerHTML = state.variant.priceFormatted;
    }

    if (!complete) {
      this._setAtc(atc, label, true, 'Select options');
    } else if (!state.variant || !state.variant.available) {
      this._setAtc(atc, label, true, 'Sold out');
    } else {
      this._setAtc(atc, label, false, 'Add to cart');
    }
  }

  _setAtc(atc, label, disabled, text) {
    if (!atc) return;
    atc.setAttribute('aria-disabled', String(disabled));
    if (label) label.textContent = text;
  }

  /* ---------- Add to cart ---------- */
  async _addToCart(popup) {
    const state = popup._gg;
    const atc = popup.querySelector('[data-ggrid-atc]');
    if (!state.variant || !state.variant.available || atc.getAttribute('aria-disabled') === 'true') {
      this._announce('Please choose all options.');
      return;
    }

    const items = [{ id: state.variant.id, quantity: 1 }];

    // Business rule: Black + Medium => also add the auto-add product.
    const values = Object.values(state.selections).map((v) => String(v).toLowerCase());
    if (values.includes('black') && values.includes('medium') && this.autoAdd && this.autoAdd.available) {
      items.push({ id: this.autoAdd.id, quantity: 1 });
    }

    atc.classList.add('is-loading');
    try {
      const res = await fetch(this.cartAddUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: items, sections: ['cart-icon-bubble'] }),
      });
      if (!res.ok) throw new Error('Cart add failed: ' + res.status);
      const json = await res.json();

      this._refreshCartBubble(json.sections);
      const extra = items.length > 1 ? ' The ' + this.autoAdd.title + ' was added too.' : '';
      this._announce('Added to your cart.' + extra);
      this.close();
    } catch (err) {
      this._announce('Sorry, something went wrong. Please try again.');
      if (window.console) console.error('[GiftGuideGrid]', err);
    } finally {
      atc.classList.remove('is-loading');
    }
  }

  _refreshCartBubble(sections) {
    if (!sections || !sections['cart-icon-bubble']) return;
    const bubble = document.getElementById('cart-icon-bubble');
    if (bubble) bubble.innerHTML = this._sectionInner(sections['cart-icon-bubble']);
  }

  _sectionInner(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.getElementById('cart-icon-bubble');
    return el ? el.innerHTML : html;
  }

  /* ---------- Open / close + focus management ---------- */
  open(popup, trigger) {
    if (this.activePopup) this.close();
    this.activePopup = popup;
    this.lastTrigger = trigger || null;

    popup.hidden = false;
    // next frame so the CSS transition runs from the hidden state
    requestAnimationFrame(() => popup.classList.add('is-open'));

    document.addEventListener('keydown', this._onKeydown);
    document.addEventListener('click', this._onDocClick, true);

    const focusable = this._focusable(popup);
    (focusable[0] || popup.querySelector('.ggrid__close')).focus();
  }

  close() {
    const popup = this.activePopup;
    if (!popup) return;
    popup.classList.remove('is-open');
    document.removeEventListener('keydown', this._onKeydown);
    document.removeEventListener('click', this._onDocClick, true);

    const finish = () => {
      popup.hidden = true;
      popup.removeEventListener('transitionend', finish);
    };
    popup.addEventListener('transitionend', finish);
    // fallback in case transitionend doesn't fire
    setTimeout(finish, 300);

    if (this.lastTrigger) this.lastTrigger.focus();
    this.activePopup = null;
  }

  _onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab' && this.activePopup) this._trapFocus(event);
  }

  _onDocClick(event) {
    // outside click = click landing on the transparent overlay
    if (this.activePopup && event.target.classList.contains('ggrid__overlay')) {
      this.close();
    }
  }

  _trapFocus(event) {
    const items = this._focusable(this.activePopup);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  _focusable(root) {
    return Array.from(
      root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);
  }

  /* ---------- Helpers ---------- */
  _announce(message) {
    if (this.status) this.status.textContent = message;
  }

  _readJSON(el) {
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }
}

if (!customElements.get('gift-guide-grid')) {
  customElements.define('gift-guide-grid', GiftGuideGrid);
}
