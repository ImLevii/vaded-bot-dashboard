import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    hover?: boolean
    interactive?: boolean
    glow?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className, hover = false, interactive = false, glow = false, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'surface-card relative transition-colors transition-shadow transition-transform duration-200',
                    'focus-within:border-vaded-brand/35 focus-within:ring-2 focus-within:ring-vaded-brand/20',
                    hover && 'hover:border-vaded-border-strong hover:bg-vaded-bg-active/60',
                    interactive && [
                        'cursor-pointer',
                        'hover:border-vaded-border-strong',
                        'hover:bg-vaded-bg-active/70',
                        'hover:-translate-y-px',
                        'active:border-vaded-brand/30',
                        'active:translate-y-0',
                    ],
                    glow && 'border-vaded-brand/30 shadow-[0_0_0_1px_rgb(236_72_153/0.08)]',
                    className,
                )}
                {...props}
            />
        )
    },
)

Card.displayName = 'Card'

export default Card
