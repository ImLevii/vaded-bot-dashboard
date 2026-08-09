import { Heart } from 'lucide-react'
import { useVoteStatus } from '@/hooks/useVoteStatus'

const TIER_STYLES: Record<string, string> = {
    'Vaded Supporter':
        'bg-vaded-bg-secondary text-vaded-text-secondary border-vaded-border',
    'Vaded Fan':
        'bg-vaded-bg-tertiary text-vaded-text-primary border-vaded-border-strong',
    'Vaded Regular':
        'bg-vaded-brand/10 text-vaded-brand border-vaded-brand/30',
    'Vaded Legend':
        'bg-gradient-to-r from-amber-500/20 to-amber-500/40 text-amber-200 border-amber-500/60',
}

export function VoteBadge() {
    const { status } = useVoteStatus()

    if (!status) return null

    if (!status.tier) {
        return (
            <a
                href={status.voteUrl}
                target='_blank'
                rel='noreferrer'
                className='vaded-focus-visible hidden sm:inline-flex items-center gap-1 rounded-md border border-vaded-brand/25 bg-vaded-brand/8 px-2.5 py-1.5 font-black text-sm tracking-tight hover:bg-vaded-brand/15 transition-colors'
                title='Vote for Vaded Gaming on top.gg'
            >
                <span>VADED</span>
                <span className='text-vaded-brand'>GAMING</span>
            </a>
        )
    }

    const style =
        TIER_STYLES[status.tier.label] ?? TIER_STYLES['Vaded Supporter']

    return (
        <a
            href={status.voteUrl}
            target='_blank'
            rel='noreferrer'
            className={`vaded-focus-visible hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 type-body-sm transition-colors hover:brightness-110 ${style}`}
            title={`${status.tier.label} — ${status.streak}-vote streak. Click to vote again.`}
        >
            <Heart aria-hidden='true' className='h-3.5 w-3.5 shrink-0' />
            <span className='truncate max-w-[140px]'>{status.tier.label}</span>
            <span className='type-meta opacity-70'>· {status.streak}</span>
        </a>
    )
}

export default VoteBadge
