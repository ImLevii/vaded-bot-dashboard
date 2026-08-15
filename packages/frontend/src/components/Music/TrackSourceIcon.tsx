import { Music2 } from 'lucide-react'
import type { TrackInfo } from '@/types'

export const SOURCE_META: Record<
    TrackInfo['source'],
    { label: string; color: string }
> = {
    youtube: { label: 'YouTube', color: '#FF0000' },
    spotify: { label: 'Spotify', color: '#1DB954' },
    soundcloud: { label: 'SoundCloud', color: '#FF5500' },
    unknown: { label: 'Unknown source', color: '#768390' },
}

interface TrackSourceIconProps {
    source: TrackInfo['source']
    className?: string
}

/** Small brand-colored source mark (YouTube / Spotify / SoundCloud). */
export default function TrackSourceIcon({
    source,
    className = 'h-3 w-3',
}: TrackSourceIconProps) {
    const meta = SOURCE_META[source] ?? SOURCE_META.unknown

    if (source === 'youtube') {
        return (
            <svg
                role='img'
                aria-label={meta.label}
                viewBox='0 0 24 24'
                xmlns='http://www.w3.org/2000/svg'
                className={className}
                fill={meta.color}
            >
                <path d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' />
            </svg>
        )
    }
    if (source === 'spotify') {
        return (
            <svg
                role='img'
                aria-label={meta.label}
                viewBox='0 0 24 24'
                xmlns='http://www.w3.org/2000/svg'
                className={className}
                fill={meta.color}
            >
                <path d='M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z' />
            </svg>
        )
    }
    if (source === 'soundcloud') {
        return (
            <svg
                role='img'
                aria-label={meta.label}
                viewBox='0 0 24 24'
                xmlns='http://www.w3.org/2000/svg'
                className={className}
                fill={meta.color}
            >
                <path d='M1.175 12.225C.513 12.225 0 12.737 0 13.4v0c0 .662.513 1.175 1.175 1.175s1.175-.513 1.175-1.175-.513-1.175-1.175-1.175zM3.78 11.4c-.363 0-.675.3-.675.675v2.65c0 .375.3.675.675.675s.675-.3.675-.675v-2.65c0-.375-.3-.675-.675-.675zm2.62-.263c-.375 0-.675.3-.675.675v3.175c0 .375.3.675.675.675s.675-.3.675-.675v-3.175c0-.375-.3-.675-.675-.675zm2.625-.375c-.375 0-.675.3-.675.675v3.55c0 .375.3.675.675.675s.675-.3.675-.675v-3.55c0-.375-.3-.675-.675-.675zm2.625.225c-.375 0-.675.3-.675.675v3.1c0 .375.3.675.675.675s.675-.3.675-.675v-3.1c0-.375-.3-.675-.675-.675zm2.625-.625c-.375 0-.675.3-.675.675v3.75c0 .375.3.675.675.675s.675-.3.675-.675v-3.75c0-.375-.3-.675-.675-.675zM18.9 9.8C18.2 8.1 16.5 6.9 14.55 6.9c-.45 0-.9.075-1.3.2C12.2 5.65 10.6 4.8 8.8 4.8c-3.05 0-5.525 2.475-5.525 5.525 0 .1.025.2.025.3C1.4 11.0.5 12.1.5 13.4v.05c0 1.575 1.275 2.85 2.85 2.85h15.55c1.575 0 2.85-1.275 2.85-2.85 0-1.425-1.025-2.6-2.4-2.825C19.325 10.275 19.125 10 18.9 9.8z' />
            </svg>
        )
    }
    return (
        <Music2
            className={className}
            style={{ color: meta.color }}
            aria-label={meta.label}
        />
    )
}
