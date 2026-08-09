import { Globe } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import FeatureCard from './FeatureCard'
import { useFeaturesStore } from '@/stores/featuresStore'
import type {
    FeatureToggleName,
    FeatureToggleState,
    GlobalFeatureToggleProvider,
} from '@/types'

interface GlobalTogglesSectionProps {
    toggles: FeatureToggleState
    provider: GlobalFeatureToggleProvider
    writable: boolean
    onToggle: (name: FeatureToggleName, enabled: boolean) => void
}

const providerLabel: Record<GlobalFeatureToggleProvider, string> = {
    database: 'Database',
    environment: 'Environment',
}

export default function GlobalTogglesSection({
    toggles,
    provider,
    writable,
    onToggle,
}: GlobalTogglesSectionProps) {
    const features = useFeaturesStore((state) => state.features)

    return (
        <div className='space-y-4'>
            <div className='flex items-center gap-2 mb-4'>
                <Globe
                    className='w-5 h-5 text-vaded-purple'
                    aria-hidden='true'
                />
                <h2
                    id='global-toggles-heading'
                    className='text-lg font-semibold text-white'
                >
                    Global Feature Toggles
                </h2>
                <Badge className='bg-vaded-purple/20 text-vaded-purple text-xs'>
                    Admin Only
                </Badge>
                <Badge className='bg-vaded-bg-tertiary text-vaded-text-secondary text-xs'>
                    {providerLabel[provider]}
                </Badge>
            </div>
            <p className='text-sm text-vaded-text-secondary mb-4'>
                {writable
                    ? 'Toggle features on or off globally. Changes take effect immediately for all servers.'
                    : 'These toggles are managed externally and cannot be changed here.'}
            </p>
            <div className='grid gap-4'>
                {features.map((feature) => (
                    <FeatureCard
                        key={feature.name}
                        feature={feature}
                        enabled={toggles[feature.name] ?? false}
                        onToggle={(enabled) => onToggle(feature.name, enabled)}
                        isGlobal
                        readOnly={!writable}
                    />
                ))}
            </div>
        </div>
    )
}
