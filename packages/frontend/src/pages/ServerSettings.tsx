import { reportError } from '@/lib/sentry'
import {
    useState,
    useEffect,
    useCallback,
    useRef,
    useMemo,
    type ReactElement,
} from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
    Settings,
    Save,
    Loader2,
    Hash,
    Globe,
    Clock,
    UserCog,
    Bell,
    AlertTriangle,
    Plus,
    Shield,
    RotateCcw,
    X,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import {
    RBAC_MODULES,
    type RoleGrant,
    type ServerSettings,
    type GuildChannelOption,
    type GuildRoleOption,
} from '@/types'

const TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
]

type SettingsLoadErrorKind = 'auth' | 'forbidden' | 'network' | 'upstream'

type SettingsLoadError = {
    kind: SettingsLoadErrorKind
    message: string
}

const DEFAULT_SETTINGS: ServerSettings = {
    nickname: '',
    commandPrefix: '!',
    managerRoles: [],
    updatesChannel: '',
    timezone: 'UTC',
    disableWarnings: false,
}

function classifySettingsLoadError(
    error: unknown,
    t: (key: string) => string,
): SettingsLoadError {
    if (error instanceof ApiError) {
        if (error.status === 401) {
            return {
                kind: 'auth',
                message: t('serverSettings.sessionExpired'),
            }
        }

        if (error.status === 403) {
            return {
                kind: 'forbidden',
                message: t('serverSettings.accessDenied'),
            }
        }

        if (error.status === 0) {
            return {
                kind: 'network',
                message: t('serverSettings.networkError'),
            }
        }

        return {
            kind: 'upstream',
            message: error.message || t('serverSettings.unableToLoadMessage'),
        }
    }

    if (error instanceof Error) {
        return { kind: 'upstream', message: error.message }
    }

    return {
        kind: 'upstream',
        message: t('serverSettings.unableToLoadMessage'),
    }
}

export default function ServerSettingsPage() {
    const { t } = useTranslation()
    const { selectedGuild, memberContext } = useGuildStore()
    const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)
    const [settingsLoadError, setSettingsLoadError] =
        useState<SettingsLoadError | null>(null)
    const [saving, setSaving] = useState(false)
    const [rbacLoading, setRbacLoading] = useState(false)
    const [rbacSaving, setRbacSaving] = useState(false)
    const [rbacRolesError, setRbacRolesError] = useState<string | null>(null)
    const [rbacRoles, setRbacRoles] = useState<
        Array<{ id: string; name: string }>
    >([])
    const [rbacGrants, setRbacGrants] = useState<RoleGrant[]>([])
    const [channels, setChannels] = useState<GuildChannelOption[]>([])
    const [managerRoleOptions, setManagerRoleOptions] = useState<
        GuildRoleOption[]
    >([])
    const rbacRequestIdRef = useRef(0)
    const settingsRequestVersion = useRef(0)

    const canManageRbac =
        memberContext?.canManageRbac ?? selectedGuild?.canManageRbac ?? false

    const loadRbac = useCallback(async (guildId: string) => {
        const requestId = rbacRequestIdRef.current + 1
        rbacRequestIdRef.current = requestId
        setRbacLoading(true)
        setRbacRolesError(null)
        try {
            const res = await api.guilds.getRbac(guildId)
            if (requestId !== rbacRequestIdRef.current) {
                return
            }
            setRbacRoles(res.data.roles)
            setRbacGrants(res.data.grants)
            if (res.data.roles.length === 0) {
                setRbacRolesError(t('serverSettings.noAssignableRoles'))
            }
        } catch (error) {
            reportError('Failed to load server roles:', error, {
                component: 'ServerSettings',
                action: 'loadRbacRoles',
            })
            if (requestId !== rbacRequestIdRef.current) {
                return
            }
            const detailsMessage =
                error instanceof ApiError
                    ? error.message
                    : 'Failed to load role options for access rules.'
            setRbacRoles([])
            setRbacGrants([])
            setRbacRolesError(detailsMessage)
            toast.error(detailsMessage)
        } finally {
            if (requestId === rbacRequestIdRef.current) {
                setRbacLoading(false)
            }
        }
    }, [])

    const loadSettings = useCallback(async (guildId: string) => {
        const requestVersion = ++settingsRequestVersion.current
        const isStaleRequest = () =>
            requestVersion !== settingsRequestVersion.current

        setLoading(true)
        setSettingsLoadError(null)

        try {
            const response = await api.guilds.getSettings(guildId)
            if (isStaleRequest()) {
                return
            }
            const raw = response.data.settings
            setSettings({
                nickname: raw?.nickname ?? DEFAULT_SETTINGS.nickname,
                commandPrefix: raw?.commandPrefix ?? DEFAULT_SETTINGS.commandPrefix,
                managerRoles: raw?.managerRoles ?? DEFAULT_SETTINGS.managerRoles,
                updatesChannel: raw?.updatesChannel ?? DEFAULT_SETTINGS.updatesChannel,
                timezone: raw?.timezone ?? DEFAULT_SETTINGS.timezone,
                disableWarnings: raw?.disableWarnings ?? DEFAULT_SETTINGS.disableWarnings,
            })
        } catch (error) {
            if (isStaleRequest()) {
                return
            }
            setSettings(DEFAULT_SETTINGS)
            setSettingsLoadError(classifySettingsLoadError(error, t))
        } finally {
            if (!isStaleRequest()) {
                setLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        if (!selectedGuild?.id) {
            return
        }

        void loadSettings(selectedGuild.id)
    }, [selectedGuild?.id, loadSettings])

    useEffect(() => {
        if (!selectedGuild?.id || !canManageRbac) {
            rbacRequestIdRef.current += 1
            setRbacRoles([])
            setRbacGrants([])
            setRbacRolesError(null)
            return
        }

        loadRbac(selectedGuild.id)
    }, [selectedGuild?.id, canManageRbac, loadRbac])

    useEffect(() => {
        if (!selectedGuild?.id) return
        let mounted = true

        api.guilds
            .getChannels(selectedGuild.id)
            .then((res) => {
                if (mounted) setChannels(res.data.channels)
            })
            .catch(() => {
                if (mounted) setChannels([])
            })
        api.guilds
            .getRbac(selectedGuild.id)
            .then((res) => {
                if (mounted) setManagerRoleOptions(res.data.roles)
            })
            .catch(() => {
                if (mounted) setManagerRoleOptions([])
            })

        return () => {
            mounted = false
        }
    }, [selectedGuild?.id])

    const update = <K extends keyof ServerSettings>(
        key: K,
        value: ServerSettings[K],
    ) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
    }

    const handleSave = async () => {
        if (!selectedGuild?.id) return
        setSaving(true)
        try {
            // Explicitly pick only the 6 schema-allowed keys — extra DB fields
            // (id, guildId, createdAt…) in the state cause Zod .strict() to 400.
            const { nickname, commandPrefix, managerRoles, updatesChannel, timezone, disableWarnings } = settings
            const payload: ServerSettings = {
                nickname: nickname ?? '',
                commandPrefix: commandPrefix ?? '!',
                managerRoles: managerRoles ?? [],
                updatesChannel: updatesChannel ?? '',
                timezone: timezone ?? 'UTC',
                disableWarnings: disableWarnings ?? false,
            }
            await api.guilds.updateSettings(selectedGuild.id, payload)
            toast.success(t('serverSettings.settingsSaved'))
        } catch {
            toast.error(t('serverSettings.settingsSaveFailed'))
        } finally {
            setSaving(false)
        }
    }

    // Role-centric model: Map<roleId, Map<module, mode>>
    const roleGrantMap = useMemo(() => {
        const map = new Map<string, Map<string, 'view' | 'manage' | 'none'>>()
        for (const g of rbacGrants) {
            let mods = map.get(g.roleId)
            if (!mods) { mods = new Map(); map.set(g.roleId, mods) }
            mods.set(g.module, g.mode)
        }
        return map
    }, [rbacGrants])

    // All unique roleIds currently in grants (ordered by first appearance)
    const grantedRoleIds = useMemo(() => {
        const seen = new Set<string>()
        const out: string[] = []
        for (const g of rbacGrants) {
            if (!seen.has(g.roleId)) { seen.add(g.roleId); out.push(g.roleId) }
        }
        return out
    }, [rbacGrants])

    const addRbacGrant = () => {
        if (rbacLoading) { toast.error(t('serverSettings.stillLoadingRoles')); return }
        if (rbacRoles.length === 0) { toast.error(rbacRolesError ?? t('serverSettings.roleOptionsNotAvailable')); return }
        const unusedRole = rbacRoles.find((r) => !grantedRoleIds.includes(r.id))
        if (!unusedRole) { toast.info('All roles already have permission rules.'); return }
        // add one placeholder grant so the role appears
        setRbacGrants((prev) => [...prev, { roleId: unusedRole.id, module: 'overview', mode: 'view' }])
    }

    const setRoleModuleMode = (roleId: string, module: string, mode: 'view' | 'manage' | 'none') => {
        setRbacGrants((prev) => {
            // remove existing entry for this role+module
            const filtered = prev.filter((g) => !(g.roleId === roleId && g.module === module))
            if (mode === 'none') return filtered
            return [...filtered, { roleId, module: module as RoleGrant['module'], mode }]
        })
    }

    const removeRoleGrants = (roleId: string) => {
        setRbacGrants((prev) => prev.filter((g) => g.roleId !== roleId))
    }

    const handleSaveRbac = async () => {
        if (!selectedGuild?.id || !canManageRbac) {
            return
        }

        setRbacSaving(true)
        try {
            const response = await api.guilds.updateRbac(
                selectedGuild.id,
                rbacGrants,
            )
            setRbacGrants(response.data.grants)
            toast.success(t('serverSettings.accessControlSaved'))
        } catch {
            toast.error(t('serverSettings.accessControlFailed'))
        } finally {
            setRbacSaving(false)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Settings className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    {t('serverSettings.noServerSelected')}
                </h2>
                <p className='type-body text-lucky-text-secondary'>
                    {t('serverSettings.selectServerDescription')}
                </p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className='space-y-6'>
                <div>
                    <Skeleton className='h-8 w-48 mb-2' />
                    <Skeleton className='h-4 w-72' />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className='p-5 space-y-4'>
                        <Skeleton className='h-5 w-32' />
                        <Skeleton className='h-10 w-full' />
                        <Skeleton className='h-10 w-full' />
                    </Card>
                ))}
            </div>
        )
    }

    if (settingsLoadError) {
        return (
            <div className='space-y-6'>
                <header>
                    <h1 className='type-h1 text-lucky-text-primary'>
                        {t('serverSettings.title')}
                    </h1>
                    <p className='type-body text-lucky-text-secondary mt-1'>
                        {t('serverSettings.description', {
                            name: selectedGuild.name,
                        })}
                    </p>
                </header>
                <Card className='p-5 space-y-4'>
                    <div className='flex items-center gap-2 text-lucky-yellow'>
                        <AlertTriangle className='w-5 h-5' />
                        <h2 className='type-title text-lucky-text-primary'>
                            {t('serverSettings.unableToLoadTitle')}
                        </h2>
                    </div>
                    <p className='type-body text-lucky-text-secondary'>
                        {settingsLoadError.message}
                    </p>
                    <div className='flex items-center gap-3'>
                        <Button
                            type='button'
                            onClick={() => {
                                if (!selectedGuild?.id) {
                                    return
                                }
                                void loadSettings(selectedGuild.id)
                            }}
                        >
                            {t('serverSettings.retryButtonLabel')}
                        </Button>
                        {(settingsLoadError.kind === 'auth' ||
                            settingsLoadError.kind === 'forbidden') && (
                            <a
                                href={api.auth.getDiscordLoginUrl()}
                                className='type-body-sm text-lucky-text-secondary hover:text-lucky-text-primary'
                            >
                                {t('serverSettings.reAuthenticateLink')}
                            </a>
                        )}
                    </div>
                </Card>
            </div>
        )
    }

    let rbacContent: ReactElement
    if (!canManageRbac) {
        rbacContent = (
            <div className='rounded-xl border border-lucky-border bg-lucky-bg-tertiary/50 p-4'>
                <p className='type-body text-lucky-text-secondary'>
                    {t('serverSettings.rbacCannotManage')}
                </p>
            </div>
        )
    } else if (rbacLoading) {
        rbacContent = (
            <div className='space-y-3'>
                {['rbac-skeleton-1', 'rbac-skeleton-2', 'rbac-skeleton-3'].map(
                    (skeletonKey) => (
                        <Skeleton key={skeletonKey} className='h-12 w-full' />
                    ),
                )}
            </div>
        )
    } else {
        rbacContent = (
            <div className='space-y-3'>
                {rbacRolesError && (
                    <div className='rounded-xl border border-lucky-border bg-lucky-bg-tertiary/50 p-3 type-body-sm text-lucky-text-secondary'>
                        <div className='flex items-center justify-between gap-3'>
                            <span>{rbacRolesError}</span>
                            {selectedGuild?.id && (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='ghost'
                                    className='gap-2'
                                    onClick={() => {
                                        loadRbac(selectedGuild.id)
                                    }}
                                >
                                    <RotateCcw className='w-4 h-4' />
                                    {t('serverSettings.retryRoles')}
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* Legend */}
                {grantedRoleIds.length > 0 && (
                    <div className='flex items-center gap-4 px-1 type-meta text-lucky-text-tertiary'>
                        <span className='flex items-center gap-1.5'>
                            <span className='inline-block w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-500/30' />
                            View — read-only access
                        </span>
                        <span className='flex items-center gap-1.5'>
                            <span className='inline-block w-3 h-3 rounded-sm bg-lucky-brand/20 border border-lucky-brand/30' />
                            Manage — full read + write access
                        </span>
                        <span className='flex items-center gap-1.5'>
                            <span className='inline-block w-3 h-3 rounded-sm bg-lucky-bg-active border border-lucky-border' />
                            None — no access (role default)
                        </span>
                    </div>
                )}

                {grantedRoleIds.length === 0 ? (
                    <p className='type-body-sm text-lucky-text-tertiary'>
                        {t('serverSettings.noRbacRules')}
                    </p>
                ) : (
                    grantedRoleIds.map((roleId) => {
                        const role = rbacRoles.find((r) => r.id === roleId)
                        const roleName = role?.name ?? roleId
                        const mods = roleGrantMap.get(roleId) ?? new Map()
                        return (
                            <div
                                key={roleId}
                                className='surface-card border border-lucky-border overflow-hidden'
                            >
                                {/* Role header */}
                                <div className='flex items-center justify-between gap-3 px-4 py-2.5 border-b border-lucky-border bg-lucky-bg-secondary/40'>
                                    <div className='flex items-center gap-2'>
                                        <Shield className='w-3.5 h-3.5 text-lucky-brand shrink-0' />
                                        <Select
                                            value={roleId}
                                            onValueChange={(newRoleId) => {
                                                if (newRoleId === roleId) return
                                                setRbacGrants((prev) =>
                                                    prev.map((g) =>
                                                        g.roleId === roleId
                                                            ? { ...g, roleId: newRoleId }
                                                            : g,
                                                    ),
                                                )
                                            }}
                                        >
                                            <SelectTrigger className='h-7 border-0 bg-transparent p-0 shadow-none text-lucky-text-primary font-semibold type-body-sm focus:ring-0 w-auto gap-1.5'>
                                                <SelectValue>{roleName}</SelectValue>
                                            </SelectTrigger>
                                            <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                                {rbacRoles.map((r) => (
                                                    <SelectItem key={r.id} value={r.id}>
                                                        {r.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <button
                                        type='button'
                                        onClick={() => removeRoleGrants(roleId)}
                                        className='text-lucky-text-tertiary hover:text-red-400 transition-colors p-1 rounded'
                                        title='Remove all permissions for this role'
                                    >
                                        <X className='w-4 h-4' />
                                    </button>
                                </div>

                                {/* Module matrix */}
                                <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-lucky-border/50'>
                                    {RBAC_MODULES.map((mod) => {
                                        const current = (mods.get(mod) ?? 'none') as 'view' | 'manage' | 'none'
                                        const moduleLabel: Record<string, string> = {
                                            overview: 'Overview',
                                            settings: 'Settings',
                                            moderation: 'Moderation',
                                            automation: 'Automation',
                                            music: 'Music',
                                            integrations: 'Integrations',
                                        }
                                        return (
                                            <div key={mod} className='flex flex-col gap-1.5 p-3'>
                                                <span className='type-meta text-lucky-text-secondary font-semibold uppercase tracking-wide text-[10px]'>
                                                    {moduleLabel[mod] ?? mod}
                                                </span>
                                                <div className='flex flex-col gap-1'>
                                                    {(['none', 'view', 'manage'] as const).map((mode) => (
                                                        <button
                                                            key={mode}
                                                            type='button'
                                                            onClick={() => setRoleModuleMode(roleId, mod, mode)}
                                                            className={`px-2 py-1 rounded text-[11px] font-medium border transition-all text-left ${
                                                                current === mode
                                                                    ? mode === 'manage'
                                                                        ? 'bg-lucky-brand/20 border-lucky-brand/40 text-lucky-brand'
                                                                        : mode === 'view'
                                                                          ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                                                                          : 'bg-lucky-bg-active border-lucky-border text-lucky-text-secondary'
                                                                    : 'bg-transparent border-transparent text-lucky-text-tertiary hover:bg-lucky-bg-active/50 hover:border-lucky-border'
                                                            }`}
                                                        >
                                                            {mode === 'none' ? 'None' : mode === 'view' ? 'View' : 'Manage'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        )
    }

    const availableManagerRoles = managerRoleOptions.filter(
        (r) => !(settings.managerRoles ?? []).includes(r.id),
    )
    const getManagerRoleName = (id: string) =>
        managerRoleOptions.find((r) => r.id === id)?.name ?? id

    return (
        <div className='space-y-6 lg:pb-0 pb-24'>
            <SectionHeader
                eyebrow={t('serverSettings.eyebrow')}
                title={t('serverSettings.title')}
                description={t('serverSettings.description', {
                    name: selectedGuild.name,
                })}
                actions={
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className='gap-2'
                    >
                        {saving ? (
                            <Loader2 className='w-4 h-4 animate-spin' />
                        ) : (
                            <Save className='w-4 h-4' />
                        )}
                        {t('serverSettings.saveChanges')}
                    </Button>
                }
            />

            {/* General Settings */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0 }}
            >
                <Card className='p-5 space-y-5 border border-lucky-border'>
                    <div className='flex items-center gap-2'>
                        <Settings className='w-5 h-5 text-lucky-text-secondary' />
                        <h2 className='type-title text-lucky-text-primary'>
                            {t('serverSettings.general')}
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <UserCog className='w-3 h-3' />{' '}
                                {t('serverSettings.botNickname')}
                            </Label>
                            <Input
                                value={settings.nickname}
                                onChange={(e) =>
                                    update('nickname', e.target.value)
                                }
                                placeholder={t(
                                    'serverSettings.botNicknamePlaceholder',
                                )}
                                className='bg-lucky-bg-tertiary border-lucky-border text-white'
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Hash className='w-3 h-3' />{' '}
                                {t('serverSettings.commandPrefix')}
                            </Label>
                            <Input
                                value={settings.commandPrefix}
                                onChange={(e) =>
                                    update('commandPrefix', e.target.value)
                                }
                                placeholder={t(
                                    'serverSettings.commandPrefixPlaceholder',
                                )}
                                maxLength={3}
                                className='bg-lucky-bg-tertiary border-lucky-border text-white w-24'
                            />
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Timezone & Notifications */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
            >
                <Card className='p-5 space-y-5 border border-lucky-border'>
                    <div className='flex items-center gap-2'>
                        <Globe className='w-5 h-5 text-lucky-text-secondary' />
                        <h2 className='type-title text-lucky-text-primary'>
                            {t('serverSettings.regionNotifications')}
                        </h2>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Clock className='w-3 h-3' />{' '}
                                {t('serverSettings.timezone')}
                            </Label>
                            <Select
                                value={settings.timezone}
                                onValueChange={(v: string) =>
                                    update('timezone', v)
                                }
                            >
                                <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border text-white'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    {TIMEZONES.map((tz) => (
                                        <SelectItem key={tz} value={tz}>
                                            {tz}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className='space-y-2'>
                            <Label className='type-meta text-lucky-text-secondary flex items-center gap-1.5'>
                                <Bell className='w-3 h-3' />{' '}
                                {t('serverSettings.updatesChannel')}
                            </Label>
                            {channels.length > 0 ? (
                                <Select
                                    value={
                                        settings.updatesChannel || '__none__'
                                    }
                                    onValueChange={(v: string) =>
                                        update(
                                            'updatesChannel',
                                            v === '__none__' ? '' : v,
                                        )
                                    }
                                >
                                    <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border text-white'>
                                        <SelectValue
                                            placeholder={t(
                                                'serverSettings.selectChannelPlaceholder',
                                            )}
                                        />
                                    </SelectTrigger>
                                    <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                        <SelectItem value='__none__'>
                                            <span className='text-lucky-text-tertiary'>
                                                {t('serverSettings.none')}
                                            </span>
                                        </SelectItem>
                                        {channels.map((ch) => (
                                            <SelectItem
                                                key={ch.id}
                                                value={ch.id}
                                            >
                                                <span className='flex items-center gap-2'>
                                                    <Hash className='w-3 h-3 text-lucky-text-tertiary' />
                                                    {ch.name}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    value={settings.updatesChannel}
                                    onChange={(e) =>
                                        update('updatesChannel', e.target.value)
                                    }
                                    placeholder={t(
                                        'serverSettings.channelIdPlaceholder',
                                    )}
                                    className='bg-lucky-bg-tertiary border-lucky-border text-white'
                                />
                            )}
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Manager Roles */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
            >
                <Card className='p-5 space-y-4 border border-lucky-border'>
                    <div className='flex items-center gap-2'>
                        <Shield className='w-5 h-5 text-lucky-text-secondary' />
                        <div>
                            <h2 className='type-title text-lucky-text-primary'>
                                {t('serverSettings.managerRoles')}
                            </h2>
                            <p className='type-meta text-lucky-text-tertiary mt-0.5 uppercase tracking-wide font-semibold'>
                                {t('serverSettings.managerRolesDescription')}
                            </p>
                        </div>
                    </div>
                    {managerRoleOptions.length > 0 &&
                        availableManagerRoles.length > 0 && (
                            <Select
                                onValueChange={(id: string) => {
                                    update('managerRoles', [
                                        ...(settings.managerRoles ?? []),
                                        id,
                                    ])
                                }}
                            >
                                <SelectTrigger className='bg-lucky-bg-tertiary border-lucky-border text-white h-9 text-sm'>
                                    <SelectValue
                                        placeholder={t(
                                            'serverSettings.addManagerRolePlaceholder',
                                        )}
                                    />
                                </SelectTrigger>
                                <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                    {[...new Map(availableManagerRoles.map((r) => [r.id, r])).values()].map((role) => (
                                        <SelectItem
                                            key={role.id}
                                            value={role.id}
                                        >
                                            {role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    {(settings.managerRoles ?? []).length > 0 ? (
                        <div className='flex flex-wrap gap-2'>
                            {(settings.managerRoles ?? []).map((id) => (
                                <Badge
                                    key={id}
                                    className='bg-lucky-brand/15 border border-lucky-brand/40 text-lucky-text-primary text-xs gap-1.5 px-2.5 py-1.5 hover:bg-lucky-brand/20 transition-colors'
                                >
                                    <Shield className='w-3 h-3 text-lucky-brand' />
                                    <span className='font-medium'>
                                        {getManagerRoleName(id)}
                                    </span>
                                    <button
                                        onClick={() =>
                                            update(
                                                'managerRoles',
                                                (
                                                    settings.managerRoles ?? []
                                                ).filter((r) => r !== id),
                                            )
                                        }
                                        className='ml-0.5 hover:text-lucky-error transition-colors'
                                        aria-label='Remove role'
                                    >
                                        <X className='w-3 h-3' />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className='type-body-sm text-lucky-text-tertiary'>
                            {t('serverSettings.noManagerRoles')}
                        </p>
                    )}
                </Card>
            </motion.div>

            {/* Warnings Toggle */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <Card className='p-5 border border-lucky-border'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2 rounded-lg bg-yellow-500/15'>
                                <AlertTriangle className='w-4 h-4 text-yellow-400' />
                            </div>
                            <div>
                                <h3 className='type-body-sm font-semibold text-lucky-text-primary'>
                                    {t('serverSettings.disableCommandWarnings')}
                                </h3>
                                <p className='type-meta text-lucky-text-tertiary mt-0.5 uppercase tracking-wide font-semibold'>
                                    {t(
                                        'serverSettings.disableWarningsDescription',
                                    )}
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.disableWarnings}
                            onCheckedChange={(v: boolean) =>
                                update('disableWarnings', v)
                            }
                        />
                    </div>
                </Card>
            </motion.div>

            {/* Mobile Save Bar */}
            <div className='lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-lucky-bg-primary/95 backdrop-blur-sm border-t border-lucky-border z-30'>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className='w-full btn-glass rounded-xl text-white gap-2'
                >
                    {saving ? (
                        <Loader2 className='w-4 h-4 animate-spin' />
                    ) : (
                        <Save className='w-4 h-4' />
                    )}
                    {t('serverSettings.saveChanges')}
                </Button>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <Card className='p-5 space-y-5 border border-lucky-border'>
                    <div className='flex items-center justify-between gap-4'>
                        <div className='flex items-center gap-3'>
                            <div className='p-2 rounded-lg bg-lucky-brand/10'>
                                <Shield className='w-5 h-5 text-lucky-brand' />
                            </div>
                            <div>
                                <h2 className='type-title text-lucky-text-primary'>
                                    {t('serverSettings.accessControl')}
                                </h2>
                                <p className='type-body-sm text-lucky-text-tertiary mt-0.5 uppercase tracking-wide font-semibold'>
                                    {t(
                                        'serverSettings.accessControlDescription',
                                    )}
                                </p>
                            </div>
                        </div>
                        {canManageRbac && (
                            <div className='flex items-center gap-2'>
                                <Button
                                    type='button'
                                    onClick={addRbacGrant}
                                    variant='secondary'
                                    className='gap-2'
                                    disabled={rbacLoading}
                                    title={
                                        !rbacLoading && rbacRoles.length === 0
                                            ? (rbacRolesError ??
                                              t(
                                                  'serverSettings.noAssignableRoles',
                                              ))
                                            : undefined
                                    }
                                >
                                    <Plus className='w-4 h-4' />
                                    {t('serverSettings.addRuleLabel')}
                                </Button>
                                <Button
                                    type='button'
                                    onClick={handleSaveRbac}
                                    disabled={rbacSaving || rbacLoading}
                                    className='gap-2 btn-glass rounded-xl text-white'
                                >
                                    {rbacSaving ? (
                                        <Loader2 className='w-4 h-4 animate-spin' />
                                    ) : (
                                        <Save className='w-4 h-4' />
                                    )}
                                    {t('serverSettings.saveAccessControl')}
                                </Button>
                            </div>
                        )}
                    </div>

                    {rbacContent}
                </Card>
            </motion.div>
        </div>
    )
}
