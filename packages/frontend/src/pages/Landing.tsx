import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { motion, useReducedMotion } from 'framer-motion'
import {
    ArrowUpRight,
    ChevronDown,
    ChevronRight,
    Server,
    Database,
    Layers,
    Music2,
    Shield,
    Wrench,
    SlidersHorizontal,
    LayoutDashboard,
    Sparkles,
    Zap,
    Users,
    Radio,
} from 'lucide-react'
import ParticleBackground from '@/components/ui/ParticleBackground'
import AnimatedCounter from '@/components/ui/AnimatedCounter'
import { fadeUp, staggerContainer } from '@/lib/animations'

export default function Landing() {
    const login = useAuthStore((s) => s.login)
    const prefersReducedMotion = useReducedMotion()
    const { t } = useTranslation()

    usePageMetadata({
        title: t('landing.meta.title'),
        description: t('landing.meta.description'),
    })

    return (
        <div className='vaded-shell min-h-screen dark text-white bg-vaded-surface-canvas'>
            <TopNav onOpenDashboard={login} />
            <Hero
                prefersReducedMotion={prefersReducedMotion ?? false}
                onOpenDashboard={login}
            />
            <StatsStrip />
            <FeatureGrid />
            <CommandList />
            <WhySelfHost />
            <StackList />
            <FooterSection />
        </div>
    )
}

function TopNav({ onOpenDashboard }: { onOpenDashboard: () => void }) {
    return (
        <header
            className='sticky top-0 z-30 border-b border-vaded-border-soft/60 bg-vaded-surface-canvas/80 backdrop-blur-xl supports-[backdrop-filter]:bg-vaded-surface-canvas/60'
            style={{ boxShadow: '0 1px 0 rgba(220,38,38,0.08)' }}
        >
            <div className='mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8'>
                <a
                    href='/'
                    className='inline-flex items-center gap-3 text-vaded-text-strong hover:text-vaded-brand transition-colors'
                >
                    <div className='relative flex-shrink-0'>
                        <img
                            src='/vaded-logo.png'
                            alt='Vaded Gaming'
                            width='44'
                            height='44'
                            className='h-11 w-11 rounded-xl object-cover object-center'
                            loading='eager'
                        />
                    </div>
                    <div className='flex flex-col leading-none'>
                        <span className='font-black text-xl tracking-tight leading-tight'>
                            VADED
                            <span className='text-vaded-brand'>GAMING</span>
                        </span>
                        <span className='font-mono text-[9px] text-vaded-text-muted tracking-widest uppercase opacity-70'>
                            Discord Bot
                        </span>
                    </div>
                </a>
                <nav className='flex items-center gap-1 font-mono text-xs text-vaded-text-muted'>
                    <button
                        onClick={onOpenDashboard}
                        className='group btn-nav-demo inline-flex items-center gap-3 rounded-md px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vaded-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]'
                    >
                        <span className='relative h-4 w-4 shrink-0'>
                            <span
                                aria-hidden
                                className='absolute inset-0 rounded-sm border border-vaded-brand/70 bg-vaded-brand/10 shadow-[0_0_8px_rgba(239,68,68,0.6),inset_0_0_4px_rgba(239,68,68,0.2)]'
                            />
                            <span
                                aria-hidden
                                className='absolute left-0 right-0 top-0 h-1 rounded-t-sm border-b border-vaded-brand/50 bg-vaded-brand/30'
                            />
                            <span
                                aria-hidden
                                className='absolute left-1 right-1 top-2 h-0.5 rounded-full bg-vaded-brand/70'
                            />
                            <span
                                aria-hidden
                                className='absolute left-1 right-1 top-3 h-0.5 w-[70%] rounded-full bg-vaded-brand/70'
                            />
                        </span>
                        <span className='flex flex-col items-start leading-none'>
                            <span className='font-bold text-[10px] uppercase tracking-wider text-vaded-brand [text-shadow:0_0_8px_rgba(239,68,68,0.8)]'>
                                Dashboard
                            </span>
                            <span className='mt-1 text-[9px] text-vaded-text-primary/85 transition-opacity group-hover:opacity-100 opacity-85'>
                                Open control panel
                            </span>
                        </span>
                        <ChevronRight
                            size={12}
                            aria-hidden
                            className='ml-1 shrink-0 text-vaded-text-primary transition-transform duration-300 group-hover:translate-x-0.5'
                        />
                    </button>
                </nav>
            </div>
        </header>
    )
}

function BlueprintGrid() {
    return (
        <>
            {/* Dot grid — matches reference: visible red dots, slight fade at edges */}
            <div
                aria-hidden
                className='pointer-events-none absolute inset-0'
                style={{
                    backgroundImage:
                        'radial-gradient(circle, rgba(220,38,38,0.7) 1.2px, transparent 1.2px)',
                    backgroundSize: '28px 28px',
                    opacity: 0.16,
                }}
            />
            {/* Radial vignette — fades dots away from center, keeps headline area clean */}
            <div
                aria-hidden
                className='pointer-events-none absolute inset-0'
                style={{
                    background:
                        'radial-gradient(ellipse 70% 65% at 50% 50%, transparent 20%, #0f1117 85%)',
                }}
            />
            {/* Bottom hard fade to section below */}
            <div
                aria-hidden
                className='pointer-events-none absolute bottom-0 left-0 right-0 h-40'
                style={{
                    background:
                        'linear-gradient(to bottom, transparent, #0f1117)',
                }}
            />
        </>
    )
}

type HeroProps = { prefersReducedMotion: boolean; onOpenDashboard: () => void }

function Hero({ prefersReducedMotion, onOpenDashboard }: HeroProps) {
    const { t } = useTranslation()

    const anim = prefersReducedMotion
        ? {}
        : {
              initial: { opacity: 0, y: 24 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
          }

    const animDelayed = prefersReducedMotion
        ? {}
        : {
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 },
              transition: {
                  duration: 0.7,
                  delay: 0.15,
                  ease: [0.16, 1, 0.3, 1] as const,
              },
          }

    return (
        <section className='relative overflow-hidden px-4 py-24 md:py-40 md:px-8'>
            {/* Drifting red-spark particle field — deepest layer, full intensity (hero only) */}
            <ParticleBackground variant='landing' />
            {/* VG logo circuit board — deepest background layer */}
            <div
                aria-hidden
                className='pointer-events-none absolute inset-0 flex items-center justify-center'
            >
                <img
                    src='/vg-hero.png'
                    alt=''
                    className='w-full max-w-3xl object-contain select-none'
                    style={{
                        opacity: 0.13,
                        mixBlendMode: 'luminosity',
                        filter: 'saturate(0.4) brightness(1.2)',
                        maskImage:
                            'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%)',
                        WebkitMaskImage:
                            'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%)',
                    }}
                />
            </div>
            {/* Primary center glow */}
            <div
                aria-hidden
                className='pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2'
                style={{
                    width: '900px',
                    height: '600px',
                    background:
                        'radial-gradient(ellipse, rgba(220,38,38,0.22) 0%, rgba(220,38,38,0.06) 45%, transparent 70%)',
                    filter: 'blur(2px)',
                }}
            />
            {/* Wide ambient floor glow */}
            <div
                aria-hidden
                className='pointer-events-none absolute bottom-0 left-0 right-0'
                style={{
                    height: '40%',
                    background:
                        'radial-gradient(ellipse 100% 60% at 50% 100%, rgba(220,38,38,0.08) 0%, transparent 70%)',
                }}
            />
            {/* Left accent glow */}
            <div
                aria-hidden
                className='pointer-events-none absolute left-0 top-1/2 -translate-y-1/2'
                style={{
                    width: '320px',
                    height: '400px',
                    background:
                        'radial-gradient(ellipse, rgba(220,38,38,0.07) 0%, transparent 70%)',
                }}
            />
            {/* Right accent glow */}
            <div
                aria-hidden
                className='pointer-events-none absolute right-0 top-1/2 -translate-y-1/2'
                style={{
                    width: '320px',
                    height: '400px',
                    background:
                        'radial-gradient(ellipse, rgba(220,38,38,0.07) 0%, transparent 70%)',
                }}
            />

            <BlueprintGrid />

            <div className='relative z-10 mx-auto max-w-3xl text-center'>
                {/* Eyebrow */}
                <motion.div {...anim}>
                    <p className='mb-8 inline-flex items-center gap-2.5 rounded-full border border-vaded-brand/35 bg-vaded-brand/10 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-vaded-brand shadow-[0_0_24px_rgba(220,38,38,0.15)]'>
                        <span
                            className='h-1.5 w-1.5 rounded-full bg-vaded-brand shadow-[0_0_6px_rgba(220,38,38,0.8)]'
                            aria-hidden
                        />
                        {t('landing.hero.eyebrow')}
                    </p>

                    {/* Headline */}
                    <h1
                        className='mx-auto mb-7 font-black leading-[0.96] tracking-[-0.05em]'
                        style={{
                            fontSize: 'clamp(3rem,11vw,6.5rem)',
                            fontFamily: "'Orbitron', sans-serif",
                        }}
                    >
                        <span
                            className='block text-white'
                            style={{
                                textShadow: '0 0 80px rgba(255,255,255,0.08)',
                            }}
                        >
                            VADED
                        </span>
                        <span
                            className='block text-vaded-brand'
                            style={{
                                textShadow:
                                    '0 0 60px rgba(220,38,38,0.5), 0 0 120px rgba(220,38,38,0.2)',
                            }}
                        >
                            GAMING
                        </span>
                    </h1>
                </motion.div>

                <motion.div {...animDelayed}>
                    <p className='mx-auto mb-10 max-w-[44ch] text-base leading-relaxed text-vaded-text-body md:text-lg'>
                        {t('landing.hero.subtitle')}
                    </p>

                    {/* CTAs */}
                    <div className='flex flex-col items-center gap-3 sm:flex-row sm:justify-center'>
                        <button
                            onClick={onOpenDashboard}
                            className='group btn-glass inline-flex items-center gap-0 rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vaded-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]'
                        >
                            <span className='flex h-full items-center justify-center px-4 py-3 text-vaded-brand/95'>
                                <LayoutDashboard size={16} aria-hidden />
                            </span>
                            <span className='flex items-center gap-3 px-5 py-3'>
                                <span className='flex flex-col items-start'>
                                    <span className='font-mono text-xs font-black tracking-widest uppercase text-vaded-brand leading-none'>
                                        Dashboard
                                    </span>
                                    <span className='text-[11px] text-vaded-text-tertiary leading-none mt-1 font-medium'>
                                        Open the control panel
                                    </span>
                                </span>
                                <ArrowUpRight
                                    size={14}
                                    className='text-vaded-text-tertiary group-hover:text-vaded-brand transition-colors shrink-0'
                                    aria-hidden
                                />
                            </span>
                        </button>
                        <a
                            href='https://discord.gg/vadedgaming'
                            target='_blank'
                            rel='noreferrer'
                            className='group btn-glass inline-flex items-center gap-0 rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vaded-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]'
                        >
                            <span className='flex h-full items-center justify-center px-4 py-3 text-[#5865F2]'>
                                <svg
                                    viewBox='0 0 24 24'
                                    width='16'
                                    height='16'
                                    aria-hidden='true'
                                    className='h-4 w-4 shrink-0 select-none'
                                    fill='currentColor'
                                >
                                    <path d='M20.32 4.37a19.82 19.82 0 0 0-4.89-1.49.07.07 0 0 0-.08.04c-.21.37-.44.85-.6 1.23a18.7 18.7 0 0 0-5.48 0 12.18 12.18 0 0 0-.62-1.23.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.89 1.49.06.06 0 0 0-.03.03C.52 9 .43 13.45.84 17.86a.08.08 0 0 0 .03.05 19.95 19.95 0 0 0 5.99 2.97.08.08 0 0 0 .08-.03c.46-.62.87-1.27 1.23-1.96a.08.08 0 0 0-.04-.1 13.4 13.4 0 0 1-1.87-.88.08.08 0 0 1 0-.13c.12-.09.25-.19.37-.29a.08.08 0 0 1 .08-.01c3.93 1.75 8.18 1.75 12.06 0a.08.08 0 0 1 .08 0c.12.1.24.2.37.3a.08.08 0 0 1 0 .12c-.6.35-1.23.64-1.88.88a.08.08 0 0 0-.04.1c.35.69.77 1.34 1.23 1.96a.08.08 0 0 0 .08.03 19.9 19.9 0 0 0 6-2.97.08.08 0 0 0 .03-.05c.49-5.08-.84-9.51-3.55-13.43a.06.06 0 0 0-.03-.03ZM8.02 15.28c-1.18 0-2.16-1.07-2.16-2.38 0-1.31.96-2.38 2.16-2.38 1.21 0 2.18 1.07 2.16 2.38 0 1.31-.95 2.38-2.16 2.38Zm7.98 0c-1.18 0-2.16-1.07-2.16-2.38 0-1.31.95-2.38 2.16-2.38 1.2 0 2.18 1.07 2.16 2.38 0 1.31-.95 2.38-2.16 2.38Z' />
                                </svg>
                            </span>
                            <span className='flex items-center gap-3 px-5 py-3'>
                                <span className='flex flex-col items-start'>
                                    <span className='font-mono text-xs font-black tracking-widest uppercase text-[#7289da] leading-none'>
                                        Discord
                                    </span>
                                    <span className='text-[11px] text-vaded-text-tertiary leading-none mt-1 font-medium'>
                                        Join the community
                                    </span>
                                </span>
                                <ArrowUpRight
                                    size={14}
                                    className='text-vaded-text-tertiary group-hover:text-[#5865F2] transition-colors shrink-0'
                                    aria-hidden
                                />
                            </span>
                        </a>
                    </div>
                </motion.div>

                {/* Scroll-down indicator */}
                <motion.div
                    className='mt-16 flex justify-center motion-safe:animate-bounce'
                    initial={prefersReducedMotion ? {} : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    aria-hidden='true'
                >
                    <ChevronDown className='h-5 w-5 text-vaded-text-muted' />
                </motion.div>
            </div>
        </section>
    )
}

interface StatEntry {
    icon: typeof Music2
    value: number | null
    suffix: string
    display: string
    label: string
}

function StatsStrip() {
    const stats: StatEntry[] = [
        {
            icon: Music2,
            value: 10,
            suffix: 'K+',
            display: '',
            label: 'Tracks played',
        },
        {
            icon: Users,
            value: 1,
            suffix: '',
            display: '',
            label: 'Server strong',
        },
        { icon: Zap, value: 100, suffix: '+', display: '', label: 'Commands' },
        {
            icon: Radio,
            value: null,
            suffix: '',
            display: '24/7',
            label: 'Always on',
        },
    ]
    return (
        <div className='border-y border-vaded-border-soft bg-vaded-surface-sidebar'>
            <div className='mx-auto max-w-6xl'>
                <ul className='grid grid-cols-2 divide-x divide-y divide-vaded-border-soft md:grid-cols-4 md:divide-y-0'>
                    {stats.map(
                        ({ icon: Icon, value, suffix, display, label }) => (
                            <li
                                key={label}
                                className='flex items-center gap-3 px-6 py-5 sm:px-8'
                            >
                                <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-vaded-brand/10 text-vaded-brand'>
                                    <Icon size={16} aria-hidden />
                                </span>
                                <div>
                                    {value !== null ? (
                                        <AnimatedCounter
                                            value={value}
                                            suffix={suffix}
                                            className='font-[var(--font-vaded-hero)] text-lg font-bold text-vaded-text-strong leading-none tabular-nums'
                                        />
                                    ) : (
                                        <p className='font-[var(--font-vaded-hero)] text-lg font-bold text-vaded-text-strong leading-none'>
                                            {display}
                                        </p>
                                    )}
                                    <p className='mt-0.5 text-xs text-vaded-text-muted'>
                                        {label}
                                    </p>
                                </div>
                            </li>
                        ),
                    )}
                </ul>
            </div>
        </div>
    )
}

function FeatureGrid() {
    const { t } = useTranslation()
    const features = [
        { key: 'music', icon: Music2, span: 'md:col-span-2' },
        { key: 'moderation', icon: Shield, span: 'md:col-span-1' },
        {
            key: 'customCommands',
            icon: SlidersHorizontal,
            span: 'md:col-span-1',
        },
        { key: 'dashboard', icon: LayoutDashboard, span: 'md:col-span-2' },
        { key: 'embeds', icon: Sparkles, span: 'md:col-span-3' },
    ] as const

    return (
        <section className='border-t border-vaded-border-soft px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <div className='mb-12 flex items-end justify-between gap-4 flex-wrap'>
                    <div>
                        <p className='mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-vaded-brand'>
                            // Features
                        </p>
                        <h2 className='text-3xl font-black tracking-tight text-vaded-text-strong md:text-4xl'>
                            {t('landing.features.heading')}
                        </h2>
                    </div>
                    <p className='max-w-sm text-sm text-vaded-text-body leading-relaxed'>
                        {t('landing.features.subheading')}
                    </p>
                </div>
                <motion.ul
                    className='grid gap-3 md:grid-cols-3'
                    initial='hidden'
                    whileInView='visible'
                    viewport={{ once: true, margin: '-80px' }}
                    variants={staggerContainer(0.08)}
                >
                    {features.map(({ key, icon: Icon, span }) => {
                        const isWide = span !== 'md:col-span-1'
                        return (
                            <motion.li
                                key={key}
                                className={span}
                                variants={fadeUp}
                            >
                                <article className='group relative surface-panel h-full flex flex-col gap-5 rounded-xl p-6 md:p-8 overflow-hidden border border-vaded-border-soft transition-all duration-200 hover:border-vaded-brand/40 motion-safe:hover:-translate-y-1 hover:shadow-card-hover'>
                                    {/* Subtle red corner glow on hover */}
                                    <div
                                        className='pointer-events-none absolute -top-12 -left-12 h-32 w-32 rounded-full bg-vaded-brand/0 group-hover:bg-vaded-brand/6 transition-all duration-500 blur-2xl'
                                        aria-hidden
                                    />
                                    <span className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-vaded-brand/10 text-vaded-brand border border-vaded-brand/20 transition-shadow duration-200 group-hover:shadow-glow-red-sm'>
                                        <Icon size={20} aria-hidden />
                                    </span>
                                    <div>
                                        <h3
                                            className={`mb-2.5 font-bold text-vaded-text-strong tracking-tight ${isWide ? 'text-lg md:text-xl' : 'text-base'}`}
                                        >
                                            {t(
                                                `landing.features.items.${key}.title`,
                                            )}
                                        </h3>
                                        <p className='text-sm text-vaded-text-body leading-relaxed'>
                                            {t(
                                                `landing.features.items.${key}.description`,
                                            )}
                                        </p>
                                    </div>
                                </article>
                            </motion.li>
                        )
                    })}
                </motion.ul>
            </div>
        </section>
    )
}

function WhySelfHost() {
    const { t } = useTranslation()
    const items = ['data', 'fork', 'free'] as const
    return (
        <section className='border-t border-vaded-border-soft px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <p className='mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-vaded-brand'>
                    <span className='mr-2'>{'//'}</span>
                    {t('landing.whySelfHost.heading')}
                </p>
                <h2 className='mb-10 text-2xl font-black tracking-tight text-vaded-text-strong md:text-3xl'>
                    No compromises. No paywalls. Just the bot.
                </h2>
                <ul className='grid gap-px overflow-hidden rounded-xl border border-vaded-border-soft bg-vaded-border-soft md:grid-cols-3'>
                    {items.map((key, i) => (
                        <li
                            key={key}
                            className='group relative bg-vaded-surface-sidebar p-6 sm:p-8 min-w-0 overflow-hidden'
                        >
                            <span className='mb-4 block font-mono text-2xl font-black text-vaded-brand/30 select-none'>
                                0{i + 1}
                            </span>
                            <h3 className='mb-2.5 text-base font-bold text-vaded-text-strong tracking-tight'>
                                {t(`landing.whySelfHost.items.${key}.title`)}
                            </h3>
                            <p className='text-sm text-vaded-text-body leading-relaxed break-words'>
                                {t(
                                    `landing.whySelfHost.items.${key}.description`,
                                )}
                            </p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

function CommandList() {
    const { t } = useTranslation()
    const rows = ['play', 'autoplay', 'queue'] as const

    const kindColor: Record<string, string> = {
        music: 'text-vaded-brand bg-vaded-brand/10 border-vaded-brand/30',
        mod: 'text-vaded-warning bg-vaded-warning/10 border-vaded-warning/30',
        custom: 'text-vaded-success bg-vaded-success/10 border-vaded-success/30',
        música: 'text-vaded-brand bg-vaded-brand/10 border-vaded-brand/30',
        moderação:
            'text-vaded-warning bg-vaded-warning/10 border-vaded-warning/30',
    }

    return (
        <section className='border-t border-vaded-border-soft bg-vaded-surface-sidebar px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-4xl'>
                <h2 className='mb-8 max-w-2xl text-2xl font-semibold tracking-tight text-vaded-text-strong md:text-3xl'>
                    {t('landing.commands.heading')}
                </h2>
                <ul className='overflow-hidden rounded-xl border border-vaded-border-soft bg-vaded-surface-canvas'>
                    {rows.map((key, idx) => {
                        const name = t(`landing.commands.rows.${key}.name`)
                        const desc = t(
                            `landing.commands.rows.${key}.description`,
                        )
                        const kbd = t(`landing.commands.rows.${key}.kbd`)
                        return (
                            <li
                                key={key}
                                className={`group flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4 px-4 py-3.5 transition-colors hover:bg-vaded-surface-panel md:px-5 ${
                                    idx > 0
                                        ? 'border-t border-vaded-border-soft'
                                        : ''
                                }`}
                            >
                                <div className='flex items-center justify-between gap-2 sm:contents'>
                                    <code className='shrink-0 font-mono text-sm font-semibold text-vaded-text-strong sm:w-[120px] md:w-[140px]'>
                                        {name}
                                    </code>
                                    <span
                                        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider sm:order-last ${
                                            kindColor[kbd] ??
                                            'text-vaded-text-muted bg-vaded-surface-elevated border-vaded-border-soft'
                                        }`}
                                    >
                                        {kbd}
                                    </span>
                                </div>
                                <p className='min-w-0 flex-1 text-sm text-vaded-text-body sm:truncate'>
                                    {desc}
                                </p>
                            </li>
                        )
                    })}
                </ul>
                <p className='mt-4 font-mono text-xs text-vaded-text-muted'>
                    {t('landing.commands.more')}
                </p>
            </div>
        </section>
    )
}

function StackList() {
    const { t } = useTranslation()
    const stack = useMemo(
        () => [
            { key: 'bot', icon: Music2 },
            { key: 'backend', icon: Server },
            { key: 'frontend', icon: Layers },
            { key: 'postgres', icon: Database },
            { key: 'redis', icon: Wrench },
            { key: 'nginx', icon: Shield },
        ],
        [],
    )

    return (
        <section className='border-t border-vaded-border-soft px-4 py-20 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                <div className='mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
                    <h2 className='max-w-xl text-2xl font-semibold tracking-tight text-vaded-text-strong md:text-3xl'>
                        {t('landing.stack.heading')}
                    </h2>
                    <p className='max-w-md font-mono text-xs text-vaded-text-muted leading-relaxed'>
                        {t('landing.stack.subheading')}
                    </p>
                </div>
                <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                    {stack.map(({ key, icon: Icon }) => (
                        <li
                            key={key}
                            className='surface-panel flex items-start gap-3 rounded-lg p-4'
                        >
                            <span className='mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-vaded-surface-elevated text-vaded-brand'>
                                <Icon size={15} aria-hidden />
                            </span>
                            <div>
                                <p className='font-mono text-sm font-semibold text-vaded-text-strong'>
                                    {t(`landing.stack.items.${key}.name`)}
                                </p>
                                <p className='mt-1 text-xs text-vaded-text-body leading-relaxed'>
                                    {t(
                                        `landing.stack.items.${key}.description`,
                                    )}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

function FooterSection() {
    const { t } = useTranslation()
    return (
        <footer className='border-t border-vaded-border-soft px-4 py-14 md:px-8'>
            <div className='mx-auto max-w-6xl'>
                {/* CTA banner above footer links */}
                <div className='mb-14 rounded-2xl border border-vaded-brand/20 bg-vaded-brand/5 px-6 py-8 md:px-10 flex flex-col md:flex-row items-center justify-between gap-6'>
                    <div>
                        <h3 className='text-xl font-black text-vaded-text-strong mb-1'>
                            Ready to run it in your server?
                        </h3>
                        <p className='text-sm text-vaded-text-muted'>
                            Drop it in your Discord in under a minute.
                        </p>
                    </div>
                    <a
                        href='https://discord.gg/vadedgaming'
                        target='_blank'
                        rel='noreferrer'
                        className='shrink-0 inline-flex h-11 items-center gap-2 rounded-xl btn-glass px-6 text-sm font-bold text-white'
                    >
                        {t('landing.footer.discord')}
                        <ArrowUpRight size={14} aria-hidden />
                    </a>
                </div>

                <div className='grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1fr] md:gap-12'>
                    <div className='space-y-3'>
                        <div className='flex items-center gap-2.5'>
                            <img
                                src='/vaded-logo.png'
                                alt='Vaded Gaming'
                                width='40'
                                height='40'
                                className='h-10 w-10 rounded-xl'
                            />
                            <div className='inline-flex items-baseline gap-1 font-black text-xl text-vaded-text-strong'>
                                VADED
                                <span className='text-vaded-brand'>GAMING</span>
                            </div>
                        </div>
                        <p className='max-w-xs text-sm text-vaded-text-muted leading-relaxed'>
                            {t('landing.footer.tagline')}
                        </p>
                    </div>
                    <FooterColumn
                        heading={t('landing.footer.links')}
                        links={[
                            { href: '/docs', label: t('landing.footer.docs') },
                            {
                                href: '/changelog',
                                label: t('landing.footer.changelog'),
                            },
                        ]}
                    />
                    <FooterColumn
                        heading={t('landing.footer.support')}
                        links={[
                            {
                                href: 'https://discord.gg/vadedgaming',
                                label: t('landing.footer.discord'),
                                external: true,
                            },
                            {
                                href: '/terms',
                                label: t('landing.footer.terms'),
                            },
                            {
                                href: '/privacy',
                                label: t('landing.footer.privacy'),
                            },
                        ]}
                    />
                </div>

                <div className='mt-10 flex flex-col items-start justify-between gap-3 border-t border-vaded-border-soft pt-6 md:flex-row md:items-center'>
                    <p className='font-mono text-xs text-vaded-text-muted'>
                        {t('landing.footer.copyright')}
                    </p>
                    <p className='text-xs text-vaded-text-muted'>
                        {t('landing.footer.supportCopy')}
                    </p>
                </div>
            </div>
        </footer>
    )
}

function FooterColumn({
    heading,
    links,
}: {
    heading: string
    links: Array<{ href: string; label: string; external?: boolean }>
}) {
    return (
        <div>
            <h4 className='mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-vaded-text-muted'>
                {heading}
            </h4>
            <ul className='space-y-2.5'>
                {links.map(({ href, label, external }) => (
                    <li key={href}>
                        <a
                            href={href}
                            {...(external
                                ? { target: '_blank', rel: 'noreferrer' }
                                : {})}
                            className='inline-flex items-center gap-1 text-sm text-vaded-text-muted hover:text-vaded-brand transition-colors'
                        >
                            {label}
                            {external ? (
                                <ArrowUpRight size={11} aria-hidden />
                            ) : null}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    )
}
