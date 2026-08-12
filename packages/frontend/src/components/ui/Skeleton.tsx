import { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
    return (
        <div
            className={cn(
                'skeleton-shimmer motion-reduce:animate-pulse rounded',
                className,
            )}
            {...props}
        />
    )
}

export default Skeleton
