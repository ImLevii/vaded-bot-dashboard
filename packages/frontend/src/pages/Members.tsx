import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Users, Shield, ChevronDown, ChevronUp, X, Check } from 'lucide-react'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { RBAC_MODULES } from '@/types/rbac'
import type { ModuleKey } from '@/types/rbac'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type AccessMode = 'none' | 'view' | 'manage'

const MODULE_LABELS: Record<ModuleKey, string> = {
    overview: 'Overview',
    settings: 'Settings',
    moderation: 'Moderation',
    automation: 'Automation',
    music: 'Music',
    integrations: 'Integrations',
}

const MODE_LABELS: Record<AccessMode, string> = {
    none: 'No access',
    view: 'View only',
    manage: 'Full access',
}

const MODE_COLORS: Record<AccessMode, string> = {
    none: 'text-lucky-text-tertiary border-lucky-border bg-transparent',
    view: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    manage: 'text-lucky-brand border-lucky-brand/30 bg-lucky-brand/10',
}

function roleColor(color: number): string {
    if (!color) return '#6b7280'
    return `#${color.toString(16).padStart(6, '0')}`
}

function avatarFallback(name: string): string {
    return name.charAt(0).toUpperCase()
}

function MemberRow({
    member,
    guildId,
}: {
    member: {
        id: string
        username: string
        displayName: string
        avatarUrl: string | null
        roles: Array<{ id: string; name: string; color: number }>
        userGrants: Array<{ module: string; mode: string }>
    }
    guildId: string
}) {
    const queryClient = useQueryClient()
    const [expanded, setExpanded] = useState(false)

    // Build initial grant map from userGrants
    const initialGrants = Object.fromEntries(
        RBAC_MODULES.map((m) => [
            m,
            (member.userGrants.find((g) => g.module === m)?.mode as AccessMode) ?? 'none',
        ]),
    ) as Record<ModuleKey, AccessMode>

    const [grants, setGrants] = useState<Record<ModuleKey, AccessMode>>(initialGrants)
    const [dirty, setDirty] = useState(false)

    const mutation = useMutation({
        mutationFn: async () => {
            const payload = RBAC_MODULES.map((m) => ({ module: m, mode: grants[m] }))
            await api.guilds.updateMemberGrants(guildId, member.id, payload)
        },
        onSuccess: () => {
            toast.success(`Permissions saved for ${member.displayName}`)
            setDirty(false)
            void queryClient.invalidateQueries({ queryKey: ['members', guildId] })
        },
        onError: () => toast.error('Failed to save permissions'),
    })

    const setMode = useCallback((module: ModuleKey, mode: AccessMode) => {
        setGrants((prev) => ({ ...prev, [module]: mode }))
        setDirty(true)
    }, [])

    const hasCustomGrants = member.userGrants.length > 0

    return (
        <div className='border border-lucky-border rounded-lg overflow-hidden'>
            <button
                className='w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-lucky-bg-active/30 transition-colors text-left'
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
            >
                {/* Avatar */}
                {member.avatarUrl ? (
                    <img
                        src={member.avatarUrl}
                        alt=''
                        className='h-9 w-9 rounded-full object-cover shrink-0'
                    />
                ) : (
                    <div className='h-9 w-9 rounded-full bg-lucky-brand/20 text-lucky-brand flex items-center justify-center text-sm font-bold shrink-0'>
                        {avatarFallback(member.displayName)}
                    </div>
                )}

                {/* Name + roles */}
                <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2'>
                        <p className='type-body font-semibold text-lucky-text-primary truncate'>
                            {member.displayName}
                        </p>
                        {member.displayName !== member.username && (
                            <span className='type-meta text-lucky-text-tertiary truncate'>
                                @{member.username}
                            </span>
                        )}
                        {hasCustomGrants && (
                            <span className='inline-flex items-center gap-1 rounded-full bg-lucky-brand/15 border border-lucky-brand/25 px-2 py-0.5 text-[10px] font-bold text-lucky-brand shrink-0'>
                                <Shield className='h-2.5 w-2.5' />
                                Custom
                            </span>
                        )}
                    </div>
                    {member.roles.length > 0 && (
                        <div className='flex items-center gap-1.5 mt-1 flex-wrap'>
                            {member.roles.slice(0, 4).map((r) => (
                                <span
                                    key={r.id}
                                    className='type-meta px-1.5 py-0.5 rounded text-[10px]'
                                    style={{
                                        color: roleColor(r.color),
                                        backgroundColor: `${roleColor(r.color)}18`,
                                        borderColor: `${roleColor(r.color)}40`,
                                        border: '1px solid',
                                    }}
                                >
                                    {r.name}
                                </span>
                            ))}
                            {member.roles.length > 4 && (
                                <span className='type-meta text-lucky-text-tertiary'>
                                    +{member.roles.length - 4}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {expanded ? (
                    <ChevronUp className='h-4 w-4 text-lucky-text-tertiary shrink-0' />
                ) : (
                    <ChevronDown className='h-4 w-4 text-lucky-text-tertiary shrink-0' />
                )}
            </button>

            {expanded && (
                <div className='border-t border-lucky-border p-3 sm:p-4 space-y-3 bg-lucky-bg-secondary/40'>
                    <p className='type-meta text-lucky-text-tertiary'>
                        Individual permission overrides — these take precedence over role-based access.
                        Set a module to "No access" to use default role permissions.
                    </p>

                    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'>
                        {RBAC_MODULES.map((mod) => (
                            <div key={mod} className='flex flex-col gap-1'>
                                <span className='type-meta font-semibold text-lucky-text-secondary uppercase tracking-wide text-[10px]'>
                                    {MODULE_LABELS[mod]}
                                </span>
                                <div className='flex gap-1'>
                                    {(['none', 'view', 'manage'] as AccessMode[]).map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setMode(mod, mode)}
                                            className={cn(
                                                'flex-1 px-2 py-1.5 rounded border text-[11px] font-medium transition-all',
                                                grants[mod] === mode
                                                    ? MODE_COLORS[mode]
                                                    : 'text-lucky-text-tertiary border-lucky-border/50 bg-transparent hover:border-lucky-border hover:text-lucky-text-secondary',
                                            )}
                                        >
                                            {mode === 'none' ? 'Default' : MODE_LABELS[mode]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className='flex items-center justify-between pt-1'>
                        <button
                            onClick={() => {
                                const reset = Object.fromEntries(
                                    RBAC_MODULES.map((m) => [m, 'none']),
                                ) as Record<ModuleKey, AccessMode>
                                setGrants(reset)
                                setDirty(true)
                            }}
                            className='type-body-sm text-lucky-text-tertiary hover:text-red-400 transition-colors flex items-center gap-1'
                        >
                            <X className='h-3.5 w-3.5' />
                            Clear all overrides
                        </button>

                        <button
                            onClick={() => mutation.mutate()}
                            disabled={!dirty || mutation.isPending}
                            className='inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl btn-glass text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed'
                        >
                            <Check className='h-3.5 w-3.5' />
                            {mutation.isPending ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function MembersPage() {
    const { selectedGuild } = useGuildStore()
    const [search, setSearch] = useState('')

    const { data, isLoading } = useQuery({
        queryKey: ['members', selectedGuild?.id],
        queryFn: async () => {
            if (!selectedGuild?.id) throw new Error('No guild')
            const res = await api.guilds.getMembers(selectedGuild.id)
            return res.data
        },
        enabled: !!selectedGuild?.id,
        staleTime: 60_000,
    })

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Users className='h-10 w-10' />}
                title='Select a server'
                description='Choose a server from the sidebar to manage members.'
            />
        )
    }

    const members = data?.members ?? []
    const filtered = search
        ? members.filter(
              (m) =>
                  m.displayName.toLowerCase().includes(search.toLowerCase()) ||
                  m.username.toLowerCase().includes(search.toLowerCase()),
          )
        : members

    return (
        <div className='space-y-6'>
            <header>
                <p className='type-meta text-lucky-text-tertiary uppercase tracking-widest mb-1'>
                    Settings
                </p>
                <h1 className='type-h1 text-lucky-text-primary'>Members</h1>
                <p className='type-body text-lucky-text-secondary mt-1'>
                    Configure individual dashboard permissions for members of{' '}
                    <span className='text-lucky-text-primary font-semibold'>
                        {selectedGuild.name}
                    </span>
                    .
                </p>
            </header>

            <div className='relative'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-lucky-text-tertiary pointer-events-none' />
                <input
                    type='search'
                    placeholder='Search members…'
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className='w-full pl-9 pr-4 h-10 rounded-lg border border-lucky-border bg-lucky-bg-secondary text-lucky-text-primary placeholder:text-lucky-text-tertiary focus:outline-none focus:ring-2 focus:ring-lucky-brand/40 focus:border-lucky-brand/60 transition-colors type-body-sm'
                />
            </div>

            <div className='flex items-center justify-between'>
                <p className='type-meta text-lucky-text-tertiary'>
                    {isLoading ? 'Loading…' : `${filtered.length} member${filtered.length !== 1 ? 's' : ''}`}
                </p>
                {filtered.some((m) => m.userGrants.length > 0) && (
                    <span className='type-meta text-lucky-brand flex items-center gap-1'>
                        <Shield className='h-3 w-3' />
                        Custom overrides active
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className='space-y-2'>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className='flex items-center gap-3 p-4 border border-lucky-border rounded-lg'>
                            <Skeleton className='h-9 w-9 rounded-full shrink-0' />
                            <div className='flex-1 space-y-2'>
                                <Skeleton className='h-4 w-32' />
                                <Skeleton className='h-3 w-48' />
                            </div>
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={<Users className='h-10 w-10' />}
                    title={search ? 'No members found' : 'No members'}
                    description={
                        search
                            ? 'Try a different search term.'
                            : 'The bot needs to be in the server to list members.'
                    }
                />
            ) : (
                <div className='space-y-2'>
                    {filtered.map((member) => (
                        <MemberRow
                            key={member.id}
                            member={member}
                            guildId={selectedGuild.id}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
