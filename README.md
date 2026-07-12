# Gift Guide — Custom Shopify Theme Sections (Faizan Khalid)

A Shopify **Dawn**-based theme with two custom, **built-from-scratch** homepage
sections implementing a Figma design. No Dawn ready-made sections or
components were reused for these two blocks, and all interactivity is **vanilla
JavaScript (no jQuery)** — mobile-first, WCAG AA, and heavily commented.

Live/preview theme is driven by Shopify's GitHub integration:
- `master` → published live theme
- `development` → unpublished preview theme

---

## The two custom sections

### 1. Gift Guide Banner — `sections/gift-guide-banner.liquid`
Hero **"The Gift Guide"** banner (Figma Frame 1957).

- **Responsive header:** desktop top bar (logo + message + `CHOOSE GIFT`) vs. mobile
  header (hamburger + logo).
- **Mobile hamburger** opens a smooth **slide-down dropdown** (message + `CHOOSE GIFT`);
  the icon **morphs into an X**. The panel is height-animated in JS via `menu.scrollHeight`.
- **Button hover animation:** the fill (yellow `SHOP NOW` / black `CHOOSE GIFT`) **wipes
  left → right** using a `::before` pseudo-element + `scaleX` (Figma Group 1000007810).
- **Distinct desktop vs. mobile copy** (heading, description, strip text) via paired
  theme settings + CSS toggles.
- **Logo** = two inline SVGs rendered in reverse order (`flex-direction: row-reverse`)
  → reads "TISSO VISON".

**Assets:** `assets/gift-guide-banner.css`, `assets/gift-guide-banner.js`,
`snippets/gift-banner-arrow.liquid`, hero art
`assets/gift-guide-hero-{top,bottom}.svg` + `assets/gift-guide-hero-mobile.png`.

### 2. Gift Guide Grid + quick-shop popup — `sections/gift-guide-grid.liquid`
A **6-tile shoppable grid** (3×2 desktop / 2-col mobile) with movable **"+" hotspots**.
Implemented as a custom element `<gift-guide-grid>`.

- **Movable hotspots:** position per block via `hotspot_horizontal` / `hotspot_vertical`
  range settings (desktop); fixed position on mobile. The preset ships the 6 Figma
  default positions.
- **Quick-shop popup** (opened from a hotspot): product name, price, description, and
  **dynamic variant selectors built from product data**:
  - **Colour** → swatch row with a **sliding black indicator** (`--sel-index` / `--count`,
    Figma Components 208/209).
  - **Size** → **custom animated dropdown** (Figma Component 213).
  - Selectors are rendered **by option name** (Colour = swatch, Size = dropdown), so they
    are correct regardless of the product's option order. The first colour is pre-selected.
- **Add to Cart:** vanilla `fetch` `POST` to `routes.cart_add_url` with an `items[]` array
  (JSON). Uses the resolved variant id. On success it updates the cart bubble, calls the
  theme's `cart-notification` `renderContents()`, and publishes `PUB_SUB_EVENTS.cartUpdate`
  — matching Dawn's `product-form.js` behaviour.
- **Business rule:** if the chosen options are **Black + Medium** (case-insensitive; store
  sizes use `M` for Medium), the section's **Auto-add product** ("Soft Winter Jacket") is
  added in the **same** request. This is why the items-array cart API is used rather than a
  single product form.
- **Accessibility / UX:** popup is focus-trapped; closes on Esc, ✕, or outside click;
  **body scroll is locked** while open; overlay + card fade in/out.

**Assets:** `assets/gift-guide-grid.css`, `assets/gift-guide-grid.js`,
`snippets/gift-grid-popup.liquid`, `snippets/gift-grid-icon.liquid`.

---

## Product data
- All 20 products use options **`Size` (Option1)** / **`Colour` (Option2)**.
- Sizes are **XS / S / M / L** (Medium = `M`).
- Inventory is **not tracked** → variants are always `available: true`, so a matched
  variant is purchasable.

## Conventions & technical decisions
- **Mobile-first**; desktop breakpoint at `min-width: 750px` (Dawn's breakpoint).
- **Literal `px` units** on purpose — the theme root font-size is tied to the
  merchant-editable `--font-body-scale`, so `rem` would drift from a pixel-exact match.
- Fonts **Jost** (300/400/500) + **Lustria**, loaded once in `theme.liquid` with
  `font-display: swap` + preconnect.
- **BEM-ish** class names (`gift-banner__…`, `ggrid__…`); inline SVGs use `currentColor`.
- **Vanilla JS only** — no jQuery, no external libraries.

## Merchant setup (in the Theme Customizer)
1. Assign a product to each of the **6 grid blocks**.
2. Set the grid section's **Auto-add product** to **"Soft Winter Jacket"**.
3. The two sections are added to the homepage in `templates/index.json`.

## Validation
- Schema JSON: parse the section `{% schema %}` blocks with `node -e "JSON.parse(...)"`.
- JS syntax: `node --check assets/gift-guide-grid.js`.
- Theme lint: `shopify theme check` (remote-font `RemoteAsset` warnings are expected).

## Git workflow
- Work on **`development`**, open a PR into **`master`**.
- Shopify auto-commits to `development` when the connected theme editor saves, so
  **`git pull --rebase origin development` before every push.**

---

**Author:** Faizan Khalid
