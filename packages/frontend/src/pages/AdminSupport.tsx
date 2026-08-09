import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LifeBuoy, ImageIcon } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { api } from '@/services/api'
import type { SupportReportListItem } from '@/services/supportApi'

const STATUS_FILTERS = ['all', 'new', 'triaged', 'promoted', 'dismissed']

export default function AdminSupportPage() {
    const { t } = useTranslation()
    const [status, setStatus] = useState('all')
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const list = useQuery({
        queryKey: ['admin-support', status],
        queryFn: () =>
            api.support.listAdmin(status === 'all' ? undefined : { status }),
    })

    const detail = useQuery({
        queryKey: ['admin-support-detail', selectedId],
        queryFn: () => api.support.getAdmin(selectedId as string),
        enabled: selectedId !== null,
    })

    return (
        <div className='space-y-6 px-1 sm:px-0'>
            <header className='flex items-center gap-3'>
                <LifeBuoy
                    className='h-6 w-6 sm:h-7 sm:w-7 text-vaded-brand shrink-0'
                    aria-hidden='true'
                />
                <div>
                    <h1 className='type-h1 text-vaded-text-primary'>
                        {t('support.admin.title')}
                    </h1>
                    <p className='type-body-sm text-vaded-text-secondary'>
                        {t('support.admin.subtitle')}
                    </p>
                </div>
            </header>

            <div className='flex flex-wrap gap-2'>
                {STATUS_FILTERS.map((s) => (
                    <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={`px-3 py-1.5 rounded-sm type-meta uppercase font-semibold border transition-colors ${
                            status === s
                                ? 'bg-vaded-brand text-vaded-bg-primary border-vaded-brand'
                                : 'bg-vaded-bg-active text-vaded-text-secondary border-vaded-border hover:text-vaded-text-primary'
                        }`}
                    >
                        {t(`support.admin.status.${s}`)}
                    </button>
                ))}
            </div>

            {list.isError && (
                <div
                    className='type-body-sm text-vaded-error bg-vaded-error/10 border border-vaded-error/20 rounded-lg p-3'
                    role='alert'
                >
                    {t('support.admin.loadError')}
                </div>
            )}

            {!list.isError &&
            (list.data?.length ?? 0) === 0 &&
            !list.isLoading ? (
                <EmptyState
                    icon={<LifeBuoy className='h-10 w-10' aria-hidden='true' />}
                    title={t('support.admin.emptyTitle')}
                    description={t('support.admin.emptyDescription')}
                />
            ) : (
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6'>
                    <ul className='space-y-2'>
                        {list.data?.map((r) => (
                            <li key={r.id}>
                                <button
                                    onClick={() => setSelectedId(r.id)}
                                    className={`w-full text-left surface-panel rounded-lg border p-3 transition-colors hover:bg-vaded-bg-active/25 ${
                                        selectedId === r.id
                                            ? 'border-vaded-brand'
                                            : 'border-vaded-border hover:border-vaded-text-tertiary'
                                    }`}
                                >
                                    <div className='flex items-center justify-between gap-2 mb-1'>
                                        <StatusBadge status={r.status} />
                                        {r.imageMimeType && (
                                            <ImageIcon
                                                className='h-3.5 w-3.5 text-vaded-text-tertiary'
                                                aria-label={t(
                                                    'support.admin.hasImage',
                                                )}
                                            />
                                        )}
                                    </div>
                                    <p className='type-body-sm text-vaded-text-primary line-clamp-2'>
                                        {r.context}
                                    </p>
                                    <p className='type-meta text-vaded-text-tertiary mt-1'>
                                        {new Date(r.createdAt).toLocaleString()}
                                        {r.correlationId
                                            ? ` · ${r.correlationId}`
                                            : ''}
                                    </p>
                                </button>
                            </li>
                        ))}
                    </ul>

                    <div className='surface-panel rounded-lg border border-vaded-border p-4 min-h-[200px]'>
                        {selectedId === null ? (
                            <p className='type-body-sm text-vaded-text-tertiary'>
                                {t('support.admin.selectPrompt')}
                            </p>
                        ) : detail.isLoading ? (
                            <p className='type-body-sm text-vaded-text-tertiary'>
                                {t('common.loading')}
                            </p>
                        ) : detail.data ? (
                            <div className='space-y-3'>
                                <StatusBadge status={detail.data.status} />
                                <p className='type-body text-vaded-text-primary whitespace-pre-wrap'>
                                    {detail.data.context}
                                </p>
                                <dl className='type-meta text-vaded-text-tertiary space-y-1'>
                                    {detail.data.correlationId && (
                                        <div>
                                            cid: {detail.data.correlationId}
                                        </div>
                                    )}
                                    {detail.data.guildId && (
                                        <div>guild: {detail.data.guildId}</div>
                                    )}
                                    {detail.data.errorCategory && (
                                        <div>
                                            category:{' '}
                                            {detail.data.errorCategory}
                                        </div>
                                    )}
                                    <div>surface: {detail.data.surface}</div>
                                </dl>
                                {detail.data.hasImage && (
                                    <img
                                        src={api.support.imageUrl(
                                            detail.data.id,
                                        )}
                                        alt={t('support.admin.imageAlt')}
                                        className='max-w-full rounded-lg border border-vaded-border'
                                    />
                                )}
                            </div>
                        ) : (
                            <p
                                className='type-body-sm text-vaded-error'
                                role='alert'
                            >
                                {t('support.admin.loadError')}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const { t } = useTranslation()
    const tone =
        status === 'new'
            ? 'bg-vaded-brand/10 text-vaded-brand border-vaded-brand/20'
            : status === 'promoted'
              ? 'bg-vaded-success/10 text-vaded-success border-vaded-success/20'
              : status === 'dismissed'
                ? 'bg-vaded-bg-active text-vaded-text-tertiary border-vaded-border'
                : 'bg-vaded-warning/10 text-vaded-warning border-vaded-warning/20'
    return (
        <span
            className={`inline-block px-2 py-0.5 rounded-sm type-meta uppercase font-semibold border ${tone}`}
        >
            {t(`support.admin.status.${status}`, { defaultValue: status })}
        </span>
    )
}

export type { SupportReportListItem }
