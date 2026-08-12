import { useState, useEffect, type ReactElement } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Ban,
    Clock,
    MessageSquare,
    Music,
    Music2,
    Pause,
    Play,
    ScrollText,
    Shield,
    ShieldAlert,
    SkipForward,
    Star,
    TrendingUp,
    Users,
    Wifi,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import EmptyState from '@/components/ui/EmptyState'
import StatTile from '@/components/ui/StatTile'
import { useGuildStore } from '@/stores/guildStore'
import { hasModuleAccess } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import {
    useModerationCases,
    useModerationStats,
} from '@/hooks/useModerationQueries'
import { useRecentTracks } from '@/hooks/useTrackHistoryQueries'
import { useMusicPlayer } from '@/hooks/useMusicPlayer'
import { useLevelLeaderboard } from '@/hooks/useLevelQueries'
import { useStarboardTop } from '@/hooks/useStarboardQueries'
import type { ModerationCase, ModuleKey } from '@/types'

const ACTION_COLORS: Record<string, string> = {
    warn: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30 shadow-[0_0_8px_rgba(234,179,8,0.35)]',
    mute: 'bg-orange-500/15 text-orange-400 border-orange-500/30 shadow-[0_0_8px_rgba(249,115,22,0.35)]',
    kick: 'bg-red-500/15 text-red-400 border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.35)]',
    ban: 'bg-red-600/15 text-red-300 border-red-600/30 shadow-[0_0_8px_rgba(220,38,38,0.4)]',
    unban: 'bg-green-500/15 text-green-400 border-green-500/30 shadow-[0_0_8px_rgba(34,197,94,0.35)]',
    unmute: 'bg-blue-500/15 text-blue-400 border-blue-500/30 shadow-[0_0_8px_rgba(59,130,246,0.35)]',
}

const ACTION_ICONS: Record<
    string,
    React.ComponentType<{ className?: string }>
> = {
    warn: AlertTriangle,
    mute: Clock,
    kick: ShieldAlert,
    ban: Ban,
    unban: Shield,
    unmute: Shield,
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)

    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`

    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`

    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`

    return new Date(dateStr).toLocaleDateString()
}

type CompactStatTone = 'brand' | 'accent' | 'success' | 'warning' | 'neutral'

const compactToneClass: Record<CompactStatTone, string> = {
    brand: 'bg-vaded-brand/15 text-vaded-brand',
    accent: 'bg-vaded-brand/15 text-vaded-brand',
    success: 'bg-vaded-success/15 text-vaded-success',
    warning: 'bg-vaded-warning/15 text-vaded-warning',
    neutral: 'bg-vaded-bg-active text-vaded-text-tertiary',
}

function CompactStat({
    label,
    value,
    icon,
    tone = 'neutral',
    delta,
}: {
    label: string
    value: string | number
    icon?: ReactElement
    tone?: CompactStatTone
    delta?: number
}) {
    return (
        <div className='flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-vaded-bg-active/25'>
            <div className='flex items-center gap-2.5 min-w-0'>
                {icon && (
                    <span
                        className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-xs',
                            compactToneClass[tone],
                        )}
                        aria-hidden='true'
                    >
                        {icon}
                    </span>
                )}
                <p className='type-meta truncate text-vaded-text-tertiary uppercase tracking-wide'>
                    {label}
                </p>
            </div>
            <div className='flex items-center gap-2'>
                {delta !== undefined && (
                    <span
                        className={cn(
                            'rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
                            delta >= 0
                                ? 'bg-vaded-success/20 text-vaded-success'
                                : 'bg-vaded-error/20 text-vaded-error',
                        )}
                    >
                        {delta >= 0 ? '+' : ''}
                        {delta}%
                    </span>
                )}
                <p className='font-[var(--font-vaded-display)] text-lg font-semibold text-vaded-text-primary tabular-nums'>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </p>
            </div>
        </div>
    )
}

function CaseRow({ case: c, index }: { case: ModerationCase; index: number }) {
    const ActionIcon = ACTION_ICONS[c.type] || Shield
    const prefersReducedMotion = useReducedMotion()

    return (
        <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
                duration: 0.2,
                delay: prefersReducedMotion ? 0 : index * 0.05,
            }}
            className='grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-vaded-bg-tertiary/50'
        >
            <p className='text-xs font-mono text-vaded-text-tertiary'>
                #{c.caseNumber}
            </p>
            <div className='min-w-0'>
                <p className='type-body-sm truncate text-vaded-text-primary'>
                    {c.userName || c.userId}
                </p>
                <p className='type-body-sm truncate text-vaded-text-tertiary'>
                    {c.reason || 'No reason provided'}
                </p>
            </div>
            <div className='flex items-center gap-2'>
                <Badge
                    variant='outline'
                    className={cn(
                        'border text-[10px] font-semibold uppercase',
                        ACTION_COLORS[c.type],
                    )}
                >
                    <ActionIcon className='mr-1 h-3 w-3' />
                    {c.type}
                </Badge>
                <span className='hidden text-xs text-vaded-text-tertiary sm:block'>
                    {timeAgo(c.createdAt)}
                </span>
            </div>
        </motion.div>
    )
}

function fmt(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}

function NowPlayingWidget({ guildId }: { guildId: string }) {
    const { state, pause, resume, skip, pendingAction, isConnected } =
        useMusicPlayer(guildId)
    const [localMs, setLocalMs] = useState(state.position)

    useEffect(() => {
        setLocalMs(state.position)
    }, [state.position])

    useEffect(() => {
        if (!state.isPlaying || state.isPaused) return
        const id = setInterval(() => setLocalMs((p) => p + 1000), 1000)
        return () => clearInterval(id)
    }, [state.isPlaying, state.isPaused])

    const track = state.currentTrack
    if (!track) return null

    const durationMs = track.duration || 0
    const posMs = Math.min(localMs, durationMs || Infinity)
    const progress = durationMs > 0 ? (posMs / durationMs) * 100 : 0
    const isPaused = state.isPaused || !state.isPlaying

    return (
        <motion.section
            aria-label='Now Playing'
            className='surface-panel relative overflow-hidden border border-vaded-brand/20'
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
        >
            {/* blurred backdrop */}
            {track.thumbnail && (
                <div
                    className='pointer-events-none absolute inset-0'
                    aria-hidden='true'
                    style={{
                        backgroundImage: `url(${track.thumbnail})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(40px) brightness(0.12) saturate(1.5)',
                        transform: 'scale(1.1)',
                    }}
                />
            )}

            <div className='relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5'>
                {/* thumbnail */}
                {track.thumbnail ? (
                    <img
                        src={track.thumbnail}
                        alt=''
                        className='h-14 w-14 shrink-0 rounded-lg object-cover shadow-lg'
                        style={
                            state.isPlaying && !state.isPaused
                                ? { animation: '8s linear infinite vinyl-spin' }
                                : undefined
                        }
                    />
                ) : (
                    <div className='flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-vaded-bg-active'>
                        <Music2 className='h-6 w-6 text-vaded-text-tertiary' />
                    </div>
                )}

                {/* track info + progress */}
                <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2 mb-0.5'>
                        <span
                            className='h-1.5 w-1.5 rounded-full bg-vaded-brand shrink-0'
                            aria-hidden='true'
                            style={
                                state.isPlaying && !state.isPaused
                                    ? {
                                          animation:
                                              '1.4s ease-in-out infinite live-pulse',
                                      }
                                    : undefined
                            }
                        />
                        <span className='type-meta font-bold tracking-widest uppercase text-vaded-brand text-[10px]'>
                            Now Playing
                        </span>
                        {state.voiceChannelName && (
                            <span className='type-meta text-vaded-text-tertiary truncate'>
                                · {state.voiceChannelName}
                            </span>
                        )}
                        {isConnected && (
                            <Wifi
                                className='ml-auto h-3 w-3 shrink-0 text-vaded-success'
                                aria-hidden='true'
                            />
                        )}
                    </div>
                    <p className='type-body font-semibold text-vaded-text-primary truncate leading-tight'>
                        {track.title}
                    </p>
                    <p className='type-meta text-vaded-text-secondary truncate mb-2'>
                        {track.author}
                    </p>

                    {durationMs > 0 && (
                        <div>
                            <div className='relative h-1 bg-vaded-bg-active rounded-full overflow-hidden'>
                                <div
                                    className='h-full rounded-full bg-vaded-brand transition-[width] duration-1000'
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className='flex justify-between type-meta text-vaded-text-tertiary mt-1 tabular-nums'>
                                <span>{fmt(posMs / 1000)}</span>
                                <span>{fmt(durationMs / 1000)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* controls */}
                <div className='flex items-center gap-2 shrink-0'>
                    <button
                        onClick={() => (isPaused ? resume() : pause())}
                        disabled={!!pendingAction}
                        aria-label={isPaused ? 'Resume' : 'Pause'}
                        className='h-10 w-10 rounded-xl btn-glass text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-40'
                    >
                        {isPaused ? (
                            <Play className='h-4 w-4' />
                        ) : (
                            <Pause className='h-4 w-4' />
                        )}
                    </button>
                    <button
                        onClick={() => skip()}
                        disabled={!!pendingAction}
                        aria-label='Skip'
                        className='h-9 w-9 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-vaded-text-secondary hover:text-white transition-all disabled:opacity-40'
                    >
                        <SkipForward className='h-4 w-4' />
                    </button>
                    <Link
                        to='/music'
                        className='h-9 px-3 rounded-full flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-vaded-text-secondary hover:text-white transition-all type-meta font-medium'
                    >
                        <ArrowRight className='h-3.5 w-3.5' />
                        <span className='hidden sm:inline'>Full player</span>
                    </Link>
                </div>
            </div>
        </motion.section>
    )
}

export default function DashboardOverview() {
    const { t } = useTranslation()
    const prefersReducedMotion = useReducedMotion()
    const { selectedGuild, memberContext } = useGuildStore()
    const { data: stats, isLoading: statsLoading } = useModerationStats(
        selectedGuild?.id,
    )
    const { data: casesData, isLoading: casesLoading } = useModerationCases(
        selectedGuild?.id,
        { limit: 8 },
    )
    const { data: recentTracksData, isLoading: tracksLoading } =
        useRecentTracks(selectedGuild?.id, 5)
    const { data: leaderboardData, isLoading: leaderboardLoading } =
        useLevelLeaderboard(selectedGuild?.id, 5)
    const { data: starboardData, isLoading: starboardLoading } =
        useStarboardTop(selectedGuild?.id, 3)

    const recentCases = casesData?.cases ?? []
    const loading = statsLoading || casesLoading
    const effectiveAccess =
        memberContext?.effectiveAccess ?? selectedGuild?.effectiveAccess
    const quickActions: Array<{
        title: string
        description: string
        icon: ReactElement
        href: string
        module: ModuleKey
    }> = [
        {
            title: t('dashboardOverview.moderationCases'),
            description: t('dashboardOverview.reviewWarningsMutesKicksBans'),
            icon: <Shield className='h-4 w-4' />,
            href: '/moderation',
            module: 'moderation',
        },
        {
            title: t('dashboardOverview.autoModeration'),
            description: t('dashboardOverview.tuneFiltersAntiSpamAutomation'),
            icon: <ShieldAlert className='h-4 w-4' />,
            href: '/automod',
            module: 'moderation',
        },
        {
            title: t('dashboardOverview.serverLogs'),
            description: t(
                'dashboardOverview.auditEventsAndModerationActivity',
            ),
            icon: <ScrollText className='h-4 w-4' />,
            href: '/logs',
            module: 'moderation',
        },
        {
            title: t('dashboardOverview.customCommands'),
            description: t('dashboardOverview.manageScriptedServerShortcuts'),
            icon: <MessageSquare className='h-4 w-4' />,
            href: '/commands',
            module: 'automation',
        },
        {
            title: t('dashboardOverview.musicPlayer'),
            description: t('dashboardOverview.viewQueuePlaybackTrackHistory'),
            icon: <Music className='h-4 w-4' />,
            href: '/music',
            module: 'music',
        },
        {
            title: t('dashboardOverview.levelsAndXP'),
            description: t(
                'dashboardOverview.configureXPLevelRewardsLeaderboards',
            ),
            icon: <TrendingUp className='h-4 w-4' />,
            href: '/levels',
            module: 'settings',
        },
        {
            title: t('dashboardOverview.starboard'),
            description: t('dashboardOverview.manageCommunityHighlights'),
            icon: <Star className='h-4 w-4' />,
            href: '/starboard',
            module: 'settings',
        },
    ]
    const visibleQuickActions = quickActions.filter((action) => {
        if (!selectedGuild || !effectiveAccess) {
            return true
        }
        return hasModuleAccess(effectiveAccess, action.module, 'view')
    })

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Activity className='h-10 w-10' />}
                title={t('dashboardOverview.selectAServer')}
                description={t('dashboardOverview.chooseServerFromSidebar')}
            />
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                title={t('dashboardOverview.dashboardTitle')}
                description={t('dashboardOverview.overviewOf', {
                    name: selectedGuild.name,
                })}
                eyebrow={t('dashboardOverview.serverAnalytics')}
            />

            {hasModuleAccess(effectiveAccess, 'music', 'view') && (
                <NowPlayingWidget guildId={selectedGuild.id} />
            )}

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]'>
                {loading ? (
                    <>
                        <div className='surface-panel flex flex-col justify-between gap-6 p-6'>
                            <Skeleton className='h-4 w-28' />
                            <Skeleton className='h-12 w-32' />
                            <Skeleton className='h-4 w-44' />
                        </div>
                        <div className='surface-panel divide-y divide-vaded-border/40'>
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div
                                    key={i}
                                    className='flex items-center justify-between px-4 py-3'
                                >
                                    <Skeleton className='h-3 w-24' />
                                    <Skeleton className='h-5 w-12' />
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <article
                            className='surface-panel group flex flex-col justify-between gap-6 overflow-hidden border border-vaded-border p-6 transition-all duration-200 motion-safe:hover:-translate-y-1 hover:border-vaded-brand/30 hover:shadow-card-hover'
                            style={{
                                backgroundImage:
                                    'radial-gradient(circle at 92% 4%, rgb(220 38 38 / 0.1), transparent 42%)',
                            }}
                        >
                            <div className='flex items-center justify-between gap-3'>
                                <p className='type-meta text-vaded-text-tertiary uppercase tracking-wide font-semibold'>
                                    {t('dashboardOverview.totalMembers')}
                                </p>
                                <span className='flex h-8 w-8 items-center justify-center rounded-md bg-vaded-brand/15 text-vaded-brand transition-shadow duration-200 group-hover:shadow-glow-red-sm'>
                                    <Users
                                        className='h-4 w-4'
                                        aria-hidden='true'
                                    />
                                </span>
                            </div>
                            <div>
                                <p className='font-[var(--font-vaded-hero)] text-5xl font-bold leading-none tracking-tight text-vaded-text-strong tabular-nums'>
                                    {typeof selectedGuild.memberCount ===
                                    'number'
                                        ? selectedGuild.memberCount.toLocaleString()
                                        : '0'}
                                </p>
                            </div>
                            <p className='type-body-sm text-vaded-text-tertiary'>
                                {t('dashboardOverview.activeMembersAcross', {
                                    name: selectedGuild.name,
                                })}
                            </p>
                        </article>
                        <div className='surface-panel divide-y divide-vaded-border/40 border border-vaded-border'>
                            <CompactStat
                                label={t('dashboardOverview.activeCases')}
                                value={stats?.activeCases || 0}
                                icon={<Shield className='h-3.5 w-3.5' />}
                                tone='accent'
                            />
                            <CompactStat
                                label={t('dashboardOverview.totalCases')}
                                value={stats?.totalCases || 0}
                                icon={<MessageSquare className='h-3.5 w-3.5' />}
                                tone='neutral'
                            />
                            <CompactStat
                                label={t('dashboardOverview.autoModActions')}
                                value={stats?.casesByType?.warn || 0}
                                icon={<ShieldAlert className='h-3.5 w-3.5' />}
                                tone='warning'
                            />
                        </div>
                    </>
                )}
            </div>

            <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
                <motion.section
                    className='surface-panel overflow-hidden border border-vaded-border lg:col-span-2'
                    initial={
                        prefersReducedMotion ? false : { opacity: 0, y: 12 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.3,
                        delay: prefersReducedMotion ? 0 : 0.2,
                    }}
                >
                    <div className='flex items-center justify-between border-b border-vaded-border px-4 py-3'>
                        <div>
                            <h2 className='type-title text-vaded-text-primary uppercase tracking-wide'>
                                {t('dashboardOverview.recentCases')}
                            </h2>
                            <p className='type-body-sm text-vaded-text-tertiary'>
                                {t('dashboardOverview.latestModerationActions')}
                            </p>
                        </div>
                        <Link
                            to='/moderation'
                            className='type-body-sm inline-flex items-center gap-1 text-vaded-brand transition-colors hover:text-vaded-brand-strong'
                        >
                            {t('dashboardOverview.viewAll')}
                            <ArrowRight className='h-3.5 w-3.5' />
                        </Link>
                    </div>

                    <div className='divide-y divide-vaded-border/50'>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, index) => (
                                <div
                                    key={index}
                                    className='grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-3'
                                >
                                    <Skeleton className='h-4 w-8' />
                                    <div className='space-y-1.5'>
                                        <Skeleton className='h-4 w-28' />
                                        <Skeleton className='h-3 w-44' />
                                    </div>
                                    <Skeleton className='h-5 w-16 rounded-full' />
                                </div>
                            ))
                        ) : recentCases.length > 0 ? (
                            recentCases.map((item, index) => (
                                <CaseRow
                                    key={item.id}
                                    case={item}
                                    index={index}
                                />
                            ))
                        ) : (
                            <div className='px-4 py-10 text-center'>
                                <Shield className='mx-auto mb-3 h-10 w-10 text-vaded-text-tertiary' />
                                <p className='type-body text-vaded-text-secondary'>
                                    {t('dashboardOverview.noModerationCases')}
                                </p>
                                <p className='type-body-sm text-vaded-text-tertiary'>
                                    {t(
                                        'dashboardOverview.casesCasesWillAppear',
                                    )}
                                </p>
                            </div>
                        )}
                    </div>
                </motion.section>

                <motion.section
                    className='space-y-3'
                    initial={
                        prefersReducedMotion ? false : { opacity: 0, y: 12 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.3,
                        delay: prefersReducedMotion ? 0 : 0.3,
                    }}
                    aria-labelledby='quick-actions-heading'
                >
                    <h2
                        id='quick-actions-heading'
                        className='type-title text-vaded-text-primary'
                    >
                        {t('dashboardOverview.quickActions')}
                    </h2>
                    <nav className='surface-panel divide-y divide-vaded-border/40 overflow-hidden border border-vaded-border'>
                        {visibleQuickActions.map((action) => (
                            <Link
                                key={action.href}
                                to={action.href}
                                className='group flex items-center gap-3 border-l-2 border-l-transparent px-4 py-2.5 transition-all hover:border-l-vaded-brand hover:bg-vaded-bg-active/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vaded-brand/60'
                            >
                                <span
                                    className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-vaded-bg-tertiary text-vaded-text-secondary transition-colors group-hover:bg-vaded-brand/15 group-hover:text-vaded-brand'
                                    aria-hidden='true'
                                >
                                    {action.icon}
                                </span>
                                <div className='min-w-0 flex-1'>
                                    <p className='type-body-sm font-medium text-vaded-text-primary'>
                                        {action.title}
                                    </p>
                                    <p className='truncate text-xs text-vaded-text-tertiary'>
                                        {action.description}
                                    </p>
                                </div>
                                <ArrowRight
                                    className='h-3.5 w-3.5 shrink-0 text-vaded-text-tertiary opacity-0 transition-all group-hover:opacity-100 group-hover:text-vaded-brand group-hover:translate-x-1'
                                    aria-hidden='true'
                                />
                            </Link>
                        ))}
                    </nav>
                </motion.section>
            </div>

            {hasModuleAccess(effectiveAccess, 'music', 'view') && (
                <motion.section
                    className='surface-panel overflow-hidden border border-vaded-border'
                    initial={
                        prefersReducedMotion ? false : { opacity: 0, y: 12 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.3,
                        delay: prefersReducedMotion ? 0 : 0.4,
                    }}
                >
                    <div className='flex items-center justify-between border-b border-vaded-border px-4 py-3'>
                        <div>
                            <h2 className='type-title text-vaded-text-primary'>
                                {t('dashboardOverview.recentMusic')}
                            </h2>
                            <p className='type-body-sm text-vaded-text-tertiary'>
                                {t('dashboardOverview.latestTracksPlayed')}
                            </p>
                        </div>
                        <Link
                            to='/music/history'
                            className='type-body-sm inline-flex items-center gap-1 text-vaded-brand transition-colors hover:text-vaded-brand-strong'
                        >
                            {t('dashboardOverview.viewAll')}
                            <ArrowRight className='h-3.5 w-3.5' />
                        </Link>
                    </div>

                    <div className='divide-y divide-vaded-border/50'>
                        {tracksLoading ? (
                            Array.from({ length: 4 }).map((_, index) => (
                                <div
                                    key={index}
                                    className='grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2'
                                >
                                    <Skeleton className='h-4 w-32' />
                                    <Skeleton className='h-4 w-24' />
                                </div>
                            ))
                        ) : recentTracksData && recentTracksData.length > 0 ? (
                            recentTracksData.map((track, index) => (
                                <motion.div
                                    key={`${track.trackId}-${index}`}
                                    initial={
                                        prefersReducedMotion
                                            ? false
                                            : { opacity: 0, x: -8 }
                                    }
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{
                                        duration: 0.2,
                                        delay: prefersReducedMotion
                                            ? 0
                                            : index * 0.05,
                                    }}
                                    className='grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-vaded-bg-tertiary/50 sm:grid-cols-3'
                                >
                                    <div className='min-w-0'>
                                        <p className='type-body-sm truncate text-vaded-text-primary'>
                                            {track.title}
                                        </p>
                                        <p className='type-body-sm truncate text-vaded-text-tertiary'>
                                            {track.author}
                                        </p>
                                    </div>
                                    <p className='type-body-sm text-vaded-text-secondary'>
                                        {track.playedBy || 'Unknown'}
                                    </p>
                                    <p className='text-xs text-vaded-text-tertiary text-right'>
                                        {timeAgo(
                                            new Date(
                                                track.timestamp,
                                            ).toISOString(),
                                        )}
                                    </p>
                                </motion.div>
                            ))
                        ) : (
                            <div className='px-4 py-10 text-center'>
                                <Music className='mx-auto mb-3 h-10 w-10 text-vaded-text-tertiary' />
                                <p className='type-body text-vaded-text-secondary'>
                                    {t('dashboardOverview.noTracksPlayedYet')}
                                </p>
                                <p className='type-body-sm text-vaded-text-tertiary'>
                                    {t(
                                        'dashboardOverview.trackHistoryWillAppearWhenMusicPlayed',
                                    )}
                                </p>
                            </div>
                        )}
                    </div>
                </motion.section>
            )}

            {hasModuleAccess(effectiveAccess, 'settings', 'view') && (
                <motion.section
                    className='space-y-4'
                    initial={
                        prefersReducedMotion ? false : { opacity: 0, y: 12 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.3,
                        delay: prefersReducedMotion ? 0 : 0.5,
                    }}
                >
                    <h2 className='type-title text-vaded-text-primary'>
                        {t('dashboardOverview.community')}
                    </h2>
                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                        <div className='surface-panel overflow-hidden border border-vaded-border'>
                            <div className='border-b border-vaded-border px-4 py-3'>
                                <h3 className='type-body-sm font-semibold text-vaded-text-primary uppercase tracking-wide'>
                                    {t('dashboardOverview.levelLeaderboard')}
                                </h3>
                                <p className='type-body-sm text-vaded-text-tertiary'>
                                    {t('dashboardOverview.topMembersByXP')}
                                </p>
                            </div>

                            <div className='divide-y divide-vaded-border/50'>
                                {leaderboardLoading ? (
                                    Array.from({ length: 4 }).map(
                                        (_, index) => (
                                            <div
                                                key={index}
                                                className='grid grid-cols-3 gap-2 px-4 py-3'
                                            >
                                                <Skeleton className='h-4 w-24' />
                                                <Skeleton className='h-4 w-16' />
                                                <Skeleton className='h-4 w-12 justify-self-end' />
                                            </div>
                                        ),
                                    )
                                ) : leaderboardData &&
                                  leaderboardData.length > 0 ? (
                                    leaderboardData.map((member, index) => (
                                        <motion.div
                                            key={member.userId}
                                            initial={
                                                prefersReducedMotion
                                                    ? false
                                                    : { opacity: 0, x: -8 }
                                            }
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                                duration: 0.2,
                                                delay: prefersReducedMotion
                                                    ? 0
                                                    : index * 0.05,
                                            }}
                                            className='grid grid-cols-3 items-center gap-2 px-4 py-3 transition-colors hover:bg-vaded-bg-tertiary/50'
                                        >
                                            <p className='type-body-sm text-vaded-text-primary'>
                                                Lv{member.level}
                                            </p>
                                            <p className='type-body-sm truncate text-vaded-text-secondary'>
                                                {member.userId}
                                            </p>
                                            <p className='text-xs text-vaded-text-tertiary text-right'>
                                                {member.xp.toLocaleString()}
                                                XP
                                            </p>
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className='px-4 py-8 text-center'>
                                        <TrendingUp className='mx-auto mb-2 h-8 w-8 text-vaded-text-tertiary' />
                                        <p className='type-body-sm text-vaded-text-secondary'>
                                            {t(
                                                'dashboardOverview.noLeaderboardData',
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='surface-panel overflow-hidden border border-vaded-border'>
                            <div className='border-b border-vaded-border px-4 py-3'>
                                <h3 className='type-body-sm font-semibold text-vaded-text-primary uppercase tracking-wide'>
                                    {t('dashboardOverview.starboardHighlights')}
                                </h3>
                                <p className='type-body-sm text-vaded-text-tertiary'>
                                    {t('dashboardOverview.topStarredMessages')}
                                </p>
                            </div>

                            <div className='divide-y divide-vaded-border/50'>
                                {starboardLoading ? (
                                    Array.from({ length: 3 }).map(
                                        (_, index) => (
                                            <div
                                                key={index}
                                                className='grid grid-cols-2 gap-2 px-4 py-3'
                                            >
                                                <Skeleton className='h-4 w-20' />
                                                <Skeleton className='h-4 w-12 justify-self-end' />
                                            </div>
                                        ),
                                    )
                                ) : starboardData &&
                                  starboardData.length > 0 ? (
                                    starboardData.map((entry, index) => (
                                        <motion.div
                                            key={entry.id}
                                            initial={
                                                prefersReducedMotion
                                                    ? false
                                                    : { opacity: 0, x: -8 }
                                            }
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                                duration: 0.2,
                                                delay: prefersReducedMotion
                                                    ? 0
                                                    : index * 0.05,
                                            }}
                                            className='grid grid-cols-2 items-center gap-2 px-4 py-3 transition-colors hover:bg-vaded-bg-tertiary/50'
                                        >
                                            <p className='type-body-sm truncate text-vaded-text-primary'>
                                                {entry.content
                                                    ? entry.content.substring(
                                                          0,
                                                          30,
                                                      ) + '...'
                                                    : 'Message'}
                                            </p>
                                            <div className='flex items-center justify-end gap-1 text-xs text-vaded-text-tertiary'>
                                                <Star className='h-3 w-3' />
                                                {entry.starCount}
                                            </div>
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className='px-4 py-8 text-center'>
                                        <Star className='mx-auto mb-2 h-8 w-8 text-vaded-text-tertiary' />
                                        <p className='type-body-sm text-vaded-text-secondary'>
                                            {t(
                                                'dashboardOverview.noStarredMessages',
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.section>
            )}

            {Object.keys(stats?.casesByType ?? {}).length > 0 && (
                <section className='space-y-4'>
                    <h2 className='type-title text-vaded-text-primary'>
                        {t('dashboardOverview.casesByType')}
                    </h2>
                    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
                        {Object.entries(stats?.casesByType ?? {}).map(
                            ([type, value]) => (
                                <StatTile
                                    key={type}
                                    label={
                                        type.charAt(0).toUpperCase() +
                                        type.slice(1)
                                    }
                                    value={value as number}
                                    tone='neutral'
                                />
                            ),
                        )}
                    </div>
                </section>
            )}
        </div>
    )
}
