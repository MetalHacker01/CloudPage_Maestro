# Documentation Design System

Reproducible spec for the technical-documentation style used in SFMC Scout's `index.html`. Follow this end-to-end to land the same look on another single-file HTML doc (e.g. `CloudPages_Maestro/DOCUMENTATION.html`). Every CSS rule, JS snippet, and CDN URL below is copy-paste ready.

**Aesthetic in one line:** Inter Tight + JetBrains Mono on a paper-and-ink palette, three-column layout (sidebar | content | TOC), tight modular type scale, hairline-rule tables, terminal-style code blocks, monochrome callouts with a single accent stripe.

---

## 1. Quick start — `<head>` block

Paste this verbatim into the document `<head>`:

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/css/iconoir.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
```

Then add the full `<style>` block from section 4 below.

---

## 2. Design tokens

Everything keys off CSS custom properties on `:root[data-theme="…"]`. Toggle the theme by setting the attribute on `<html>`.

### 2.1 Type scale — major third (1.20 ratio)

```css
--fs-12: 0.75rem;
--fs-13: 0.8125rem;
--fs-14: 0.875rem;
--fs-15: 0.9375rem;
--fs-16: 1rem;
--fs-18: 1.125rem;
--fs-20: 1.25rem;
--fs-24: 1.5rem;
--fs-30: 1.875rem;
--fs-38: 2.375rem;
--fs-48: 3rem;
```

Use only these. No arbitrary `font-size` values.

### 2.2 Spacing — 4 px grid

```css
--sp-1: 4px; --sp-2: 8px;  --sp-3: 12px;
--sp-4: 16px; --sp-5: 24px; --sp-6: 32px;
--sp-7: 48px; --sp-8: 64px; --sp-9: 96px;
```

### 2.3 Radii

```css
--r-2: 4px;   /* chips, inline code */
--r-3: 6px;   /* default surfaces */
--r-4: 10px;  /* cards, code blocks */
--r-5: 14px;  /* hero surfaces */
```

### 2.4 Layout

```css
--sidebar-w: 280px;
--toc-w: 240px;
--content-w: 760px;
```

### 2.5 Type families

```css
--ff-sans: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif;
--ff-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
```

### 2.6 Color — light (paper)

```css
--bg-0: #fafaf7;       /* page background, warm paper */
--bg-1: #ffffff;       /* surfaces (sidebar, cards) */
--bg-2: #f3f2ed;       /* raised (table header, hover) */
--bg-code: #f6f5f0;    /* code blocks */
--border-1: #e7e5dd;   /* hairline */
--border-2: #d4d1c6;   /* strong */
--text-1: #0f1115;     /* primary ink */
--text-2: #4b5260;     /* body */
--text-3: #7a7f8a;     /* muted */
--accent: #2563eb;
--accent-hi: #1d4ed8;
--accent-tint: rgba(37, 99, 235, 0.08);
--success: #1f7a3a;
--warning: #b06f00;
--danger: #c0322a;
--info: #1e64c8;
--shadow-1: 0 1px 2px rgba(15,17,21,0.04);
--shadow-2: 0 4px 16px rgba(15,17,21,0.06);
--grid-line: rgba(15,17,21,0.03);
```

### 2.7 Color — dark (ink)

```css
--bg-0: #0a0b0d;
--bg-1: #111316;
--bg-2: #181b20;
--bg-code: #0d1014;
--border-1: #1f242c;
--border-2: #2c333d;
--text-1: #e8eaed;
--text-2: #a8afb8;
--text-3: #6b727b;
--accent: #4d8eff;
--accent-hi: #7ba6ff;
--accent-tint: rgba(77, 142, 255, 0.12);
--success: #3fb950;
--warning: #d29922;
--danger: #f85149;
--info: #58a6ff;
--shadow-1: 0 1px 2px rgba(0,0,0,0.4);
--shadow-2: 0 8px 24px rgba(0,0,0,0.4);
--grid-line: rgba(255,255,255,0.02);
```

**Brand-swap note.** To rebrand for CloudPages_Maestro, change only the `--accent` / `--accent-hi` / `--accent-tint` triple in both themes. The rest of the palette stays. Don't introduce a second accent — restraint is the look.

---

## 3. HTML skeleton

The doc is a single file with three regions:

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>...</head>
<body>
  <!-- Floating theme toggle -->
  <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
    <i class="iconoir-half-moon"></i>
  </button>

  <!-- Left sidebar (fixed) -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <img src="logo.png" alt="Project" class="sidebar-logo">
      <div class="sidebar-title">Project Name</div>
      <div class="sidebar-subtitle">v1.0.0 Documentation</div>
      <div class="sidebar-author">© 2026 Author</div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">
        <div class="nav-section-title">Section Group</div>
        <ul class="nav-links">
          <li><a href="#overview" class="nav-link active">Overview</a></li>
          <li><a href="#features" class="nav-link">Features</a></li>
        </ul>
      </div>
      <!-- more nav-sections -->
    </nav>
  </aside>

  <!-- Main content + right rail -->
  <div class="main-wrapper">
    <main class="content">
      <div class="breadcrumb"><a href="#overview">Documentation</a> / Overview</div>

      <section id="overview">
        <h2>Overview</h2>
        <p class="page-description">Hero paragraph.</p>
        <div class="callout callout-info">
          <div class="callout-title"><i class="iconoir-info-circle"></i> Note</div>
          <p>Callout body.</p>
        </div>
      </section>

      <section id="features">
        <h2>Features</h2>
        <h3>Subsection</h3>
        <p>Body text…</p>
      </section>
    </main>

    <!-- Right rail: auto-populated by JS -->
    <aside class="toc-rail" aria-label="On this page">
      <div class="toc-label">On this page</div>
      <ul class="toc-list" id="toc-list"></ul>
    </aside>
  </div>

  <script>/* see section 6 */</script>
</body>
</html>
```

**Rules:**
- Every navigable section is `<section id="…">` directly inside `<main>`.
- Section `<h2>` is the title; `<h3>` are subsections (these are what populate the right rail).
- The right rail is empty in markup — JS builds it from h2/h3 IDs at boot.
- Sidebar nav links use `href="#sectionId"` matching `<section id>`.

---

## 4. Full CSS — copy verbatim

Wrap everything below in `<style>…</style>`.

```css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --fs-12: 0.75rem; --fs-13: 0.8125rem; --fs-14: 0.875rem;
  --fs-15: 0.9375rem; --fs-16: 1rem; --fs-18: 1.125rem;
  --fs-20: 1.25rem; --fs-24: 1.5rem; --fs-30: 1.875rem;
  --fs-38: 2.375rem; --fs-48: 3rem;

  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px; --sp-9: 96px;

  --r-2: 4px; --r-3: 6px; --r-4: 10px; --r-5: 14px;

  --sidebar-w: 280px;
  --toc-w: 240px;
  --content-w: 760px;

  --ff-sans: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --ff-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
}

:root[data-theme="light"] {
  --bg-0: #fafaf7; --bg-1: #ffffff; --bg-2: #f3f2ed; --bg-code: #f6f5f0;
  --border-1: #e7e5dd; --border-2: #d4d1c6;
  --text-1: #0f1115; --text-2: #4b5260; --text-3: #7a7f8a;
  --accent: #2563eb; --accent-hi: #1d4ed8; --accent-tint: rgba(37, 99, 235, 0.08);
  --success: #1f7a3a; --warning: #b06f00; --danger: #c0322a; --info: #1e64c8;
  --shadow-1: 0 1px 2px rgba(15,17,21,0.04);
  --shadow-2: 0 4px 16px rgba(15,17,21,0.06);
  --grid-line: rgba(15,17,21,0.03);
}

:root[data-theme="dark"] {
  --bg-0: #0a0b0d; --bg-1: #111316; --bg-2: #181b20; --bg-code: #0d1014;
  --border-1: #1f242c; --border-2: #2c333d;
  --text-1: #e8eaed; --text-2: #a8afb8; --text-3: #6b727b;
  --accent: #4d8eff; --accent-hi: #7ba6ff; --accent-tint: rgba(77, 142, 255, 0.12);
  --success: #3fb950; --warning: #d29922; --danger: #f85149; --info: #58a6ff;
  --shadow-1: 0 1px 2px rgba(0,0,0,0.4);
  --shadow-2: 0 8px 24px rgba(0,0,0,0.4);
  --grid-line: rgba(255,255,255,0.02);
}

html { scroll-behavior: smooth; }

body {
  font-family: var(--ff-sans);
  font-feature-settings: 'cv11', 'ss01', 'ss03';
  font-size: var(--fs-15);
  line-height: 1.65;
  color: var(--text-1);
  background-color: var(--bg-0);
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 32px 32px;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

::selection { background: var(--accent-tint); color: var(--text-1); }

/* ─── SIDEBAR ─────────────────────────────────────────────── */

.sidebar {
  width: var(--sidebar-w);
  background: var(--bg-1);
  border-right: 1px solid var(--border-1);
  padding: var(--sp-5) 0;
  position: fixed;
  inset: 0 auto 0 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 100;
}

.sidebar-header {
  padding: 0 var(--sp-5) var(--sp-5);
  border-bottom: 1px solid var(--border-1);
  position: relative;
}

.sidebar-logo {
  width: 64px; height: 64px;
  margin: 0 auto var(--sp-3);
  display: block;
  filter: contrast(1.05);
}

.sidebar-title {
  font-size: var(--fs-18);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-1);
  text-align: center;
  margin-bottom: var(--sp-1);
}

.sidebar-subtitle {
  font-family: var(--ff-mono);
  font-size: var(--fs-12);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3);
  text-align: center;
}

.sidebar-author {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--text-3);
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--border-1);
  text-align: center;
}

.sidebar-nav { padding: var(--sp-5) 0 var(--sp-7); }
.nav-section { margin-bottom: var(--sp-5); }

.nav-section-title {
  font-family: var(--ff-mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-3);
  padding: 0 var(--sp-5);
  margin-bottom: var(--sp-2);
}

.nav-links { list-style: none; }

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  position: relative;
  padding: 6px var(--sp-5) 6px calc(var(--sp-5) + var(--sp-3));
  color: var(--text-2);
  text-decoration: none;
  font-size: var(--fs-14);
  line-height: 1.4;
  transition: color 120ms ease, background 120ms ease;
}

.nav-link::before {
  content: '';
  position: absolute;
  left: var(--sp-5);
  top: 50%;
  transform: translateY(-50%);
  width: 3px; height: 3px;
  border-radius: 50%;
  background: transparent;
  transition: background 120ms ease, transform 120ms ease;
}

.nav-link:hover { color: var(--text-1); background: var(--bg-2); }
.nav-link.active { color: var(--accent); font-weight: 500; }
.nav-link.active::before {
  background: var(--accent);
  transform: translateY(-50%) scale(1.6);
}

/* ─── THEME TOGGLE ────────────────────────────────────────── */

.theme-toggle {
  position: fixed;
  top: var(--sp-4);
  right: var(--sp-4);
  width: 36px; height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-1);
  border: 1px solid var(--border-1);
  border-radius: var(--r-3);
  cursor: pointer;
  color: var(--text-1);
  font-size: var(--fs-16);
  z-index: 200;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
.theme-toggle:hover { border-color: var(--border-2); transform: translateY(-1px); }
.theme-toggle:active { transform: translateY(0); }

/* ─── LAYOUT ──────────────────────────────────────────────── */

.main-wrapper {
  margin-left: var(--sidebar-w);
  min-height: 100vh;
  position: relative;
}

.content {
  max-width: var(--content-w);
  padding: var(--sp-8) var(--sp-7) var(--sp-9);
  margin: 0 auto;
}

@media (min-width: 1280px) {
  .content {
    margin-left: max(var(--sp-7),
      calc((100vw - var(--sidebar-w) - var(--toc-w) - var(--content-w)) / 2));
    margin-right: 0;
  }
}

/* ─── BREADCRUMB ──────────────────────────────────────────── */

.breadcrumb {
  font-family: var(--ff-mono);
  font-size: var(--fs-12);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3);
  margin-bottom: var(--sp-6);
}
.breadcrumb a { color: var(--text-3); text-decoration: none; transition: color 120ms ease; }
.breadcrumb a:hover { color: var(--accent); }

/* ─── TYPOGRAPHY ──────────────────────────────────────────── */

h1 {
  font-size: var(--fs-48);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.035em;
  color: var(--text-1);
  margin-bottom: var(--sp-4);
}

.overview-logo {
  width: 96px; height: 96px;
  margin: 0 auto var(--sp-5);
  display: block;
}

.page-description {
  font-size: var(--fs-20);
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: -0.015em;
  color: var(--text-2);
  margin-bottom: var(--sp-6);
}

h2 {
  font-size: var(--fs-30);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.025em;
  color: var(--text-1);
  margin: var(--sp-9) 0 var(--sp-4);
  scroll-margin-top: var(--sp-5);
  padding-top: var(--sp-5);
  border-top: 1px solid var(--border-1);
}

section:first-of-type h2 {
  margin-top: var(--sp-6);
  padding-top: 0;
  border-top: 0;
}

h3 {
  font-size: var(--fs-20);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.015em;
  color: var(--text-1);
  margin: var(--sp-7) 0 var(--sp-3);
  scroll-margin-top: var(--sp-5);
}

h4 {
  font-size: var(--fs-16);
  font-weight: 600;
  color: var(--text-1);
  margin: var(--sp-5) 0 var(--sp-2);
}

p {
  font-size: var(--fs-15);
  line-height: 1.7;
  color: var(--text-2);
  margin-bottom: var(--sp-4);
}
p strong { color: var(--text-1); font-weight: 600; }

/* ─── CODE ────────────────────────────────────────────────── */

code {
  font-family: var(--ff-mono);
  font-size: 0.85em;
  font-weight: 500;
  background: var(--bg-code);
  color: var(--text-1);
  padding: 1px 6px;
  border-radius: var(--r-2);
  border: 1px solid var(--border-1);
}

pre {
  font-family: var(--ff-mono);
  background: var(--bg-code);
  border: 1px solid var(--border-1);
  border-radius: var(--r-4);
  margin: var(--sp-4) 0;
  overflow: hidden;
  position: relative;
  box-shadow: var(--shadow-1);
}

pre::before {
  content: '$';
  position: absolute;
  top: 14px; left: 16px;
  font-family: var(--ff-mono);
  font-size: var(--fs-12);
  color: var(--text-3);
  font-weight: 500;
}

pre code {
  display: block;
  font-size: var(--fs-13);
  line-height: 1.65;
  padding: var(--sp-3) var(--sp-4) var(--sp-3) calc(var(--sp-4) + 14px);
  background: none;
  border: 0;
  border-radius: 0;
  color: var(--text-1);
  overflow-x: auto;
}

/* ─── CALLOUTS ────────────────────────────────────────────── */

.callout {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  margin: var(--sp-5) 0;
  border: 1px solid var(--border-1);
  border-radius: var(--r-4);
  background: var(--bg-1);
  position: relative;
}

.callout::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  border-radius: var(--r-4) 0 0 var(--r-4);
}
.callout-info::before    { background: var(--info); }
.callout-warning::before { background: var(--warning); }
.callout-danger::before  { background: var(--danger); }
.callout-success::before { background: var(--success); }

.callout-title {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-family: var(--ff-mono);
  font-size: var(--fs-12);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: var(--sp-1);
}
.callout-title i { font-size: var(--fs-16); font-style: normal; }

.callout-info    .callout-title { color: var(--info); }
.callout-warning .callout-title { color: var(--warning); }
.callout-danger  .callout-title { color: var(--danger); }
.callout-success .callout-title { color: var(--success); }

.callout p {
  grid-column: 1 / -1;
  font-size: var(--fs-14);
  color: var(--text-2);
  margin: 0;
  line-height: 1.6;
}
.callout p + p { margin-top: var(--sp-2); }

/* ─── TABLES ──────────────────────────────────────────────── */

table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--sp-5) 0;
  font-size: var(--fs-14);
  border: 1px solid var(--border-1);
  border-radius: var(--r-3);
  overflow: hidden;
}

th {
  background: var(--bg-2);
  padding: 10px var(--sp-3);
  text-align: left;
  font-family: var(--ff-mono);
  font-size: var(--fs-12);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-2);
  border-bottom: 1px solid var(--border-1);
}

td {
  padding: 10px var(--sp-3);
  border-bottom: 1px solid var(--border-1);
  color: var(--text-2);
  vertical-align: top;
}

tr:last-child td { border-bottom: 0; }
tr:nth-child(even) td {
  background: color-mix(in oklab, var(--bg-1), var(--bg-2) 30%);
}

td code, th code { background: var(--bg-0); }

/* ─── BADGES (HTTP methods) ───────────────────────────────── */

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--r-2);
  font-family: var(--ff-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-right: var(--sp-2);
  border: 1px solid transparent;
}

[data-theme="dark"] .badge-get    { background: rgba(77,142,255,0.15); color: #7ba6ff; border-color: rgba(77,142,255,0.3); }
[data-theme="dark"] .badge-post   { background: rgba(63,185,80,0.15);  color: #5dd97a; border-color: rgba(63,185,80,0.3); }
[data-theme="dark"] .badge-patch  { background: rgba(210,153,34,0.15); color: #e5b54a; border-color: rgba(210,153,34,0.3); }
[data-theme="dark"] .badge-delete { background: rgba(248,81,73,0.15);  color: #ff7a72; border-color: rgba(248,81,73,0.3); }

[data-theme="light"] .badge-get    { background: rgba(30,100,200,0.08); color: #1e64c8; border-color: rgba(30,100,200,0.2); }
[data-theme="light"] .badge-post   { background: rgba(31,122,58,0.08);  color: #1f7a3a; border-color: rgba(31,122,58,0.2); }
[data-theme="light"] .badge-patch  { background: rgba(176,111,0,0.08);  color: #b06f00; border-color: rgba(176,111,0,0.2); }
[data-theme="light"] .badge-delete { background: rgba(192,50,42,0.08);  color: #c0322a; border-color: rgba(192,50,42,0.2); }

/* ─── MERMAID ─────────────────────────────────────────────── */

.mermaid {
  background: var(--bg-1);
  border: 1px solid var(--border-1);
  border-radius: var(--r-4);
  padding: var(--sp-5);
  margin: var(--sp-5) 0;
  box-shadow: var(--shadow-1);
}

/* ─── LISTS & LINKS ───────────────────────────────────────── */

ul, ol {
  margin: var(--sp-3) 0 var(--sp-4);
  padding-left: var(--sp-5);
  color: var(--text-2);
}

li {
  margin: var(--sp-2) 0;
  font-size: var(--fs-15);
  line-height: 1.65;
}
li::marker { color: var(--text-3); }

a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 120ms ease, color 120ms ease;
}
a:hover { color: var(--accent-hi); border-bottom-color: currentColor; }

/* ─── SCROLLBAR ───────────────────────────────────────────── */

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-3); }

/* ─── FEATURE GRID ────────────────────────────────────────── */

.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin: var(--sp-5) 0;
  background: var(--border-1);
  border: 1px solid var(--border-1);
  border-radius: var(--r-4);
  overflow: hidden;
}

.feature-card {
  background: var(--bg-1);
  padding: var(--sp-5);
  transition: background 150ms ease;
  position: relative;
}
.feature-card:hover { background: var(--bg-2); }
.feature-card::before {
  content: '';
  position: absolute;
  top: var(--sp-5);
  left: var(--sp-5);
  width: 12px; height: 1px;
  background: var(--accent);
}

.feature-card h4 {
  color: var(--text-1);
  margin: var(--sp-3) 0 var(--sp-2);
  font-size: var(--fs-15);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  letter-spacing: -0.01em;
}
.feature-card h4 i { color: var(--accent); font-size: var(--fs-18); }
.feature-card p { font-size: var(--fs-14); line-height: 1.55; margin: 0; color: var(--text-2); }

/* ─── RIGHT-RAIL TOC ──────────────────────────────────────── */

.toc-rail {
  position: fixed;
  top: var(--sp-7);
  right: var(--sp-6);
  width: var(--toc-w);
  max-height: calc(100vh - var(--sp-8));
  overflow-y: auto;
  padding: 0 var(--sp-4) var(--sp-5);
  display: none;
  z-index: 50;
}

@media (min-width: 1280px) {
  .toc-rail { display: block; }
}

.toc-label {
  font-family: var(--ff-mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-3);
  margin-bottom: var(--sp-3);
  padding-bottom: var(--sp-2);
  border-bottom: 1px solid var(--border-1);
}

.toc-list { list-style: none; padding: 0; margin: 0; }
.toc-list li { margin: 0; padding: 0; }

.toc-list a {
  display: block;
  padding: 4px 0 4px var(--sp-3);
  font-size: var(--fs-13);
  line-height: 1.45;
  color: var(--text-3);
  text-decoration: none;
  border-left: 1px solid var(--border-1);
  border-bottom: 0;
  transition: color 120ms ease, border-color 120ms ease;
}
.toc-list a.h3 { padding-left: calc(var(--sp-3) + var(--sp-3)); }
.toc-list a:hover { color: var(--text-1); border-left-color: var(--border-2); }
.toc-list a.active { color: var(--accent); border-left-color: var(--accent); }

/* ─── RESPONSIVE ──────────────────────────────────────────── */

@media (max-width: 1023px) {
  .sidebar { transform: translateX(-100%); transition: transform 200ms ease; }
  .sidebar.open { transform: translateX(0); }
  .main-wrapper { margin-left: 0; }
  .content { padding: var(--sp-6) var(--sp-5) var(--sp-7); }
  h1 { font-size: var(--fs-38); }
  h2 { font-size: var(--fs-24); margin: var(--sp-7) 0 var(--sp-3); padding-top: var(--sp-4); }
}

@media (max-width: 640px) {
  .feature-grid { grid-template-columns: 1fr; }
  h1 { font-size: var(--fs-30); }
  .page-description { font-size: var(--fs-16); }
  pre code { font-size: 12px; }
}

/* ─── PRINT ───────────────────────────────────────────────── */

@media print {
  .sidebar, .toc-rail, .theme-toggle { display: none; }
  .main-wrapper { margin: 0; }
  body { background: white; color: black; }
}
```

---

## 5. Component cheatsheet — HTML to write

### Callout (info / warning / danger / success)

```html
<div class="callout callout-info">
  <div class="callout-title"><i class="iconoir-info-circle"></i> Note</div>
  <p>Body text. Multiple paragraphs allowed.</p>
</div>
```

Swap `callout-info` for `callout-warning`, `callout-danger`, `callout-success`. Pair with an Iconoir icon that matches semantic intent.

### Code block

```html
<pre><code>npm install
npm run dev</code></pre>
```

The terminal `$` prompt is rendered by `pre::before` — don't type it in the content.

### Table

```html
<table>
  <thead>
    <tr><th>Column</th><th>Description</th></tr>
  </thead>
  <tbody>
    <tr><td>Value</td><td>Description text</td></tr>
  </tbody>
</table>
```

Wrap technical terms in `<code>`. Headers automatically render in monospace uppercase.

### HTTP method badge

```html
<span class="badge badge-get">GET</span>
<code>/api/users</code>
```

### Feature grid

```html
<div class="feature-grid">
  <div class="feature-card">
    <h4><i class="iconoir-search"></i> Feature Title</h4>
    <p>Short description.</p>
  </div>
  <div class="feature-card">…</div>
</div>
```

### Mermaid diagram

```html
<div class="mermaid">
graph TB
  A[Start] --> B[Step]
  B --> C[End]
  style A fill:#2563eb,stroke:#2563eb,color:#fff
  style C fill:#1f7a3a,stroke:#1f7a3a,color:#fff
</div>
```

For node fills, use the accent / status hex codes from section 2.6 — they read correctly in both themes.

---

## 6. JavaScript — copy verbatim

Drop this at the end of `<body>` (after the markup, before `</body>`):

```html
<script>
  // ─── THEME ─────────────────────────────────────────────
  const THEME_KEY = 'docs_theme';
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const mermaidThemeFor = (isDark) => ({
    darkMode: isDark,
    background: isDark ? '#0a0b0d' : '#fafaf7',
    primaryColor: isDark ? '#181b20' : '#ffffff',
    primaryBorderColor: isDark ? '#2c333d' : '#d4d1c6',
    primaryTextColor: isDark ? '#e8eaed' : '#0f1115',
    lineColor: isDark ? '#4d8eff' : '#2563eb',
    secondaryColor: isDark ? '#111316' : '#f3f2ed',
    tertiaryColor: isDark ? '#0a0b0d' : '#fafaf7',
    textColor: isDark ? '#e8eaed' : '#0f1115',
    mainBkg: isDark ? '#181b20' : '#ffffff',
    secondBkg: isDark ? '#111316' : '#f3f2ed',
    nodeBorder: isDark ? '#2c333d' : '#d4d1c6',
    clusterBkg: isDark ? '#111316' : '#f3f2ed',
    clusterBorder: isDark ? '#2c333d' : '#d4d1c6',
    edgeLabelBackground: isDark ? '#111316' : '#fafaf7',
    actorBorder: isDark ? '#2c333d' : '#d4d1c6',
    actorBkg: isDark ? '#181b20' : '#ffffff',
    actorTextColor: isDark ? '#e8eaed' : '#0f1115',
    actorLineColor: isDark ? '#4d8eff' : '#2563eb',
    signalColor: isDark ? '#e8eaed' : '#0f1115',
    signalTextColor: isDark ? '#e8eaed' : '#0f1115',
    labelBoxBkgColor: isDark ? '#181b20' : '#ffffff',
    labelBoxBorderColor: isDark ? '#2c333d' : '#d4d1c6',
    labelTextColor: isDark ? '#e8eaed' : '#0f1115'
  });

  function applyMermaid(initial) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    mermaid.initialize({
      startOnLoad: initial,
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: mermaidThemeFor(isDark),
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
    });
    if (!initial) {
      document.querySelectorAll('.mermaid').forEach(n => {
        if (n.dataset.originalCode) n.innerHTML = n.dataset.originalCode;
        else n.dataset.originalCode = n.innerHTML;
        n.removeAttribute('data-processed');
      });
      mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
    }
  }

  function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    const icon = document.querySelector('.theme-toggle i');
    if (icon) icon.className = next === 'dark' ? 'iconoir-half-moon' : 'iconoir-sun-light';
    applyMermaid(false);
  }

  // ─── LEFT NAV SCROLL-SPY ───────────────────────────────
  const sections = Array.from(document.querySelectorAll('main section[id]'));
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));

  function updateActiveLink() {
    let current = sections[0]?.id || '';
    for (const s of sections) {
      if (scrollY + 120 >= s.offsetTop) current = s.id;
    }
    navLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === '#' + current);
    });
    updateTocActive();
  }

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const t = document.getElementById(link.getAttribute('href').slice(1));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ─── RIGHT-RAIL TOC ────────────────────────────────────
  const tocList = document.getElementById('toc-list');
  const slugify = (s) => (s || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const tocEntries = [];

  function buildToc() {
    if (!tocList) return;
    tocList.innerHTML = '';
    document.querySelectorAll('main section[id] h2, main section[id] h3').forEach(h => {
      if (!h.id) {
        const slug = slugify(h.textContent);
        if (slug) h.id = 'h-' + slug;
      }
      if (!h.id) return;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.trim();
      a.className = h.tagName.toLowerCase();
      a.addEventListener('click', e => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(a);
      tocList.appendChild(li);
      tocEntries.push({ id: h.id, link: a, el: h });
    });
  }

  function updateTocActive() {
    if (!tocEntries.length) return;
    let activeId = tocEntries[0].id;
    for (const e of tocEntries) {
      if (scrollY + 140 >= e.el.offsetTop) activeId = e.id;
    }
    tocEntries.forEach(e => e.link.classList.toggle('active', e.id === activeId));
  }

  // ─── BOOT ──────────────────────────────────────────────
  buildToc();
  updateActiveLink();
  window.addEventListener('scroll', updateActiveLink, { passive: true });
  window.addEventListener('resize', updateActiveLink, { passive: true });

  (() => {
    const icon = document.querySelector('.theme-toggle i');
    if (icon) icon.className = savedTheme === 'dark' ? 'iconoir-half-moon' : 'iconoir-sun-light';
  })();

  applyMermaid(true);
</script>
```

**Naming note.** If you have multiple docs sites in localStorage, change `THEME_KEY` to something namespaced like `cpm_docs_theme` so they don't fight each other.

---

## 7. Authoring rules

These are the editorial conventions that keep the doc feeling tight, not the CSS:

1. **One `<section id="…">` per topic.** No bare divs at the top level of `<main>`.
2. **`<h1>` only in special heroes** (not used in normal sections). Use `<h2>` for section titles, `<h3>` for subsections, `<h4>` sparingly.
3. **Wrap technical identifiers in `<code>`** — file paths, env vars, function names, URLs, header names, status codes.
4. **Callouts sparingly.** One per major section maximum. Stack only when warning + danger genuinely co-occur.
5. **No emoji in titles** — Iconoir icons only (`<i class="iconoir-…"></i>`), inline before the title text.
6. **Tables don't zebra by default** — the CSS does `nth-child(even)` for you. Don't add `class="striped"` or similar.
7. **Code blocks are mono prompts.** Each `<pre>` automatically renders a `$` prefix. For multi-line shell, just stack lines; for non-shell code (JSON, JS), the `$` reads as a leading marker — that's intentional. If you want to suppress the prompt for prose code samples, add `class="no-prompt"` and override:
   ```css
   pre.no-prompt::before { content: none; }
   pre.no-prompt code { padding-left: var(--sp-4); }
   ```
8. **Don't override the type scale.** No inline `style="font-size: …"`. Use the `--fs-*` tokens if you genuinely need a custom size.
9. **No floating drop-caps, gradients, or "hero glow" effects.** This is technical documentation, not a marketing page. Restraint is the look.

---

## 8. Brand customization recipe

To re-skin for a different project (e.g. CloudPages Maestro accent green, or a teal):

1. Pick **one** accent color. The same hue works for both themes — just tune saturation for legibility.
2. Compute the four accent tokens:
   - `--accent`: the chosen hex
   - `--accent-hi`: ~10% darker for hover (light theme) or ~10% lighter (dark theme)
   - `--accent-tint`: same hue at 0.08 alpha (light) / 0.12 alpha (dark)
3. Replace those three values in **both** `[data-theme="light"]` and `[data-theme="dark"]` blocks. Touch nothing else.
4. In the JS `mermaidThemeFor`, change `lineColor` and `actorLineColor` to the same accent.

Example — CloudPages Maestro could use a sharper indigo `#5b21b6`:

```css
:root[data-theme="light"] {
  --accent: #5b21b6;
  --accent-hi: #4c1d95;
  --accent-tint: rgba(91, 33, 182, 0.08);
}
:root[data-theme="dark"] {
  --accent: #a78bfa;
  --accent-hi: #c4b5fd;
  --accent-tint: rgba(167, 139, 250, 0.12);
}
```

That's the only change required. Status colors (success/warning/danger/info) stay universal.

---

## 9. What to deliberately *not* do

The style depends on what's missing as much as what's there. Things that will silently make it look generic:

- ❌ `box-shadow: 0 25px 50px rgba(0,0,0,0.25)` — the cheap "floating card" shadow. Use `var(--shadow-1)` (1px subtle) or nothing.
- ❌ `background: linear-gradient(135deg, #6366f1, #8b5cf6)` — the AI-aesthetic gradient. Solid `var(--bg-1)` always.
- ❌ Border radius > 14 px. The look stops at `--r-5`.
- ❌ Sans-serif headings + sans-serif code (use the JetBrains Mono distinction; it does load-bearing visual work).
- ❌ Centered everything. Body content is left-aligned. The only centered things are the sidebar logo + overview hero.
- ❌ Three accent colors. One. Always one.
- ❌ `transition: all 0.3s` on hover effects. Use `transform 120ms ease, color 120ms ease` — explicit and short.
- ❌ Glass / frosted / backdrop-blur surfaces. Flat opaque surfaces only.

---

## 10. Validation checklist

Before shipping, eyeball:

- [ ] First section's `<h2>` has no top border or large top margin (the `:first-of-type` rule should handle this; if not, your first section isn't `:first-of-type` of `<main>`).
- [ ] Right rail visible at ≥ 1280 px viewport; hidden below.
- [ ] Sidebar disappears below 1024 px (you need to wire up a hamburger if you want it back).
- [ ] Theme toggle in top-right swaps icon between `iconoir-half-moon` (dark) and `iconoir-sun-light` (light).
- [ ] Code blocks render the `$` glyph in the top-left automatically.
- [ ] Tables have hairline borders, monospace uppercase headers, alternating row backgrounds.
- [ ] Callouts have a 3px colored left stripe and a mono uppercase title.
- [ ] Mermaid diagrams re-theme on theme toggle without page reload.
- [ ] TOC right-rail highlights the current section in accent color as you scroll.
- [ ] No external CSS dependencies other than Iconoir + Google Fonts + Mermaid.

If all ten check out, the look is correct.
