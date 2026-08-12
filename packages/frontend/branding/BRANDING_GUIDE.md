# Vaded Gaming Branding Guide

## Brand Name

- Primary product name: `Vaded Gaming`
- Dashboard: `Vaded Gaming Dashboard`

## Logo Source

- Frontend runtime asset: `packages/frontend/public/vaded-logo.png`
- Favicon: `packages/frontend/public/favicon.png`

## Logo Usage

- Minimum display size:
    - Sidebar: `32x32`
    - Login hero: `48x48`
- Clear space: Keep at least `0.25x` logo width padding from surrounding elements.
- Allowed backgrounds: Dark neutral surfaces.
- A soft red glow halo behind the logo is allowed on the landing page hero and sidebar brand mark (see Visual Style). Do not stretch or recolor the mark itself.

## Color System

**Red brand** (VadedHosting reference design) — bold, gaming-forward, maximalist:

| Purpose                         | Color               |
| ------------------------------- | ------------------- |
| Primary accent / CTAs / focus   | `#dc2626` (red-600) |
| Primary hover / strong emphasis | `#b91c1c` (red-700) |
| Accent / gradient ends / glow   | `#ef4444` (red-500) |
| Soft accent / icon tints        | `#f87171` (red-400) |
| Success                         | `#23a55a`           |
| Error                           | `#f23f42`           |
| Warning                         | `#f0b232`           |
| Info                            | `#00aafc`           |
| Page background (canvas)        | `#0f1117`           |
| Sidebar                         | `#161b22`           |
| Panel                           | `#1c2129`           |
| Elevated                        | `#222831`           |
| Highlight (active)              | `#2a3140`           |

Discord blurple (`#5865f2`) is kept only where it literally represents the Discord brand (invite CTA, OAuth). It is never a UI accent.

## Typography

- **Display/Hero** (`h1`–`h4`, landing headline, KPI numerals): `Orbitron` — bold, all-caps where it reads as a wordmark or hero numeral (e.g. "VADED GAMING", stat counters). Fallback stack: `'Orbitron', 'Sora', sans-serif`.
- **UI headings / section titles**: `Sora` — weight 600–800, sentence case.
- **Body / labels / controls**: `Manrope` — weight 400–500, 14–15px for dashboard density.
- **Mono / data**: `JetBrains Mono` — command snippets, IDs, case numbers, timestamps, eyebrow labels.
- Type-meta eyebrows use uppercase + `0.18–0.22em` tracking. Body copy stays sentence case.

## Visual Style — maximalist red/neon (supersedes the prior "flat, no-glow" rule)

This app leans into glassmorphism, neon glow, and motion as its signature look. This is a deliberate reversal of the earlier "flat panels, no glow" guidance — the landing page and sidebar active-state already implemented this direction before the guide caught up; this section documents that reality and extends it dashboard-wide.

- **Glassmorphism**: `surface-panel` / `surface-card` / `surface-glass` utilities (`index.css`) — translucent dark background, `backdrop-filter: blur()`, subtle red-tinted border. Use for panels, modals, dropdowns, the sidebar, and the sticky header.
- **Neon glow**: red box-shadow glow (`shadow-glow-red` / `shadow-glow-red-sm`) on active sidebar nav items, primary CTA idle/hover, card hover, and focus rings. Status glows use the matching status color (green/amber/red/blue), never red.
- **Gradients**: diagonal brand gradients (`--vaded-gradient-brand`) on primary buttons and hero backgrounds; soft radial red spotlights behind hero headlines and in card corners.
- **Motion**: fade/slide entrances (`fade-up`, `fade-in`) plus purposeful continuous motion — pulsing glow on the primary CTA, a breathing dot on live/online indicators, hover lift on interactive cards/rows, staggered list entrances. Keep continuous motion subtle and always respect `prefers-reduced-motion`.
- **Particles**: a full-intensity particle field is allowed on the landing hero only; the dashboard gets a much subtler, reduced-opacity version so it never competes with data readability. Both are `useReducedMotion`-aware and lazy-loaded.
- Borders use `--vaded-border-soft` by default, upgrade to `--vaded-border-strong` or a red-tinted glow border on hover/active.

## Typography Rules

- Headings use Sora (UI) or Orbitron (hero/display) with moderate-to-tight tracking; body text never uses display-style tracking.
- Mono eyebrows (`text-[10px] font-mono uppercase tracking-widest`) remain the operational-console pattern for section/status labels.
- All-caps is reserved for the Orbitron display context (wordmarks, hero numerals, eyebrows) — dashboard body copy and form labels stay sentence case for readability.

## Voice and Copy

- Landing/marketing copy can be bold and energetic ("gaming-forward"); dashboard/admin copy stays direct and operational — clear action labels, minimal marketing language on functional screens.
- No "Neo-editorial command center" or generic AI-aesthetic taglines.
- Icons in colored contexts use brand red, success green, warning amber, error red, or info blue as appropriate; Discord blurple only for literal Discord affordances.
