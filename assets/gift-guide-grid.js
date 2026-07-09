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

    const hotspots = this.querySelectorAll('.ggrid__hotspot');
    const popups = this.querySelectorAll('.ggrid__popup');
    console.log('[GiftGuideGrid] connected', {
      id: this.id,
      cartAddUrl: this.cartAddUrl,
      hotspots: hotspots.length,
      popups: popups.length,
      autoAdd: this.autoAdd,
    });

    hotspots.forEach((btn) => {
      btn.addEventListener('click', () => {
        const popup = document.getElementById(btn.getAttribute('aria-controls'));
        console.log('[GiftGuideGrid] hotspot clicked ->', btn.getAttribute('aria-controls'), !!popup);
        if (popup) this.open(popup, btn);
      });
    });

    popups.forEach((popup) => this._setupPopup(popup));
  }

  /* ---------- Popup wiring ---------- */
  _setupPopup(popup) {
    const data = this._readJSON(popup.querySelector('[data-ggrid-product]')) || { variants: [] };
    const state = { data: data, selections: {}, variant: null };
    popup._gg = state;
    console.log('[GiftGuideGrid] popup setup', popup.id, {
      variantCount: (data.variants || []).length,
      firstVariant: (data.variants || [])[0],
    });

    popup.querySelectorAll('[data-ggrid-close]').forEach((el) =>
      el.addEventListener('click', () => this.close())
    );

    // Swatch options (colour) — the sliding indicator handles the black fill
    popup.querySelectorAll('[data-ggrid-swatch]').forEach((swatch) => {
      swatch.addEventListener('click', () => this._selectSwatch(popup, state, swatch));
    });

    // Custom dropdown options (animated open/close via the `is-open` class)
    popup.querySelectorAll('[data-ggrid-select]').forEach((select) => {
      const toggle = select.querySelector('.ggrid__select-toggle');
      const valueEl = select.querySelector('[data-ggrid-select-value]');
      const pos = select.dataset.optionPosition;

      const setOpen = (open) => {
        select.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
      };

      toggle.addEventListener('click', () => {
        const willOpen = !select.classList.contains('is-open');
        // close any other open dropdown in this popup first
        popup.querySelectorAll('[data-ggrid-select].is-open').forEach((s) => {
          if (s !== select) {
            s.classList.remove('is-open');
            s.querySelector('.ggrid__select-toggle').setAttribute('aria-expanded', 'false');
          }
        });
        setOpen(willOpen);
      });

      select.querySelectorAll('.ggrid__select-option').forEach((option) => {
        option.addEventListener('click', () => {
          select
            .querySelectorAll('.ggrid__select-option')
            .forEach((o) => o.setAttribute('aria-selected', String(o === option)));
          valueEl.textContent = option.dataset.value;
          valueEl.classList.remove('ggrid__select-value--placeholder');
          state.selections[pos] = option.dataset.value;
          setOpen(false);
          this._resolve(popup);
        });
      });
    });

    // Pre-select any option that has only one possible value (keeps ATC usable).
    this._preselectSingles(popup, state);

    // Pre-select the first colour swatch by default (matches the Figma).
    popup.querySelectorAll('.ggrid__swatches').forEach((group) => {
      const first = group.querySelector('[data-ggrid-swatch]');
      if (first) this._selectSwatch(popup, state, first);
    });

    // Add to cart
    const atc = popup.querySelector('[data-ggrid-atc]');
    if (atc) {
      atc.addEventListener('click', () => {
        console.log('[GiftGuideGrid] ADD TO CART clicked', {
          selections: { ...state.selections },
          resolvedVariant: state.variant,
        });
        this._addToCart(popup);
      });
    } else {
      console.warn('[GiftGuideGrid] no [data-ggrid-atc] button found in popup', popup.id);
    }
  }

  // Select a colour swatch: move the sliding indicator + update state.
  _selectSwatch(popup, state, swatch) {
    const group = swatch.closest('.ggrid__swatches');
    const swatches = Array.from(group.querySelectorAll('[data-ggrid-swatch]'));
    const index = swatches.indexOf(swatch);
    swatches.forEach((s) => s.setAttribute('aria-checked', String(s === swatch)));
    group.style.setProperty('--sel-index', index);
    group.classList.add('is-selected');
    state.selections[swatch.dataset.optionPosition] = swatch.dataset.value;
    this._resolve(popup);
  }

  // Number of options, derived from the actual variant data (robust even if the
  // Liquid-provided optionCount is missing).
  _optionCount(state) {
    const variants = (state.data && state.data.variants) || [];
    return variants.length ? variants[0].options.length : state.data.optionCount || 0;
  }

  // Auto-select options that resolve to a single value, and reflect it in the UI.
  _preselectSingles(popup, state) {
    const count = this._optionCount(state);
    for (let i = 1; i <= count; i++) {
      const distinct = [];
      state.data.variants.forEach((v) => {
        if (distinct.indexOf(v.options[i - 1]) === -1) distinct.push(v.options[i - 1]);
      });
      if (distinct.length !== 1) continue;
      const value = distinct[0];
      state.selections[i] = value;

      popup
        .querySelectorAll('[data-ggrid-swatch][data-option-position="' + i + '"]')
        .forEach((s) => s.setAttribute('aria-checked', String(s.dataset.value === value)));

      const select = popup.querySelector('[data-ggrid-select][data-option-position="' + i + '"]');
      if (select) {
        const valueEl = select.querySelector('[data-ggrid-select-value]');
        if (valueEl) {
          valueEl.textContent = value;
          valueEl.classList.remove('ggrid__select-value--placeholder');
        }
      }
    }
    this._resolve(popup);
  }

  /* ---------- Variant resolution ---------- */
  // Resolves the chosen variant and updates the price. The Add to Cart button
  // stays a static black "ADD TO CART" (per the Figma) — completeness is
  // enforced on click, not by disabling/relabelling the button.
  _resolve(popup) {
    const state = popup._gg;
    const variants = (state.data && state.data.variants) || [];
    const count = this._optionCount(state);

    const chosen = [];
    for (let i = 1; i <= count; i++) chosen.push(state.selections[i]);
    const complete = count > 0 && chosen.every((v) => v != null);

    if (count === 0) {
      state.variant = variants[0] || null; // product with no options
    } else if (complete) {
      state.variant =
        variants.find((v) => v.options.every((opt, i) => String(opt) === String(chosen[i]))) || null;
    } else {
      state.variant = null;
    }

    if (state.variant && state.variant.priceFormatted) {
      const price = popup.querySelector('[data-ggrid-price]');
      if (price) price.innerHTML = state.variant.priceFormatted;
    }
  }

  /* ---------- Add to cart ---------- */
  async _addToCart(popup) {
    const state = popup._gg;
    const atc = popup.querySelector('[data-ggrid-atc]');

    // Not all options chosen yet → nudge the shopper to the size dropdown.
    if (!state.variant) {
      console.warn('[GiftGuideGrid] no variant resolved — nudging size dropdown', {
        selections: { ...state.selections },
        variants: state.data && state.data.variants,
      });
      const select = popup.querySelector('[data-ggrid-select]:not(.is-open)');
      if (select) {
        select.classList.add('is-open');
        select.querySelector('.ggrid__select-toggle').setAttribute('aria-expanded', 'true');
      }
      this._announce('Please choose your size.');
      return;
    }
    // Note: we do NOT block on state.variant.available here — the button stays
    // active (per the Figma) and we let Shopify's Ajax API be the source of
    // truth. If a variant is genuinely unpurchasable, /cart/add.js returns a
    // 422 and the catch block surfaces the message.
    if (!state.variant.available) {
      console.warn('[GiftGuideGrid] variant reports available:false — attempting anyway', state.variant);
    }

    const items = [{ id: state.variant.id, quantity: 1 }];

    // Business rule: Black + Medium => also add the auto-add product.
    // Store sizes use "M" for Medium, so accept both "medium" and "m".
    const values = Object.values(state.selections).map((v) => String(v).trim().toLowerCase());
    const hasBlack = values.includes('black');
    const hasMedium = values.includes('medium') || values.includes('m');
    if (hasBlack && hasMedium && this.autoAdd && this.autoAdd.available) {
      items.push({ id: this.autoAdd.id, quantity: 1 });
    }

    // Mirror Dawn: include the cart notification/drawer's sections in the request.
    const cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
    const sections = ['cart-icon-bubble'];
    if (cart && typeof cart.getSectionsToRender === 'function') {
      cart.getSectionsToRender().forEach((s) => {
        if (s.id && sections.indexOf(s.id) === -1) sections.push(s.id);
      });
      if (typeof cart.setActiveElement === 'function') cart.setActiveElement(document.activeElement);
    }

    const payload = { items: items, sections: sections, sections_url: window.location.pathname };
    console.log('[GiftGuideGrid] POST', this.cartAddUrl, payload);

    atc.classList.add('is-loading');
    try {
      const res = await fetch(this.cartAddUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      console.log('[GiftGuideGrid] response', res.status, json);
      if (!res.ok || json.status) {
        throw new Error(json.description || json.message || 'Cart add failed: ' + res.status);
      }

      this._refreshCartBubble(json.sections);
      this.close();

      // Trigger the theme's cart notification / drawer exactly like product-form.js.
      if (cart && typeof cart.renderContents === 'function') {
        if (json.items && json.key == null) json.key = json.items[0] && json.items[0].key;
        try {
          cart.renderContents(json);
        } catch (e) {
          /* notification is best-effort; the item is already in the cart */
        }
      }
      if (typeof publish === 'function' && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
        publish(window.PUB_SUB_EVENTS.cartUpdate, {
          source: 'gift-guide-grid',
          productVariantId: state.variant.id,
          cartData: json,
        });
      }
      const extra = items.length > 1 ? ' The ' + this.autoAdd.title + ' was added too.' : '';
      this._announce('Added to your cart.' + extra);
    } catch (err) {
      this._announce((err && err.message) || 'Sorry, something went wrong. Please try again.');
      if (window.console) console.error('[GiftGuideGrid] add to cart failed', err, { items: items });
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

    // lock page scroll while the popup is open
    document.documentElement.classList.add('ggrid-no-scroll');

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

    // restore page scroll
    document.documentElement.classList.remove('ggrid-no-scroll');

    const finish = () => {
      if (popup.classList.contains('is-open')) return; // re-opened during the wait
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
    if (!this.activePopup) return;
    // close any open size dropdown when clicking elsewhere
    if (!event.target.closest('[data-ggrid-select]')) {
      this.activePopup.querySelectorAll('[data-ggrid-select].is-open').forEach((s) => {
        s.classList.remove('is-open');
        s.querySelector('.ggrid__select-toggle').setAttribute('aria-expanded', 'false');
      });
    }
    // outside click = click landing on the transparent overlay
    if (event.target.classList.contains('ggrid__overlay')) {
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
