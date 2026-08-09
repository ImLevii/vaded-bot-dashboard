import type { DocsNavGroup } from './DocsShell'

export const LEGAL_NAV: DocsNavGroup[] = [
    {
        heading: 'Legal',
        items: [
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Privacy Policy', href: '/privacy' },
        ],
    },
    {
        heading: 'Product',
        items: [
            { label: 'Docs', href: '/docs' },
            { label: 'Changelog', href: '/changelog' },
        ],
    },
    {
        heading: 'External',
        items: [
            {
                label: 'GitHub',
                href: 'https://github.com/imlevii/vaded-gaming',
                external: true,
            },
            {
                label: 'Issues',
                href: 'https://github.com/imlevii/vaded-gaming/issues',
                external: true,
            },
        ],
    },
]
