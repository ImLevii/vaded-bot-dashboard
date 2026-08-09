# Vaded Gaming Branding Guide

## Brand Name

- Primary product name: `Vaded Gaming`
- Dashboard: `Vaded Gaming Dashboard`

## Logo Source

- Frontend runtime asset: `packages/frontend/public/lucky-logo.png`
- Favicon: `packages/frontend/public/favicon.png`

## Logo Usage

- Minimum display size:
    - Sidebar: `32x32`
    - Login hero: `48x48`
- Clear space: Keep at least `0.25x` logo width padding from surrounding elements.
- Allowed backgrounds: Dark neutral surfaces.
- Avoid: Stretching, recoloring, glow backdrops, or gradient overlays behind the logo.

## Color System

**Red brand** (VadedHosting reference design):

- **Primary** (CTAs, active nav, focus rings, logo): Red `#dc2626`, hover/strong `#b91c1c`.
- **Accent** (gradient ends, highlights): Lighter red `#ef4444`, soft `#f87171`.

Removed the neon pink/orange and Discord blurple primaries — not part of the current brand palette (Discord blurple assets kept only where they literally represent the Discord brand, e.g. `--color-brand-discord`).

| Purpose                  | Color                                  |
| ------------------------ | -------------------------------------- |
| Primary accent / CTAs    | `#dc2626` (red-600)                    |
| Primary hover            | `#b91c1c` (red-700)                    |
| Secondary accent         | `#ef4444` (red-500)                    |
| Landing gradient end     | `#b91c1c` (red-700)                    |
| Success                  | `#23a55a`                              |
| Error                    | `#f23f42`                              |
| Warning                  | `#f0b232`                              |
| Page background (canvas) | `#0f1117`                              |
| Sidebar                  | `#161b22`                              |
| Panel                    | `#1c2129`                              |
| Elevated                 | `#222831`                              |
| Highlight (active)       | `#2a3140`                              |

## Typography

- **Display font**: `Sora` — used for all headings (`h1`–`h4`, `type-display`, `type-title`).
- **Body font**: `Manrope` — used for body copy, UI labels, controls.
- **Mono font**: `JetBrains Mono` — used for command snippets, IDs, case numbers, technical metadata.

## Typography Rules

- Keep body text at `14–15px` for dashboard readability.
- Use sentence case for labels; avoid all-caps except for `type-meta` eyebrows (0.07em tracking).
- No extreme letter-spacing or display-style tracking in UI text.
- Headings use Sora with moderate negative tracking (`-0.01em` to `-0.02em`).
- Mono eyebrows (`text-[10px] font-mono uppercase tracking-widest`) are the redesign's operational-console pattern — use for section/status labels.

## Voice and Copy

- Keep messaging direct and operational — clear action labels, minimal marketing language in admin screens.
- No "Neo-editorial command center" or AI-aesthetic taglines.
- No Sparkles icons used decoratively.

## Visual Style

- Flat panels: no glassmorphism, no radial gradients on page backgrounds, no shimmer/glow effects.
- Borders use `--lucky-border-soft` by default, upgrade to `--lucky-border-strong` on hover.
- Motion: only fade transitions (`fade-up`, `fade-in`). No floating, glowing, or pulsing effects.
- Icons in colored contexts use blurple, success green, warning amber, or error red as appropriate.
