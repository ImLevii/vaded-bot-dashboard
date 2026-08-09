import { describe, expect, it } from 'vitest'
import {
    renderRouteHtml,
    buildSitemap,
    buildRobots,
    OG_IMAGE_URL,
} from './prerender'
import { PUBLIC_ROUTES, ROUTE_META_BY_PATH, type RouteMeta } from './routeMeta'

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <title>Default Title</title>
    <meta name="description" content="default description" />
    <meta property="og:title" content="Default Title" />
    <meta property="og:description" content="default description" />
    <meta property="og:url" content="https://vadedgaming.com" />
    <meta property="og:image" content="https://vadedgaming.com/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Default Title" />
    <meta name="twitter:description" content="default description" />
    <meta name="twitter:image" content="https://vadedgaming.com/og-image.png" />
    <link rel="canonical" href="https://vadedgaming.com/" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`

function getCanonical(html: string): string | null {
    return html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null
}
function getMeta(html: string, attr: string, key: string): string | null {
    return (
        html.match(
            // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
            new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`),
        )?.[1] ?? null
    )
}

describe('renderRouteHtml', () => {
    it('swaps in distinct per-route title/description/og/canonical', () => {
        const html = renderRouteHtml(
            TEMPLATE,
            ROUTE_META_BY_PATH['/changelog']!,
        )
        expect(html).toContain('<title>Changelog · Vaded Gaming</title>')
        expect(getMeta(html, 'name', 'description')).toBe(
            'Release notes and version history for Vaded Gaming.',
        )
        expect(getMeta(html, 'property', 'og:title')).toBe('Changelog · Vaded Gaming')
        expect(getMeta(html, 'property', 'og:url')).toBe(
            'https://vadedgaming.com/changelog',
        )
        expect(getCanonical(html)).toBe(
            'https://vadedgaming.com/changelog',
        )
        expect(getMeta(html, 'property', 'og:image')).toBe(OG_IMAGE_URL)
    })

    it('preserves the unrendered SPA body shell and the module script', () => {
        const html = renderRouteHtml(TEMPLATE, ROUTE_META_BY_PATH['/docs']!)
        expect(html).toContain('<div id="root"></div>')
        expect(html).toContain(
            '<script type="module" src="/assets/index.js"></script>',
        )
    })

    it('points an alias og:url at its own path but canonical at the primary', () => {
        const html = renderRouteHtml(TEMPLATE, ROUTE_META_BY_PATH['/terms']!)
        expect(getMeta(html, 'property', 'og:url')).toBe(
            'https://vadedgaming.com/terms',
        )
        expect(getCanonical(html)).toBe(
            'https://vadedgaming.com/terms-of-service',
        )
    })

    it('leaves twitter:card (summary_large_image) untouched', () => {
        const html = renderRouteHtml(TEMPLATE, ROUTE_META_BY_PATH['/']!)
        expect(getMeta(html, 'name', 'twitter:card')).toBe(
            'summary_large_image',
        )
    })

    it('escapes HTML-special characters in metadata', () => {
        const route: RouteMeta = {
            path: '/x',
            title: 'A & B <x>',
            description: 'desc "q" & <y>',
        }
        const html = renderRouteHtml(TEMPLATE, route)
        expect(html).toContain('<title>A &amp; B &lt;x&gt;</title>')
        expect(getMeta(html, 'name', 'description')).toBe(
            'desc &quot;q&quot; &amp; &lt;y&gt;',
        )
    })

    it('emits literal $-sequences from metadata (no replacement-pattern corruption)', () => {
        const route: RouteMeta = {
            path: '/x',
            title: 'Pay $1 or $$ now',
            description: 'Save $$ and $1 today',
        }
        const html = renderRouteHtml(TEMPLATE, route)
        // Without function replacers, `$$` collapses to `$` and `$1` is reinterpreted.
        expect(html).toContain('<title>Pay $1 or $$ now</title>')
        expect(getMeta(html, 'name', 'description')).toBe(
            'Save $$ and $1 today',
        )
    })
})

describe('buildSitemap', () => {
    it('lists only canonical (non-alias) public routes', () => {
        const xml = buildSitemap(PUBLIC_ROUTES)
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
        expect(locs.sort()).toEqual(
            [
                'https://vadedgaming.com/',
                'https://vadedgaming.com/docs',
                'https://vadedgaming.com/changelog',
                'https://vadedgaming.com/terms-of-service',
                'https://vadedgaming.com/privacy-policy',
            ].sort(),
        )
        // aliases excluded
        expect(locs).not.toContain('https://vadedgaming.com/terms')
        expect(locs).not.toContain('https://vadedgaming.com/privacy')
    })
})

describe('buildRobots', () => {
    it('allows root, disallows dashboard + api, and links the sitemap', () => {
        const txt = buildRobots()
        expect(txt).toContain('User-agent: *')
        expect(txt).toContain('Allow: /')
        expect(txt).toContain('Disallow: /api/')
        expect(txt).toContain('Disallow: /features')
        expect(txt).toContain(
            'Sitemap: https://vadedgaming.com/sitemap.xml',
        )
    })
})
