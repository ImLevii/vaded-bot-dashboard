import { type ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

type StatTone = 'brand' | 'accent' | 'success' | 'warning' | 'neutral'

const toneIconClass: Record<StatTone, string> = {
    brand: 'bg-vaded-brand/15 text-vaded-brand',
    accent: 'bg-vaded-brand/15 text-vaded-brand',
    success: 'bg-vaded-success/15 text-vaded-success',
    warning: 'bg-vaded-warning/15 text-vaded-warning',
    neutral: 'bg-vaded-bg-active text-vaded-text-tertiary',
}

interface StatTileProps {
    label: string
    value: string | number
    icon?: ReactNode
    delta?: number
    tone?: StatTone
    className?: string
    /** Recent-value samples, oldest first — renders a tiny inline sparkline when provided. Omit if no real series exists; never fabricate one. */
    sparkline?: number[]
}

function MiniSparkline({ values, tone }: { values: number[]; tone: StatTone }) {
    if (values.length < 2) return null
    const w = 100
    const h = 28
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const points = values
        .map((v, i) => {
            const x = (i / (values.length - 1)) * w
            const y = h - ((v - min) / range) * h
            return `${x},${y}`
        })
        .join(' ')
    const strokeClass =
        tone === 'success'
            ? 'stroke-vaded-success'
            : tone === 'warning'
              ? 'stroke-vaded-warning'
              : 'stroke-vaded-brand'

    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio='none'
            className='h-7 w-full'
            aria-hidden='true'
        >
            <polyline
                points={points}
                fill='none'
                strokeWidth={2}
                className={strokeClass}
                strokeLinecap='round'
                strokeLinejoin='round'
            />
        </svg>
    )
}

export default function StatTile({
    label,
    value,
    icon,
    delta,
    tone = 'neutral',
    className,
    sparkline,
}: StatTileProps) {
    return (
        <article
            className={cn(
                'surface-panel group flex flex-col gap-4 p-5 transition-all duration-200',
                'motion-safe:hover:-translate-y-1 hover:border-vaded-brand/30 hover:shadow-card-hover',
                className,
            )}
            style={{
                backgroundImage:
                    'radial-gradient(circle at 90% 6%, rgb(220 38 38 / 0.08), transparent 40%)',
            }}
        >
            <div className='flex items-center justify-between gap-2'>
                <p className='type-meta text-vaded-text-tertiary'>{label}</p>
                {icon && (
                    <span
                        className={cn(
                            'rounded-lg p-2.5 transition-shadow duration-200 group-hover:shadow-glow-red-sm',
                            toneIconClass[tone],
                        )}
                    >
                        {icon}
                    </span>
                )}
            </div>
            <p className='font-[var(--font-vaded-hero)] text-4xl font-bold leading-tight tracking-tight text-vaded-text-primary tabular-nums'>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {sparkline && sparkline.length > 1 && (
                <MiniSparkline values={sparkline} tone={tone} />
            )}
            {delta !== undefined && (
                <p
                    className={cn(
                        'type-body-sm inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 font-medium',
                        delta >= 0
                            ? 'bg-vaded-success/10 text-vaded-success'
                            : 'bg-vaded-error/10 text-vaded-error',
                    )}
                >
                    {delta >= 0 ? (
                        <TrendingUp className='h-3.5 w-3.5' />
                    ) : (
                        <TrendingDown className='h-3.5 w-3.5' />
                    )}
                    {Math.abs(delta)}%
                </p>
            )}
        </article>
    )
}
