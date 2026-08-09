import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

type NavKey = 'docs' | 'changelog' | 'github'

type Props = {
    breadcrumb: string
    sidebarOpen?: boolean
    onToggleSidebar?: () => void
    /** Optional override for which top-nav item is highlighted. */
    activeNav?: NavKey
}

/**
 * Shared sticky header for /docs, /changelog, /terms, /privacy.
 *
 * Right-side nav links auto-derive active state from the URL when `activeNav`
 * is omitted.
 */
export default function PublicHeader({
    breadcrumb,
    sidebarOpen = false,
    onToggleSidebar,
    activeNav,
}: Props) {
    const { pathname } = useLocation()
    const inferred: NavKey | null = pathname.startsWith('/docs')
        ? 'docs'
        : pathname.startsWith('/changelog')
          ? 'changelog'
          : null
    const current = activeNav ?? inferred

    const linkBase =
        'hidden sm:inline-flex items-center rounded-md px-2.5 py-1.5 transition-colors'
    const linkInactive = 'hover:bg-vaded-surface-panel hover:text-vaded-text-strong'
    const linkActive = 'bg-vaded-surface-panel text-vaded-text-strong'

    return (
        <header className='sticky top-0 z-30 border-b border-vaded-border-soft bg-vaded-surface-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-vaded-surface-canvas/65'>
            <div className='mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 md:px-6'>
                <div className='flex items-center gap-2'>
                    {onToggleSidebar ? (
                        <button
                            onClick={onToggleSidebar}
                            aria-label={
                                sidebarOpen
                                    ? 'Close navigation'
                                    : 'Open navigation'
                            }
                            className='lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-vaded-text-muted hover:bg-vaded-surface-panel hover:text-vaded-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vaded-brand'
                        >
                            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
                        </button>
                    ) : null}
                    <Link
                        to='/'
                        className='inline-flex items-center gap-2 text-vaded-text-strong hover:text-vaded-brand transition-colors'
                    >
                        <img
                            src='/vaded-logo.png'
                            alt='Vaded Gaming'
                            width='24'
                            height='24'
                            className='h-6 w-6 rounded-lg'
                            loading='eager'
                        />
                        <span className='font-mono text-sm font-semibold tracking-tight'>
                            VADED<span className='text-vaded-brand'>GAMING</span>
                        </span>
                    </Link>
                    <span className='ml-1 hidden text-vaded-border-strong md:inline'>
                        /
                    </span>
                    <span className='hidden font-mono text-xs uppercase tracking-[0.2em] text-vaded-text-muted md:inline'>
                        {breadcrumb}
                    </span>
                </div>
                <nav className='flex items-center gap-1 font-mono text-xs text-vaded-text-muted'>
                    <Link
                        to='/docs'
                        className={`${linkBase} ${current === 'docs' ? linkActive : linkInactive}`}
                    >
                        docs
                    </Link>
                    <Link
                        to='/changelog'
                        className={`${linkBase} ${current === 'changelog' ? linkActive : linkInactive}`}
                    >
                        changelog
                    </Link>
                </nav>
            </div>
        </header>
    )
}
