import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2',
    {
        variants: {
            variant: {
                default:
                    'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/80',
                secondary:
                    'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
                destructive:
                    'border-transparent bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/80',
                outline: 'text-foreground',
                // Neon status pills — pill shape, uppercase mono, glow matching the status color.
                success:
                    'border-vaded-success/40 bg-vaded-success/15 text-vaded-success shadow-glow-green font-mono text-[11px] uppercase tracking-wide',
                warning:
                    'border-vaded-warning/40 bg-vaded-warning/15 text-vaded-warning shadow-glow-amber font-mono text-[11px] uppercase tracking-wide',
                error: 'border-vaded-error/40 bg-vaded-error/15 text-vaded-error shadow-glow-red-sm font-mono text-[11px] uppercase tracking-wide',
                info: 'border-vaded-info/40 bg-vaded-info/15 text-vaded-info shadow-glow-info font-mono text-[11px] uppercase tracking-wide',
                neutral:
                    'border-vaded-border-strong bg-vaded-bg-active text-vaded-text-tertiary font-mono text-[11px] uppercase tracking-wide',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
)

export interface BadgeProps
    extends
        React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    )
}

export { Badge, badgeVariants }
