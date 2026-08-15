import { memo } from 'react'
import { Music2 } from 'lucide-react'
import type { VoiceListener } from '@/types'

interface ListenersWidgetProps {
    listeners: VoiceListener[]
    voiceChannelName: string | null
}

const MAX_AVATARS = 5

export default memo(function ListenersWidget({
    listeners,
    voiceChannelName,
}: ListenersWidgetProps) {
    if (!voiceChannelName) return null

    // Defensive: tolerate an older backend/bot deploy that predates this
    // field so a rolling deploy can't crash the page on a schema mismatch.
    const safeListeners = listeners ?? []
    const humans = safeListeners.filter((l) => !l.isBot)
    const botPresent = safeListeners.some((l) => l.isBot)
    const shown = humans.slice(0, MAX_AVATARS)
    const overflow = humans.length - shown.length

    return (
        <div
            className='surface-card flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3'
            role='group'
            aria-label={`Listeners in ${voiceChannelName}`}
        >
            <div className='flex items-center -space-x-2'>
                {botPresent && (
                    <span
                        className='relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-vaded-brand/40 bg-vaded-brand/20 ring-2 ring-vaded-bg-secondary'
                        title='VADED GAMING is listening too'
                    >
                        <Music2
                            className='h-3 w-3 text-vaded-brand'
                            aria-hidden='true'
                        />
                    </span>
                )}
                {shown.map((listener, i) => (
                    <ListenerAvatar
                        key={listener.id}
                        listener={listener}
                        style={{ zIndex: shown.length - i }}
                    />
                ))}
                {overflow > 0 && (
                    <span
                        className='relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vaded-bg-active text-[10px] font-bold text-vaded-text-secondary ring-2 ring-vaded-bg-secondary'
                        title={`${overflow} more listening`}
                    >
                        +{overflow}
                    </span>
                )}
            </div>
            <span className='type-meta text-vaded-text-secondary whitespace-nowrap'>
                {humans.length === 0
                    ? 'Just the bot'
                    : `${humans.length} listening`}
            </span>
        </div>
    )
})

function ListenerAvatar({
    listener,
    style,
}: {
    listener: VoiceListener
    style?: React.CSSProperties
}) {
    if (listener.avatarUrl) {
        return (
            <img
                src={listener.avatarUrl}
                alt=''
                title={listener.displayName}
                loading='lazy'
                className='relative h-6 w-6 shrink-0 rounded-full object-cover ring-2 ring-vaded-bg-secondary'
                style={style}
            />
        )
    }
    return (
        <span
            className='relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vaded-bg-active text-[10px] font-bold text-vaded-text-secondary ring-2 ring-vaded-bg-secondary'
            title={listener.displayName}
            style={style}
        >
            {listener.displayName.charAt(0).toUpperCase()}
        </span>
    )
}
