import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    hover?: boolean
    interactive?: boolean
    glow?: boolean
    /** Subtle red radial spotlight in the top-right corner, for KPI/metric cards. */
    spotlight?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
    (
        {
            className,
            hover = false,
            interactive = false,
            glow = false,
            spotlight = false,
            style,
            ...props
        },
        ref,
    ) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'surface-card relative transition-colors transition-shadow transition-transform duration-200 motion-safe:duration-200',
                    'focus-within:border-vaded-brand/35 focus-within:ring-2 focus-within:ring-vaded-brand/20',
                    hover &&
                        'hover:border-vaded-brand/30 hover:bg-vaded-bg-active/60 hover:shadow-card-hover',
                    interactive && [
                        'cursor-pointer',
                        'hover:border-vaded-brand/35',
                        'hover:bg-vaded-bg-active/70',
                        'motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.01]',
                        'hover:shadow-card-hover',
                        'active:border-vaded-brand/30',
                        'active:translate-y-0 active:scale-100',
                    ],
                    glow && 'border-vaded-brand/30 shadow-glow-red-sm',
                    spotlight && 'overflow-hidden',
                    className,
                )}
                style={
                    spotlight
                        ? {
                              ...style,
                              backgroundImage:
                                  'radial-gradient(circle at 88% 8%, rgb(220 38 38 / 0.1), transparent 42%)',
                          }
                        : style
                }
                {...props}
            />
        )
    },
)

Card.displayName = 'Card'

export default Card
