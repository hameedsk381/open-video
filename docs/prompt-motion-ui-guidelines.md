# Prompt Motion: Token-Driven UI Design System & Component Guidelines

> **Design Intent:** Deliver a clean, functional, keyboard-first, and token-driven design system for Prompt Motion's technical documentation surface, ensuring strict WCAG 2.2 AA accessibility, unambiguous interaction states, and rapid developer implementation.

---

## What the live site actually looks like, and how the studio follows it

*Checked against prompt-motion.com on 2026-11-08. This section is the current guidance; the token tables below describe an earlier dark ("obsidian") adaptation that the live site does not use.*

The site is **light and quiet**: a white canvas, near-black ink (`#111`), Geist, and almost no colour of its own, because the videos supply it.

| On the site | In the studio |
|---|---|
| White canvas, soft grey (`#f5f5f5`) fields with no outline | `--bg #fff`, `--surface-2 #f5f5f5`; inputs and the composer are grey fills, outlined only on focus |
| Black primary button, quiet grey secondary | `--primary` is the ink colour (`#111` light, `#f4f4f5` dark); secondary is a grey fill with no border; the blue accent is kept for focus rings, selection and links |
| Title 30 px, weight 500, tracking about -0.025em | `h1` 30 px, headings weight 500 |
| Outline pills with a lighter count (`Product UI 105`), a filled ink pill when selected | `.chip`, `.category-pill` and `.cat-count` |
| A card is a rounded picture with a small caption: no box, no shadow, no lift | `.bento-card` is transparent with radius 16; the Home hero is the page, not a card |
| Radii 12 to 20 px, whitespace instead of borders | `--radius-md 12`, `--radius-lg 16`, `--radius-xl 24` |
| Slim top bar, no sidebar, masonry galleries, a two-pane prompt page, a single-column "Customize a prompt" list | **Not adopted**: the studio keeps its sidebar and layouts, since it is a workspace and not a gallery |

Not matched: the site's font is Geist, which the studio does not bundle (it runs offline on system fonts, with Geist first in the stack for machines that have it). Adding `@fontsource-variable/geist` is one dependency. The site's own wording, logo, sponsor card and videos are not reused.

---

## 1. Context and Goals

### 1.1 Product Context & Verified Brand Surface
- **Brand / Product:** Prompt Motion ([prompt-motion.com](https://prompt-motion.com/))
- **Audience:** Software engineers, creative technologists, AI video researchers, and motion graphics developers.
- **Product Surface:** High-density technical documentation site, interactive prompt cookbook, and API reference portal.
- **Core Design Ethos:** Utilitarian clarity, high contrast readability, ultra-low input latency (<150ms), and ruthless removal of visual friction.

### 1.2 Surface Component Density Census
The Prompt Motion documentation experience exhibits a known density footprint:
- **Links (249):** High-density inline code cross-references, navigation hierarchies, table of contents anchor tracks, and tag pills.
- **Buttons (27):** High-frequency utility actions (Copy Prompt, Search Trigger, Filter Toggles, Theme Toggle, View Raw JSON).
- **Inputs (3):** Global search field (`⌘K`), category filter input, and density/view switcher.
- **Cards (2 core patterns):** Bento prompt showcase cards (nested viewport) and documentation callout/feature cards.
- **Navigation (2 core patterns):** Sticky global top-nav bar and multi-tier left sidebar hierarchy.
- **Lists (1 core pattern):** Parameter specification and API property breakdown lists.
- **Tables (1 core pattern):** Token matrices, API signature schemas, and keyboard shortcut maps.

---

## 2. Design Tokens and Foundations

All components **must** consume these exact tokens. Engineers **must not** declare raw hex, pixel constants, or arbitrary utility classes.

### 2.1 Design Tokens Reference Table

```css
:root {
  /* ==========================================================================
     Typography Tokens
     ========================================================================== */
  --font-family-primary: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-family-stack: "Geist", "Geist Fallback", monospace;
  --font-family-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --font-size-xs: 12px;       /* 0.75rem - badges, microcopy, timestamps */
  --font-size-sm: 12.8px;     /* 0.80rem - secondary metadata, table labels */
  --font-size-md: 14px;       /* 0.875rem - inputs, code blocks, sidebar nav */
  --font-size-base: 16px;     /* 1.00rem - body text, primary button labels */
  --font-size-lg: 16px;       /* 1.00rem - section headers (compact) */
  --font-size-xl: 30px;       /* 1.875rem - page h1 titles, showcase hero */

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  --line-height-xs: 16px;
  --line-height-sm: 18px;
  --line-height-md: 20px;
  --line-height-base: 24px;
  --line-height-xl: 36px;

  /* ==========================================================================
     Color Palette & Semantic Tokens
     ========================================================================== */
  /* Primitive Surfaces */
  --color-surface-base: #000000;              /* Obsidian canvas foundation */
  --color-surface-subtle: #09090b;            /* Secondary dark canvas layer */
  --color-surface-muted: #ffffff;             /* Inverted white surface / card light */
  --color-surface-strong: #f2f2f2;            /* Light elevated container surface */
  --color-surface-elevated: #111216;          /* Bento card background */
  --color-surface-elevated-hover: #181920;    /* Interactive card hover */

  /* Text & Foreground */
  --color-text-primary: #111111;              /* Primary text on light containers */
  --color-text-primary-inverted: #ededed;     /* Primary text on obsidian canvas */
  --color-text-secondary: #6b6b6b;            /* Subdued copy on light */
  --color-text-secondary-inverted: #a1a1aa;   /* Subdued copy on dark canvas */
  --color-text-muted: #71717a;                /* Disabled / tertiary metadata */

  /* Borders & Dividers */
  --color-border-default: #e5e5e5;            /* Divider line on light */
  --color-border-subtle: rgba(255, 255, 255, 0.08); /* Bento card ring border */
  --color-border-strong: rgba(255, 255, 255, 0.16); /* Interactive border hover */

  /* Focus & Accents */
  --color-focus-ring: oklab(0.820314 0.0000373721 0.0000163913 / 0.5); /* Neutral 50% glow */
  --color-accent-brand: #3b82f6;              /* Primary interactive blue */
  --color-status-success: #10b981;            /* Copy prompt success indicator */
  --color-status-error: #ef4444;              /* Error badge / validation fail */

  /* ==========================================================================
     Spacing Scale
     ========================================================================== */
  --space-1: 8px;
  --space-2: 10px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 32px;
  --space-7: 40px;
  --space-8: 64px;

  /* ==========================================================================
     Radius Tokens
     ========================================================================== */
  --radius-xs: 6px;                           /* Badges, micro-buttons */
  --radius-sm: 8px;                           /* Form inputs, code blocks */
  --radius-md: 10px;                          /* Standard buttons, dropdowns */
  --radius-lg: 14px;                          /* Inner media viewport of cards */
  --radius-xl: 22px;                          /* Bento showcase outer card */
  --radius-2xl: 33554400px;                   /* Category pill / fully rounded */

  /* ==========================================================================
     Elevation & Shadows
     ========================================================================== */
  --shadow-1: rgba(0, 0, 0, 0) 0px 0px 0px 0px,
              rgba(0, 0, 0, 0) 0px 0px 0px 0px,
              rgba(0, 0, 0, 0) 0px 0px 0px 0px,
              oklab(0.177637 0.00000810623 0.00000356138 / 0.1) 0px 0px 0px 1px,
              oklab(0 0 0 / 0.05) 0px 20px 25px -5px,
              oklab(0 0 0 / 0.05) 0px 8px 10px -6px;

  /* ==========================================================================
     Motion & Transitions
     ========================================================================== */
  --motion-duration-instant: 150ms;
  --motion-ease-standard: cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 3. Component-Level Rules & Specifications

### 3.1 Links (Density: 249)

#### Anatomy & Variants
1. **Inline Prose Link:** Underlined on hover, embedded in body text.
2. **Navigation Link:** Clean text, subtle pill highlight on active/hover.
3. **Table of Contents (TOC) Link:** Left-bordered indent line showing reading progress.
4. **Outbound / Code Reference Link:** Monospace font with outbound external icon indicator.

```
+-----------------------------------------------------------+
| [Link Icon]  link-label-text          [External Arrow ↗] |
+-----------------------------------------------------------+
```

#### Token Requirements
- **Typography:** `--font-size-md` (nav) or `--font-size-base` (prose), weight `--font-weight-regular`.
- **Spacing:** Nav links `--space-2` horizontal, `--space-1` vertical. Minimum touch target padded to 44px height via transparent pseudo-elements or flex layout.
- **Colors:** `--color-text-secondary-inverted` transitioning to `--color-text-primary-inverted`.

#### State Matrix
| State | Visual Output |
|---|---|
| **Default** | Color `--color-text-secondary-inverted`; text-decoration `none`. |
| **Hover** | Color `--color-text-primary-inverted`; background `rgba(255,255,255,0.04)`. |
| **Focus-Visible** | Outline `2px solid var(--color-focus-ring)`; outline-offset `2px`; border-radius `--radius-xs`. |
| **Active** | Color `--color-text-primary-inverted`; transform `scale(0.99)`. |
| **Disabled** | Color `--color-text-muted`; cursor `not-allowed`; pointer-events `none`. |

#### Interaction Behavior
- **Keyboard:** Must activate on `Enter`. Must receive sequential focus via `Tab`.
- **Pointer/Touch:** Minimum hit area must be 44×44px. Hover transitions must complete within `--motion-duration-instant`.
- **Overflow & Long Content:** Must truncate using ellipsis or soft-wrap without breaking container bounds.

---

### 3.2 Buttons (Density: 27)

#### Anatomy & Variants
1. **Primary Action ("Customize & Render"):** Solid high-contrast background with bold label.
2. **Secondary / Utility ("Copy Prompt", "Filter"):** Subtle border ring with inner icon + text.
3. **Ghost / Icon ("Close", "⌘K Trigger"):** Transparent background, icon-only or badge.

```
+--------------------------------------------------------+
| [Prefix Icon]      Button Label Text     [Kbd Badge]   |
+--------------------------------------------------------+
```

#### Token Requirements
- **Height / Spacing:**
  - Standard button: `height: 38px`, padding `0 var(--space-4)`, gap `var(--space-1)`.
  - Compact utility: `height: 32px`, padding `0 var(--space-3)`, gap `var(--space-1)`.
- **Typography:** `--font-size-md` (14px), `--font-weight-medium` (500).
- **Radius:** `--radius-md` (10px) for standard buttons; `--radius-2xl` for filter pill buttons.

#### State Matrix
| State | Primary Variant | Secondary / Pill Variant |
|---|---|---|
| **Default** | Bg `#ffffff`, text `#000000`, border `none` | Bg `rgba(255,255,255,0.04)`, border `1px solid var(--color-border-subtle)`, text `--color-text-secondary-inverted` |
| **Hover** | Bg `#f0f0f0`, transform `translateY(-1px)` | Bg `rgba(255,255,255,0.08)`, border `var(--color-border-strong)`, text `--color-text-primary-inverted` |
| **Focus-Visible** | Outline `2px solid var(--color-focus-ring)`, offset `2px` | Outline `2px solid var(--color-focus-ring)`, offset `2px` |
| **Active** | Transform `scale(0.98)` | Transform `scale(0.98)` |
| **Loading** | Spinner replaces prefix icon; label remains visible; `aria-busy="true"` | Same |
| **Disabled** | Opacity `0.45`, cursor `not-allowed`, pointer-events `none` | Opacity `0.45`, cursor `not-allowed` |
| **Success (Feedback)** | Checkmark icon replaces copy icon; text updates to "Copied!" for 2000ms | Same |

#### Interaction Behavior
- **Keyboard:** Must trigger on both `Enter` and `Space`.
- **Screen Reader:** Action state must announce changes (e.g. `aria-live="polite"` announcing "Copied to clipboard").

---

### 3.3 Inputs & Search (Density: 3)

#### Anatomy
Global Search (`⌘K`), Category Text Search, and Filter Dropdown inputs.

```
+--------------------------------------------------------------------------+
| [Search Icon 🔍]  Placeholder: "Search 12+ motion prompts..."    [⌘K]    |
+--------------------------------------------------------------------------+
```

#### Token Requirements
- **Dimensions:** Height `40px`, padding `0 var(--space-4) 0 var(--space-7)`, radius `--radius-sm` (8px).
- **Typography:** `--font-size-md` (14px), line-height `--line-height-md`.
- **Surfaces:** Background `rgba(255,255,255,0.04)`, border `1px solid var(--color-border-subtle)`.

#### State Matrix
| State | Visual Output |
|---|---|
| **Default** | Border `var(--color-border-subtle)`, text `--color-text-primary-inverted`, placeholder `--color-text-secondary-inverted`. |
| **Hover** | Border `var(--color-border-strong)`, background `rgba(255,255,255,0.06)`. |
| **Focus-Visible** | Border `var(--color-accent-brand)`, outline `2px solid var(--color-focus-ring)`, offset `1px`. |
| **Error / Invalid** | Border `var(--color-status-error)`, error helper text in `--color-status-error` below input. |
| **Disabled** | Background `rgba(255,255,255,0.02)`, opacity `0.4`, cursor `not-allowed`. |

#### Interaction Behavior
- **Keyboard:** Pressing `⌘K` or `/` from anywhere on the page must focus the input. Pressing `Escape` must clear input or close search modal.

---

### 3.4 Bento Showcase Cards (Density: 2 Core Card Patterns)

#### Anatomy
The hallmark Prompt Motion pattern: an outer bento container enclosing a nested media preview stage, author attribution, tag pills, and instant action button.

```
+-------------------------------------------------------------------------+
| [Bento Card Container: radius.xl (22px), padding: 10px]                |
|  +-------------------------------------------------------------------+  |
|  | [Media Viewport: radius.lg (14px), aspect 16:9 or 9:16]          |  |
|  |  Interactive Canvas / WebGL / MP4 Loop                           |  |
|  |  +---------------------------+       +------------------------+  |  |
|  |  | Category Tag (e.g. UI)    |       | Duration (e.g. 0:08)   |  |  |
|  |  +---------------------------+       +------------------------+  |  |
|  +-------------------------------------------------------------------+  |
|  Card Metadata:                                                         |
|  Title (16px, semibold)                     [Copy Prompt Button]        |
|  Description (13px, secondary)                                          |
|  Author: @handle · 60 FPS · 4K                                          |
+-------------------------------------------------------------------------+
```

#### Token Requirements
- **Outer Shell:** Radius `--radius-xl` (22px), padding `--space-2` (10px), background `--color-surface-elevated` (`#111216`), border `1px solid var(--color-border-subtle)`, shadow `--shadow-1`.
- **Inner Viewport:** Radius `--radius-lg` (14px), overflow `hidden`, background `#000000`.
- **Card Spacing:** Grid gap `--space-5` (20px).

#### State Matrix
| State | Visual Output |
|---|---|
| **Default** | Border `rgba(255,255,255,0.08)`, transform `none`. |
| **Hover** | Border `rgba(255,255,255,0.18)`, transform `translateY(-2px)`, shadow elevated. |
| **Focus-Visible** | Outline `2px solid var(--color-focus-ring)`, offset `2px`. |
| **Empty State** | Display friendly icon, "No motion prompts found", with button to reset filter. |

---

### 3.5 Navigation Systems (Density: 2)

#### 1. Global Header Bar
- **Position:** Fixed top, `backdrop-filter: blur(16px)`, background `rgba(9, 9, 11, 0.82)`, border-bottom `1px solid var(--color-border-subtle)`.
- **Height:** 64px (`--space-8`).
- **Anatomy:** Brand Logo (left) $\rightarrow$ Global Nav Links (center) $\rightarrow$ Search Trigger + GitHub Icon (right).

#### 2. Left Hierarchy Sidebar / TOC
- **Position:** Sticky `top: 64px`, height `calc(100vh - 64px)`, width `260px`, overflow-y `auto`.
- **Hierarchy:**
  - Group Header: `--font-size-xs` (12px), uppercase, `--font-weight-semibold`, tracking `0.05em`, color `--color-text-muted`.
  - Item Link: `--font-size-md` (14px), height `32px`, padding `0 var(--space-3)`, radius `--radius-xs`. Active indicator: vertical left stripe `2px solid var(--color-accent-brand)`.

---

### 3.6 Lists and Parameter Specifications (Density: 1)

#### Anatomy & Token Requirements
- **Structure:** Key-value pairs describing composition properties, CLI flags, or schema definitions.
- **Padding:** `--space-3` vertical per row, border-bottom `1px solid var(--color-border-subtle)`.
- **Key Badge:** Monospace `--font-family-mono`, `--font-size-xs`, background `rgba(255,255,255,0.06)`, padding `2px 6px`, radius `--radius-xs`.
- **Value Description:** `--font-size-md`, color `--color-text-secondary-inverted`.

---

### 3.7 Data & Reference Tables (Density: 1)

#### Anatomy & Token Requirements
- **Container:** Full width, border `1px solid var(--color-border-subtle)`, radius `--radius-sm`, overflow-x `auto`.
- **Header (`<thead>`):** Background `rgba(255,255,255,0.03)`, height `38px`, text `--font-size-xs`, uppercase, weight `--font-weight-semibold`.
- **Cells (`<td>`):** Padding `--space-3` horizontal, `--space-3` vertical, text `--font-size-md`, border-bottom `1px solid var(--color-border-subtle)`.
- **Row Hover:** Background `rgba(255,255,255,0.02)`.

---

## 4. Accessibility Requirements & Acceptance Criteria (WCAG 2.2 AA)

Teams **must** verify every component against these testable pass/fail gates prior to merge.

| Requirement ID | WCAG Criteria | Testable Acceptance Condition | Pass / Fail Check |
|---|---|---|---|
| **ACC-01** | 1.4.3 Contrast (Minimum) | Primary text `#ededed` on `#111216` has a contrast ratio of $\ge 12.8:1$. Secondary text `#a1a1aa` has a ratio of $\ge 5.8:1$ (exceeds 4.5:1 minimum). | Automated axe-core check. |
| **ACC-02** | 2.4.7 Focus Visible | Every interactive element (`<a>`, `<button>`, `<input>`) must display a visible ring matching `--color-focus-ring` with at least 2px thickness and 2px offset. | Keyboard tab through test. |
| **ACC-03** | 2.1.1 Keyboard Navigation | All buttons, links, inputs, and category filter pills must be accessible and operable using only `Tab`, `Shift+Tab`, `Enter`, and `Space`. | Manual keyboard pass. |
| **ACC-04** | 2.5.8 Target Size (Minimum) | Every interactive target must measure at least 24×24px, and primary touch controls must provide at least 44×44px hit bounds. | Touch target inspection. |
| **ACC-05** | 4.1.3 Status Messages | Clicking "Copy Prompt" must trigger a live announcement (`role="status"`, `aria-live="polite"`) informing screen readers that text was copied. | NVDA/VoiceOver test. |
| **ACC-06** | 2.4.1 Bypass Blocks | A "Skip to main content" link must be the first focusable element on page load. | Press `Tab` on load. |

---

## 5. Content and Tone Standards

Prompt Motion documentation communicates with technical velocity. Copy must be precise, active, and devoid of marketing hyperbole.

### 5.1 Voice Principles
1. **Direct and Active:** Use imperative command verbs (*"Render composition"*, *"Copy prompt"*, *"Inspect AST"*).
2. **Context-Rich Microcopy:** Never use vague labels like *"Click here"* or *"More"*.
3. **Deterministic Feedback:** Clearly announce time, duration, frame counts, and file formats.

### 5.2 Microcopy Comparison Table

| Location | ❌ Prohibited Copy | ✅ Standard Compliant Copy |
|---|---|---|
| **Primary Action** | "Click to generate" | "Customize & Render Video" |
| **Card Action** | "Copy" | "Copy Prompt" |
| **Feedback State** | "Done" / "Finished" | "Copied to clipboard" (with 2s timeout) |
| **Search Placeholder** | "Type here..." | "Search 12+ curated motion prompts..." |
| **Filter Empty State**| "Nothing found" | "No recipes matching '{query}'. Reset filters" |
| **CLI Command Tab** | "Run this in terminal" | "Terminal (bash)" |

---

## 6. Anti-Patterns & Prohibited Implementations

Engineers **must not** implement any of the following anti-patterns:

### ❌ Anti-Pattern 1: Raw Hex or Ad-Hoc Utility Classes
```css
/* ❌ PROHIBITED */
.my-card {
  background: #17171c;
  border-radius: 18px;
  padding: 11px;
}

/* ✅ REQUIRED */
.bento-card {
  background: var(--color-surface-elevated);
  border-radius: var(--radius-xl);
  padding: var(--space-2);
}
```

### ❌ Anti-Pattern 2: Disabling Focus Rings
```css
/* ❌ PROHIBITED */
button:focus {
  outline: none;
}

/* ✅ REQUIRED */
button:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
```

### ❌ Anti-Pattern 3: Inaccessible Icon-Only Buttons
```html
<!-- ❌ PROHIBITED -->
<button onclick="copy()"><svg ...></svg></button>

<!-- ✅ REQUIRED -->
<button aria-label="Copy prompt to clipboard" onclick="copy()">
  <svg aria-hidden="true" ...></svg>
  <span class="sr-only">Copy prompt to clipboard</span>
</button>
```

### ❌ Anti-Pattern 4: Overflow Clipping Without Visual Affordance
Do not use `overflow: hidden` on code blocks or parameter tables without providing horizontal scrollbars or wrapping affordances.

---

## 7. QA Checklist for Implementation

Prior to submitting pull requests or merging UI changes, verify:

- [ ] **Tokens:** All typography, colors, radii, shadows, and spacings resolve to CSS custom properties. Zero raw hex codes in component styles.
- [ ] **Font Hierarchy:** Page headers use `Geist` at `--font-size-xl` (30px); body uses 16px; microcopy uses 12.8px/12px.
- [ ] **Bento Geometry:** Outer bento cards strictly have `--radius-xl` (22px) and `--space-2` (10px) padding. Inner viewport strictly has `--radius-lg` (14px).
- [ ] **Category Filter Bar:** Live item counters render inside badges; selection state uses `--radius-2xl` pill styling.
- [ ] **Keyboard Navigation:** Every card action, search input, and link can be operated with `Tab` / `Enter` / `Space`.
- [ ] **Copy Feedback:** Visual checkmark + `aria-live` announcement triggers reliably upon clicking "Copy Prompt".
- [ ] **Responsive Breakpoints:**
  - Desktop (>1024px): 3-column bento grid.
  - Tablet (768px–1024px): 2-column bento grid.
  - Mobile (<768px): 1-column bento grid with horizontal swipe category pills.
- [ ] **Contrast:** All text satisfies $\ge 4.5:1$ contrast against adjacent background.
