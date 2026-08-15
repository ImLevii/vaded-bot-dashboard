import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Music2,
    Wifi,
    WifiOff,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Shuffle,
    Repeat,
    Repeat1,
    Volume2,
    Loader2,
} from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { useMusicPlayer } from '@/hooks/useMusicPlayer'
import SearchBar from '@/components/Music/SearchBar'
import ImportPlaylist from '@/components/Music/ImportPlaylist'
import QueueList from '@/components/Music/QueueList'
// import AutoplayGenres from '@/components/Music/AutoplayGenres'
import ListenersWidget from '@/components/Music/ListenersWidget'
import TrackSourceIcon from '@/components/Music/TrackSourceIcon'
import EmptyState from '@/components/ui/EmptyState'
import type { QueueState } from '@/types'
import type { MusicActionKey } from '@/hooks/useMusicPlayer'

export default function MusicPage() {
    const { t } = useTranslation()
    const { selectedGuild } = useGuildSelection()
    const guildId = selectedGuild?.id
    const player = useMusicPlayer(guildId)
    const controlsEnabled = player.isConnected && !player.isLoading

    const handlePlayPause = useCallback(() => {
        if (!player.isConnected || player.isLoading) return
        if (player.state.isPlaying) player.pause()
        else player.resume()
    }, [player])

    const handleRepeatCycle = useCallback(() => {
        if (!player.isConnected || player.isLoading) return
        const modes: Array<'off' | 'track' | 'queue' | 'autoplay'> = [
            'off',
            'track',
            'queue',
            'autoplay',
        ]
        const idx = modes.indexOf(player.state.repeatMode)
        player.setRepeatMode(modes[(idx + 1) % modes.length])
    }, [player])

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if ((e.target as HTMLElement).tagName === 'INPUT') return
            if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                handlePlayPause()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [handlePlayPause])

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Music2 className='h-10 w-10' aria-hidden='true' />}
                title={t('music.noServerSelected')}
                description={t('music.selectServerToControlMusic')}
            />
        )
    }

    return (
        <div className='space-y-8 px-1 sm:px-0 pb-8'>
            <header className='flex items-center justify-between gap-3 flex-wrap'>
                <div className='flex items-center gap-3 min-w-0'>
                    <Music2
                        className='h-6 w-6 sm:h-7 sm:w-7 text-vaded-brand shrink-0'
                        aria-hidden='true'
                    />
                    <div className='min-w-0'>
                        <h1 className='type-h1 text-vaded-text-primary truncate'>
                            {t('music.musicPlayer')}
                        </h1>
                        <p className='type-body-sm text-vaded-text-secondary truncate'>
                            {player.state.voiceChannelName
                                ? t('music.connectedToVoiceChannel', {
                                      channel: player.state.voiceChannelName,
                                  })
                                : t('music.notConnectedToVoiceChannel')}
                        </p>
                    </div>
                </div>
                <div className='flex items-center gap-2 flex-wrap justify-end'>
                    <ListenersWidget
                        listeners={player.state.listeners}
                        voiceChannelName={player.state.voiceChannelName}
                    />
                    <ConnectionBadge connected={player.isConnected} />
                </div>
            </header>

            <NowPlayingHero
                state={player.state}
                lastStateUpdate={player.lastStateUpdate}
                controlsEnabled={controlsEnabled}
                pendingAction={player.pendingAction}
                onPlayPause={handlePlayPause}
                onPrevious={() => {
                    if (controlsEnabled) player.previous()
                }}
                onSkip={() => {
                    if (controlsEnabled) player.skip()
                }}
                onShuffle={() => {
                    if (controlsEnabled) player.shuffle()
                }}
                onRepeatCycle={handleRepeatCycle}
                onVolumeChange={(v) => {
                    if (controlsEnabled) player.setVolume(v)
                }}
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6'>
                <SearchBar
                    disabled={!controlsEnabled}
                    onPlay={async (q) => {
                        if (!controlsEnabled) {
                            throw new Error(t('music.playerNotConnected'))
                        }
                        await player.play(q)
                    }}
                />
                <ImportPlaylist
                    disabled={!controlsEnabled}
                    onImport={async (url) => {
                        if (!controlsEnabled) {
                            throw new Error(t('music.playerNotConnected'))
                        }
                        await player.importPlaylist(
                            url,
                            player.state.voiceChannelId ?? undefined,
                        )
                    }}
                />
            </div>

            {/* <AutoplayGenres guildId={guildId} /> */}

            <QueueList
                tracks={player.state.tracks}
                disabled={!controlsEnabled}
                onRemove={(i) => {
                    if (!controlsEnabled) return
                    player.removeTrack(i)
                }}
                onMove={(from, to) => {
                    if (!controlsEnabled) return
                    player.moveTrack(from, to)
                }}
                onClear={() => {
                    if (!controlsEnabled) return
                    player.clearQueue()
                }}
            />

            {player.error && (
                <div
                    className='type-body-sm text-vaded-error bg-vaded-error/10 border border-vaded-error/20 rounded-lg p-3 flex items-start justify-between gap-3'
                    role='alert'
                >
                    <span>{player.error}</span>
                    <button
                        type='button'
                        onClick={() => player.clearError()}
                        className='shrink-0 type-meta text-vaded-error/80 hover:text-vaded-error underline'
                    >
                        {t('music.dismissError')}
                    </button>
                </div>
            )}
        </div>
    )
}

/**
 * Progress is stale when no SSE/REST state or heartbeat arrives this long.
 * Server heartbeat is 30s (stateRoutes stream); 1.5x that misses one ping.
 */
const STALE_AFTER_MS = 45_000

function NowPlayingHero({
    state,
    lastStateUpdate,
    controlsEnabled,
    pendingAction,
    onPlayPause,
    onPrevious,
    onSkip,
    onShuffle,
    onRepeatCycle,
    onVolumeChange,
}: {
    state: QueueState
    lastStateUpdate: number | null
    controlsEnabled: boolean
    pendingAction: MusicActionKey | null
    onPlayPause: () => void
    onPrevious: () => void
    onSkip: () => void
    onShuffle: () => void
    onRepeatCycle: () => void
    onVolumeChange: (v: number) => void
}) {
    const { t } = useTranslation()
    // Prefer the live currentTrack from SSE; fall back to the head of the
    // upcoming queue for older state payloads that only filled tracks[].
    const currentTrack = state.currentTrack ?? state.tracks[0]
    const busy = Boolean(pendingAction)
    const [now, setNow] = useState(() => Date.now())

    // Local position advances every second while playing so the bar doesn't
    // freeze between SSE events (which arrive every ~5s).
    const [localPositionMs, setLocalPositionMs] = useState(state.position)
    useEffect(() => {
        setLocalPositionMs(state.position)
    }, [state.position])

    useEffect(() => {
        if (!state.isPlaying) return
        const id = window.setInterval(() => {
            setNow(Date.now())
            setLocalPositionMs((prev) => prev + 1000)
        }, 1000)
        return () => window.clearInterval(id)
    }, [state.isPlaying])

    const isStale =
        state.isPlaying &&
        lastStateUpdate !== null &&
        now - lastStateUpdate > STALE_AFTER_MS

    if (!currentTrack) {
        return (
            <div className='surface-card rounded-2xl border border-vaded-border overflow-hidden'>
                <div className='flex items-center justify-center min-h-[300px] sm:min-h-[340px]'>
                    <div className='text-center'>
                        <div className='w-20 h-20 rounded-full bg-vaded-bg-active border border-vaded-border flex items-center justify-center mx-auto mb-4'>
                            <Music2
                                className='h-9 w-9 text-vaded-text-tertiary'
                                aria-hidden='true'
                            />
                        </div>
                        <p className='type-body font-semibold text-vaded-text-secondary'>
                            {t('music.nothingPlaying')}
                        </p>
                        <p className='type-body-sm text-vaded-text-tertiary mt-1'>
                            {t('music.searchOrImportToGetStarted')}
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    // Both values arrive in milliseconds from discord-player; divide by 1000 for display.
    const durationMs = currentTrack.duration || 0
    const positionMs = Math.min(localPositionMs, durationMs || Infinity)
    const progress = durationMs > 0 ? (positionMs / durationMs) * 100 : 0

    return (
        <div className='relative surface-sheen rounded-2xl border border-vaded-border overflow-hidden'>
            {/* Blurred album art backdrop */}
            {currentTrack.thumbnail && (
                <div
                    className='absolute inset-0 bg-cover bg-center scale-110'
                    style={{
                        backgroundImage: `url(${currentTrack.thumbnail})`,
                        filter: 'blur(32px) brightness(0.18) saturate(1.4)',
                    }}
                    aria-hidden='true'
                />
            )}
            <div
                className='absolute inset-0 bg-vaded-bg-primary/80'
                aria-hidden='true'
            />

            <div className='relative z-10 p-5 sm:p-8'>
                {/* Main layout: art left, info right */}
                <div className='flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start'>
                    {/* Album art — spins when playing */}
                    <div className='shrink-0 relative'>
                        <div
                            className='w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden border-4 border-vaded-border shadow-[0_0_40px_rgb(220_38_38_/_0.25)]'
                            style={{
                                animation:
                                    state.isPlaying && !isStale
                                        ? 'vinyl-spin 8s linear infinite'
                                        : 'none',
                            }}
                        >
                            {currentTrack.thumbnail ? (
                                <img
                                    src={currentTrack.thumbnail}
                                    alt={currentTrack.title}
                                    className='w-full h-full object-cover'
                                    draggable={false}
                                />
                            ) : (
                                <div className='w-full h-full bg-vaded-bg-active flex items-center justify-center'>
                                    <Music2 className='h-10 w-10 text-vaded-text-tertiary' />
                                </div>
                            )}
                        </div>
                        {/* Centre spindle dot */}
                        <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
                            <div className='w-4 h-4 rounded-full bg-vaded-bg-primary border-2 border-vaded-border' />
                        </div>
                    </div>

                    {/* Track info + controls */}
                    <div className='flex-1 min-w-0 w-full text-center sm:text-left'>
                        {/* NOW PLAYING label with live dot */}
                        <div className='flex items-center gap-2 justify-center sm:justify-start mb-2'>
                            {state.isPlaying && !isStale && (
                                <span
                                    className='w-2 h-2 rounded-full bg-vaded-brand block shrink-0'
                                    style={{
                                        animation:
                                            'live-pulse 1.4s ease-in-out infinite',
                                    }}
                                    aria-hidden='true'
                                />
                            )}
                            <span className='type-meta text-vaded-brand font-bold tracking-widest uppercase'>
                                {t('music.nowPlaying')}
                            </span>
                        </div>

                        {/* Title — marquee on overflow */}
                        <div className='overflow-hidden mb-1'>
                            <h2
                                className='type-h2 text-vaded-text-primary whitespace-nowrap font-bold'
                                title={currentTrack.title}
                                style={
                                    (currentTrack.title?.length ?? 0) > 36
                                        ? {
                                              animation:
                                                  'marquee 10s linear infinite',
                                          }
                                        : undefined
                                }
                            >
                                {currentTrack.title || t('music.unknown')}
                            </h2>
                        </div>
                        <p className='flex items-center justify-center gap-1.5 sm:justify-start type-body text-vaded-text-secondary mb-5'>
                            <TrackSourceIcon
                                source={currentTrack.source}
                                className='h-3.5 w-3.5 shrink-0'
                            />
                            {currentTrack.author || t('music.unknown')}
                        </p>

                        {/* Progress */}
                        <div className='mb-5'>
                            <div
                                className={`group relative h-2 rounded-full overflow-visible cursor-pointer ${isStale ? 'opacity-50' : ''}`}
                                style={{ background: 'rgba(255,255,255,0.06)' }}
                            >
                                {/* Track fill with shimmer */}
                                <div
                                    className={`relative h-full rounded-full transition-[width] duration-1000 overflow-hidden ${isStale ? 'bg-vaded-warning' : 'bg-vaded-brand'}`}
                                    style={{
                                        width: `${progress}%`,
                                        boxShadow: isStale
                                            ? undefined
                                            : '0 0 12px rgba(220,38,38,0.6)',
                                    }}
                                >
                                    {/* Animated shimmer sweep */}
                                    {!isStale && state.isPlaying && (
                                        <span
                                            aria-hidden='true'
                                            className='absolute inset-0 -skew-x-12'
                                            style={{
                                                background:
                                                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
                                                animation:
                                                    'shimmer 2.4s ease-in-out infinite',
                                                backgroundSize: '60% 100%',
                                                backgroundRepeat: 'no-repeat',
                                            }}
                                        />
                                    )}
                                </div>
                                {/* Scrubber thumb */}
                                {progress > 0 && (
                                    <div
                                        className='absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(220,38,38,0.7)] border-2 border-vaded-brand opacity-0 group-hover:opacity-100 transition-opacity duration-150'
                                        style={{ left: `${progress}%` }}
                                        aria-hidden='true'
                                    />
                                )}
                            </div>
                            <div className='flex justify-between type-meta text-vaded-text-tertiary mt-2 tabular-nums font-medium tracking-wide'>
                                <span className='text-vaded-text-secondary'>
                                    {formatSeconds(positionMs / 1000)}
                                </span>
                                {isStale && (
                                    <span
                                        role='status'
                                        className='text-vaded-warning text-center'
                                    >
                                        {t('music.progressMayBeOutdated')}
                                    </span>
                                )}
                                <span>{formatSeconds(durationMs / 1000)}</span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div
                            className='flex justify-center sm:justify-start items-center gap-2 mb-4'
                            role='toolbar'
                            aria-label={t('music.musicPlayer')}
                        >
                            <ControlButton
                                icon={
                                    busy && pendingAction === 'shuffle' ? (
                                        <Loader2 className='h-4 w-4 animate-spin' />
                                    ) : (
                                        <Shuffle className='h-4 w-4' />
                                    )
                                }
                                onClick={onShuffle}
                                active={state.shuffled}
                                disabled={!controlsEnabled}
                                aria-label={t('music.shuffle')}
                            />
                            <ControlButton
                                icon={
                                    busy && pendingAction === 'previous' ? (
                                        <Loader2 className='h-5 w-5 animate-spin' />
                                    ) : (
                                        <SkipBack className='h-5 w-5' />
                                    )
                                }
                                onClick={onPrevious}
                                disabled={!controlsEnabled}
                                aria-label={t('music.previousTrack')}
                            />
                            {/* Primary play/pause */}
                            <button
                                onClick={onPlayPause}
                                disabled={!controlsEnabled}
                                className='group relative h-14 w-14 rounded-xl btn-glass text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vaded-brand focus-visible:ring-offset-2 focus-visible:ring-offset-transparent overflow-hidden'
                                style={{
                                    boxShadow:
                                        '0 4px 24px rgba(220,38,38,0.3), 0 0 0 1px rgba(220,38,38,0.35)',
                                }}
                                aria-label={
                                    state.isPlaying
                                        ? t('music.pause')
                                        : t('music.play')
                                }
                                aria-busy={
                                    pendingAction === 'pause' ||
                                    pendingAction === 'resume'
                                }
                            >
                                {/* Hover shimmer */}
                                <span
                                    aria-hidden='true'
                                    className='pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-full'
                                />
                                {pendingAction === 'pause' ||
                                pendingAction === 'resume' ? (
                                    <Loader2 className='h-6 w-6 animate-spin' />
                                ) : state.isPlaying ? (
                                    <Pause className='h-6 w-6' />
                                ) : (
                                    <Play className='h-6 w-6 ml-0.5' />
                                )}
                            </button>
                            <ControlButton
                                icon={
                                    busy && pendingAction === 'skip' ? (
                                        <Loader2 className='h-5 w-5 animate-spin' />
                                    ) : (
                                        <SkipForward className='h-5 w-5' />
                                    )
                                }
                                onClick={onSkip}
                                disabled={!controlsEnabled}
                                aria-label={t('music.nextTrack')}
                            />
                            <ControlButton
                                icon={
                                    busy && pendingAction === 'repeat' ? (
                                        <Loader2 className='h-4 w-4 animate-spin' />
                                    ) : (
                                        getRepeatIcon(state.repeatMode)
                                    )
                                }
                                onClick={onRepeatCycle}
                                active={state.repeatMode !== 'off'}
                                disabled={!controlsEnabled}
                                aria-label={t('music.repeatMode', {
                                    mode: state.repeatMode,
                                })}
                            />
                        </div>

                        {/* Volume */}
                        <div className='flex items-center gap-3 max-w-xs mx-auto sm:mx-0'>
                            <Volume2
                                className='h-4 w-4 text-vaded-text-tertiary shrink-0'
                                aria-hidden='true'
                            />
                            <input
                                type='range'
                                min='0'
                                max='100'
                                value={state.volume ?? 50}
                                onChange={(e) =>
                                    onVolumeChange(parseInt(e.target.value, 10))
                                }
                                disabled={!controlsEnabled}
                                className='flex-1 h-1.5 bg-vaded-bg-active rounded-full appearance-none cursor-pointer accent-vaded-brand disabled:opacity-40 disabled:cursor-not-allowed'
                                aria-label={t('music.volume')}
                            />
                            <span className='type-meta text-vaded-text-tertiary w-8 text-right tabular-nums'>
                                {state.volume ?? 50}
                            </span>
                        </div>

                        {!controlsEnabled && (
                            <p className='type-meta text-center sm:text-left text-vaded-text-tertiary mt-3'>
                                {busy
                                    ? t('music.commandInProgress')
                                    : t('music.notConnectedToVoiceChannel')}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function ControlButton({
    icon,
    onClick,
    active = false,
    disabled = false,
    ...props
}: {
    icon: React.ReactNode
    onClick: () => void
    active?: boolean
    disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`group relative h-11 w-11 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vaded-brand overflow-hidden ${
                active
                    ? 'text-vaded-brand border border-vaded-brand/40'
                    : 'text-vaded-text-secondary hover:text-vaded-text-primary border border-white/8'
            }`}
            style={{
                background: active
                    ? 'rgba(220,38,38,0.12)'
                    : 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(8px)',
                boxShadow: active
                    ? '0 0 12px rgba(220,38,38,0.2), inset 0 1px 0 rgba(255,255,255,0.08)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
            {...props}
        >
            {/* Hover glass sheen */}
            <span
                aria-hidden='true'
                className='pointer-events-none absolute inset-0 bg-gradient-to-b from-white/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity'
            />
            {icon}
        </button>
    )
}

function getRepeatIcon(mode: 'off' | 'track' | 'queue' | 'autoplay') {
    switch (mode) {
        case 'track':
            return <Repeat1 className='h-4 w-4' />
        case 'queue':
            return <Repeat className='h-4 w-4' />
        case 'autoplay':
            return <Music2 className='h-4 w-4' />
        default:
            return <Repeat className='h-4 w-4 opacity-50' />
    }
}

function formatSeconds(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

// SSE drops that self-heal within this window never reach the UI — most
// disconnects are momentary (network blip, tab throttling) and the retry
// loop in useMusicPlayer already reconnects within ~1s, so flashing
// "Reconnecting" for every one of them is just noise. A connection that's
// never been established yet (fresh page load) still shows immediately.
const DISCONNECTED_DISPLAY_GRACE_MS = 2000

function ConnectionBadge({ connected }: { connected: boolean }) {
    const { t } = useTranslation()
    const [showDisconnected, setShowDisconnected] = useState(!connected)
    const everConnectedRef = useRef(connected)

    useEffect(() => {
        if (connected) {
            everConnectedRef.current = true
            setShowDisconnected(false)
            return
        }

        if (!everConnectedRef.current) {
            setShowDisconnected(true)
            return
        }

        const timer = setTimeout(
            () => setShowDisconnected(true),
            DISCONNECTED_DISPLAY_GRACE_MS,
        )
        return () => clearTimeout(timer)
    }, [connected])

    const displayConnected = !showDisconnected

    return (
        <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full type-meta shrink-0 border transition-colors ${
                displayConnected
                    ? 'bg-vaded-success/10 text-vaded-success border-vaded-success/20'
                    : 'bg-vaded-warning/10 text-vaded-warning border-vaded-warning/20'
            }`}
            role='status'
            aria-label={
                displayConnected
                    ? t('music.connectedToLiveUpdates')
                    : t('music.reconnectingToLiveUpdates')
            }
        >
            {displayConnected ? (
                <Wifi className='h-3 w-3' aria-hidden='true' />
            ) : (
                <WifiOff className='h-3 w-3' aria-hidden='true' />
            )}
            <span className='hidden sm:inline'>
                {displayConnected
                    ? t('music.connected')
                    : t('music.reconnecting')}
            </span>
        </div>
    )
}
