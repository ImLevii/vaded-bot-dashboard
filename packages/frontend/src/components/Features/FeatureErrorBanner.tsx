import { AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { api } from '@/services/api'
import type { FeatureLoadErrorState } from '@/stores/featuresStore'

interface FeatureErrorBannerProps {
    loadError: FeatureLoadErrorState
    retryLoad: () => void
}

export default function FeatureErrorBanner({ loadError, retryLoad }: FeatureErrorBannerProps) {
    return (
        <section className='rounded-xl border border-vaded-border bg-vaded-bg-secondary/80 p-4'>
            <div className='flex items-start gap-3'>
                <AlertTriangle className='h-5 w-5 text-vaded-yellow mt-0.5' />
                <div className='space-y-3'>
                    <div>
                        <h2 className='type-body-sm font-semibold text-vaded-text-primary'>
                            Unable to load feature data
                        </h2>
                        <p className='text-sm text-vaded-text-secondary'>
                            {loadError.message}
                        </p>
                    </div>
                    <div className='flex items-center gap-3'>
                        <Button size='sm' onClick={retryLoad}>
                            Retry
                        </Button>
                        {(loadError.kind === 'auth' || loadError.kind === 'forbidden') && (
                            <a
                                href={api.auth.getDiscordLoginUrl()}
                                className='text-sm text-vaded-text-secondary hover:text-vaded-text-primary'
                            >
                                Re-authenticate
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}
