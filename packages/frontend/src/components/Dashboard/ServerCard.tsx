import { memo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import type { Guild } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Button from '@/components/ui/Button'
import AddBotButton from './AddBotButton'
import { useGuildStore } from '@/stores/guildStore'

interface ServerCardProps {
    guild: Guild
}

function ServerCard({ guild }: ServerCardProps) {
    const navigate = useNavigate()
    const { selectGuild } = useGuildStore()

    const handleManage = useCallback(() => {
        selectGuild(guild)
        navigate('/')
    }, [navigate, selectGuild, guild])

    return (
        <article
            className={cn(
                'surface-card group flex flex-col gap-4 p-5 transition-all duration-200',
                'hover:border-vaded-brand/30 motion-safe:hover:-translate-y-1 hover:shadow-card-hover',
                'focus-within:ring-2 focus-within:ring-vaded-brand focus-within:ring-offset-2 focus-within:ring-offset-vaded-bg-primary',
            )}
            role='article'
            aria-labelledby={`server-${guild.id}-name`}
        >
            <div className='flex items-center gap-4'>
                <div className='relative shrink-0'>
                    <Avatar
                        className={cn(
                            'h-14 w-14 ring-2 ring-transparent transition-all duration-200',
                            guild.botAdded &&
                                'group-hover:ring-vaded-brand/50 group-hover:shadow-glow-red-sm',
                        )}
                    >
                        <AvatarImage
                            src={
                                guild.icon
                                    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
                                    : undefined
                            }
                            alt={`${guild.name} icon`}
                        />
                        <AvatarFallback className='type-h2 bg-vaded-bg-active text-vaded-text-secondary'>
                            {guild.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    {guild.botAdded && (
                        <div
                            className='absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-vaded-bg-secondary bg-vaded-success shadow-glow-green'
                            aria-label='Bot is installed'
                        >
                            <CheckCircle2
                                className='h-3 w-3 text-white'
                                aria-hidden='true'
                            />
                        </div>
                    )}
                </div>

                <div className='min-w-0 flex-1'>
                    <h3
                        id={`server-${guild.id}-name`}
                        className='type-title truncate text-vaded-text-primary'
                    >
                        {guild.name}
                    </h3>
                    <div className='mt-1.5 flex items-center gap-2'>
                        <Badge
                            variant={guild.botAdded ? 'success' : 'error'}
                            className='normal-case tracking-normal gap-1'
                            aria-label={
                                guild.botAdded
                                    ? 'Bot installed'
                                    : 'Bot not installed'
                            }
                        >
                            {guild.botAdded ? (
                                <>
                                    <CheckCircle2
                                        className='h-3 w-3'
                                        aria-hidden='true'
                                    />
                                    Bot Active
                                </>
                            ) : (
                                <>
                                    <XCircle
                                        className='h-3 w-3'
                                        aria-hidden='true'
                                    />
                                    No Bot
                                </>
                            )}
                        </Badge>
                        {guild.memberCount != null && (
                            <span className='type-meta text-vaded-text-tertiary normal-case tracking-normal'>
                                {guild.memberCount.toLocaleString()} members
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className='flex gap-2'>
                {guild.botAdded ? (
                    <Button
                        onClick={handleManage}
                        className='flex-1 gap-1.5'
                        aria-label={`Manage ${guild.name}`}
                    >
                        <ExternalLink
                            className='h-3.5 w-3.5'
                            aria-hidden='true'
                        />
                        Manage
                    </Button>
                ) : (
                    <AddBotButton guild={guild} />
                )}
            </div>
        </article>
    )
}

export default memo(ServerCard)
