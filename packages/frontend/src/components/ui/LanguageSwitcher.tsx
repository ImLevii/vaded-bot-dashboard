import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from './dropdown-menu'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface LanguageSwitcherProps {
    variant?: 'header' | 'compact'
    className?: string
}

function resolveLanguage(language: string): SupportedLanguage {
    if (language.toLowerCase().startsWith('pt')) return 'pt-BR'
    return 'en'
}

export default function LanguageSwitcher({
    variant = 'header',
    className,
}: LanguageSwitcherProps) {
    const { t, i18n } = useTranslation()
    const active = resolveLanguage(i18n.resolvedLanguage ?? i18n.language)
    const activeLabel = t(`languages.${active}`)

    const triggerClass =
        variant === 'compact'
            ? 'vaded-focus-visible flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-vaded-text-subtle transition-colors hover:bg-vaded-bg-tertiary hover:text-vaded-text-primary'
            : 'vaded-focus-visible flex items-center gap-2 rounded-md border border-vaded-border bg-vaded-bg-secondary px-3 py-1.5 text-vaded-text-secondary transition-colors hover:border-vaded-border-strong hover:bg-vaded-bg-tertiary hover:text-vaded-text-primary'

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className={cn(triggerClass, className)}
                aria-label={`${t('common.language')}: ${activeLabel}`}
                title={t('common.language')}
            >
                <Languages
                    className='h-3.5 w-3.5 shrink-0'
                    aria-hidden='true'
                />
                {variant === 'header' && (
                    <span className='type-body-sm'>{activeLabel}</span>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align='end'
                className='min-w-[160px] bg-vaded-bg-secondary border-vaded-border'
            >
                <DropdownMenuRadioGroup
                    value={active}
                    onValueChange={(lng) => {
                        void i18n.changeLanguage(lng)
                    }}
                >
                    {SUPPORTED_LANGUAGES.map((lng) => (
                        <DropdownMenuRadioItem
                            key={lng}
                            value={lng}
                            className='flex items-center justify-between gap-2 text-vaded-text-primary focus:bg-vaded-bg-tertiary'
                        >
                            <span className='type-body-sm'>
                                {t(`languages.${lng}`)}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
