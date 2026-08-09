import { memo, useState, useCallback } from 'react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Feature } from '@/types'
import { cn } from '@/lib/utils'

interface FeatureCardProps {
    feature: Feature
    enabled: boolean
    onToggle: (enabled: boolean) => void
    isGlobal?: boolean
    readOnly?: boolean
}

const formatFeatureName = (name: string): string => {
    return name
        .split('_')
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(' ')
}

function FeatureCard({
    feature,
    enabled,
    onToggle,
    isGlobal = false,
    readOnly = false,
}: FeatureCardProps) {
    const [isUpdating, setIsUpdating] = useState(false)

    const handleToggle = useCallback(
        async (checked: boolean) => {
            if (readOnly) {
                return
            }
            setIsUpdating(true)
            try {
                await onToggle(checked)
                toast.success(
                    `${formatFeatureName(feature.name)} ${checked ? 'enabled' : 'disabled'}`,
                )
            } catch {
                toast.error(
                    `Failed to update ${formatFeatureName(feature.name)}`,
                )
            } finally {
                setIsUpdating(false)
            }
        },
        [feature.name, onToggle, readOnly],
    )

    const featureName = formatFeatureName(feature.name)

    return (
        <article className='bg-vaded-bg-secondary rounded-xl p-5 border border-vaded-border'>
            <div className='flex items-start justify-between gap-4'>
                <div className='flex-1'>
                    <div className='flex items-center gap-2 mb-1'>
                        <h3 className='font-semibold text-white'>
                            {featureName}
                        </h3>
                        <Badge
                            className={cn(
                                'text-xs',
                                isGlobal && !readOnly
                                    ? 'bg-vaded-purple/20 text-vaded-purple'
                                    : isGlobal
                                      ? 'bg-vaded-bg-tertiary text-vaded-text-secondary'
                                      : 'bg-vaded-blue/20 text-vaded-blue',
                            )}
                            aria-label={
                                isGlobal
                                    ? 'Global feature'
                                    : 'Per-server feature'
                            }
                        >
                            {readOnly
                                ? 'Managed'
                                : isGlobal
                                  ? 'Global'
                                  : 'Per-Server'}
                        </Badge>
                    </div>
                    <p className='text-sm text-vaded-text-secondary'>
                        {feature.description}
                    </p>
                </div>
                <div className='flex items-center gap-3'>
                    <span
                        className={cn(
                            'text-sm',
                            enabled
                                ? 'text-vaded-success'
                                : 'text-vaded-text-tertiary',
                        )}
                        aria-live='polite'
                    >
                        {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <Switch
                        checked={enabled}
                        onCheckedChange={handleToggle}
                        disabled={isUpdating || readOnly}
                        aria-label={`Toggle ${featureName}`}
                    />
                </div>
            </div>
        </article>
    )
}

export default memo(FeatureCard)
