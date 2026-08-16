import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, X, Code, Plus, Pencil, Trash2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import Skeleton from '@/components/ui/Skeleton'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'
import type { CustomCommand } from '@/types'
import { useTranslation } from 'react-i18next'

/**
 * Tokens the bot substitutes at execution time. Keep in sync with
 * packages/bot/src/handlers/customCommands/placeholders.ts.
 */
const PLACEHOLDERS = [
    '{user}',
    '{user.name}',
    '{server}',
    '{memberCount}',
    '{channel}',
]

/** Discord slash command names: lowercase, digits, dash, underscore. */
const NAME_PATTERN = /^[a-z0-9_-]{1,32}$/

interface CommandFormProps {
    open: boolean
    initial?: CustomCommand
    onSave: (data: {
        name: string
        response: string
        description?: string
    }) => Promise<void>
    onClose: () => void
}

function CommandFormDialog({
    open,
    initial,
    onSave,
    onClose,
}: CommandFormProps) {
    const isEdit = Boolean(initial)
    const [name, setName] = useState('')
    const [response, setResponse] = useState('')
    const [description, setDescription] = useState('')
    const [saving, setSaving] = useState(false)
    const [nameError, setNameError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setName(initial?.name ?? '')
        setResponse(initial?.response ?? '')
        setDescription(initial?.description ?? '')
        setNameError(null)
    }, [open, initial])

    const handleSubmit = async () => {
        const trimmedName = name.trim().toLowerCase()
        // Validate before the round-trip: Discord rejects uppercase and
        // spaces outright, and a 400 here is much less useful than inline text.
        if (!isEdit && !NAME_PATTERN.test(trimmedName)) {
            setNameError(
                'Use 1-32 lowercase letters, numbers, dashes or underscores.',
            )
            return
        }
        if (!response.trim()) return

        setSaving(true)
        try {
            await onSave({
                name: trimmedName,
                response: response.trim(),
                description: description.trim() || undefined,
            })
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? 'Edit Command' : 'New Command'}
                    </DialogTitle>
                </DialogHeader>

                <div className='space-y-4'>
                    <div className='space-y-1.5'>
                        <Label htmlFor='cmd-name'>Command name</Label>
                        <Input
                            id='cmd-name'
                            value={name}
                            disabled={isEdit}
                            placeholder='gg'
                            onChange={(e) => {
                                setName(e.target.value)
                                setNameError(null)
                            }}
                        />
                        {isEdit ? (
                            <p className='text-xs text-vaded-text-tertiary'>
                                Renaming is not supported — delete and recreate.
                            </p>
                        ) : (
                            <p
                                className={cn(
                                    'text-xs',
                                    nameError
                                        ? 'text-vaded-error'
                                        : 'text-vaded-text-tertiary',
                                )}
                            >
                                {nameError ??
                                    'Members will run this as a slash command.'}
                            </p>
                        )}
                    </div>

                    <div className='space-y-1.5'>
                        <Label htmlFor='cmd-description'>
                            Description (optional)
                        </Label>
                        <Input
                            id='cmd-description'
                            value={description}
                            placeholder='Shown in the Discord command picker'
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div className='space-y-1.5'>
                        <Label htmlFor='cmd-response'>Response</Label>
                        <textarea
                            id='cmd-response'
                            value={response}
                            onChange={(e) => setResponse(e.target.value)}
                            rows={4}
                            className='w-full rounded-md bg-vaded-bg-tertiary border border-vaded-border p-2 text-sm text-white'
                            placeholder='gg {user}! Welcome to {server}.'
                        />
                        <p className='text-xs text-vaded-text-tertiary'>
                            Placeholders: {PLACEHOLDERS.join(' ')}
                        </p>
                    </div>
                </div>

                <div className='flex justify-end gap-2 pt-2'>
                    <Button variant='secondary' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={saving || !response.trim() || !name.trim()}
                    >
                        {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default function CustomCommandsPage() {
    const { t } = useTranslation()
    const { selectedGuild } = useGuildStore()
    const [commands, setCommands] = useState<CustomCommand[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<CustomCommand | undefined>()

    const guildId = selectedGuild?.id

    const load = useCallback(async () => {
        if (!guildId) return
        setLoading(true)
        try {
            const res = await api.commands.list(guildId)
            setCommands(res.data.commands ?? [])
        } catch {
            setCommands([])
        } finally {
            setLoading(false)
        }
    }, [guildId])

    useEffect(() => {
        void load()
    }, [load])

    const filtered = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return commands
        return commands.filter(
            (cmd) =>
                cmd.name.toLowerCase().includes(query) ||
                // description is nullable in the DB; the old page called
                // .toLowerCase() on it unguarded and crashed the list.
                (cmd.description ?? '').toLowerCase().includes(query) ||
                (cmd.response ?? '').toLowerCase().includes(query),
        )
    }, [commands, searchQuery])

    const reportError = (error: unknown, fallback: string) => {
        toast.error(error instanceof ApiError ? error.message : fallback)
    }

    const handleToggle = async (cmd: CustomCommand) => {
        if (!guildId) return
        const next = !cmd.enabled
        // Optimistic, reverted on failure — the row is keyed by name, which is
        // what the backend route uses.
        setCommands((prev) =>
            prev.map((c) => (c.id === cmd.id ? { ...c, enabled: next } : c)),
        )
        try {
            await api.commands.toggle(guildId, cmd.name, next)
            toast.success(`/${cmd.name} ${next ? 'enabled' : 'disabled'}`)
        } catch (error) {
            setCommands((prev) =>
                prev.map((c) =>
                    c.id === cmd.id ? { ...c, enabled: cmd.enabled } : c,
                ),
            )
            reportError(error, 'Failed to toggle command')
        }
    }

    const handleSave = async (data: {
        name: string
        response: string
        description?: string
    }) => {
        if (!guildId) return
        try {
            if (editing) {
                await api.commands.update(guildId, editing.name, {
                    response: data.response,
                    description: data.description,
                })
                toast.success(`/${editing.name} updated`)
            } else {
                await api.commands.create(guildId, data)
                toast.success(`/${data.name} created — live in Discord now`)
            }
            await load()
        } catch (error) {
            reportError(error, 'Failed to save command')
            throw error
        }
    }

    const handleDelete = async (cmd: CustomCommand) => {
        if (!guildId) return
        try {
            await api.commands.remove(guildId, cmd.name)
            setCommands((prev) => prev.filter((c) => c.id !== cmd.id))
            toast.success(`/${cmd.name} deleted`)
        } catch (error) {
            reportError(error, 'Failed to delete command')
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Code className='w-16 h-16 text-vaded-text-tertiary mb-4' />
                <h2 className='type-h2 text-vaded-text-primary mb-2'>
                    {t('customCommands.noServerSelected')}
                </h2>
                <p className='text-vaded-text-secondary text-sm'>
                    {t('customCommands.selectServerToManage')}
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex items-start justify-between gap-4'>
                <header>
                    <h1 className='type-h1 text-vaded-text-primary'>
                        {t('customCommands.title')}
                    </h1>
                    <p className='text-sm text-vaded-text-secondary mt-1'>
                        {t('customCommands.subtitle', {
                            name: selectedGuild.name,
                        })}
                    </p>
                </header>
                <Button
                    className='gap-2 shrink-0'
                    onClick={() => {
                        setEditing(undefined)
                        setDialogOpen(true)
                    }}
                >
                    <Plus className='w-4 h-4' />
                    New Command
                </Button>
            </div>

            <div className='surface-panel rounded-lg p-4 border border-vaded-border'>
                <div className='relative'>
                    <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vaded-text-tertiary' />
                    <Input
                        placeholder={t(
                            'customCommands.searchCommandsPlaceholder',
                        )}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='pl-9 bg-vaded-bg-tertiary border-vaded-border text-vaded-text-primary'
                    />
                    {searchQuery && (
                        <button
                            aria-label='Clear search'
                            onClick={() => setSearchQuery('')}
                            className='absolute right-3 top-1/2 -translate-y-1/2 text-vaded-text-tertiary hover:text-vaded-text-primary'
                        >
                            <X className='w-4 h-4' />
                        </button>
                    )}
                </div>
            </div>

            <div className='space-y-1'>
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className='surface-panel rounded-lg p-4 border border-vaded-border flex items-center gap-3'
                        >
                            <Skeleton className='w-8 h-8 rounded' />
                            <div className='flex-1'>
                                <Skeleton className='h-4 w-40 mb-2' />
                                <Skeleton className='h-3 w-60' />
                            </div>
                            <Skeleton className='w-10 h-6 rounded' />
                        </div>
                    ))
                ) : filtered.length > 0 ? (
                    filtered.map((cmd) => (
                        <Card
                            key={cmd.id}
                            className={cn(
                                'p-4 border border-vaded-border flex items-center gap-3',
                                !cmd.enabled && 'opacity-60',
                            )}
                        >
                            <div className='p-2 rounded bg-vaded-bg-active shrink-0'>
                                <Code className='w-4 h-4 text-vaded-text-secondary' />
                            </div>
                            <div className='flex-1 min-w-0'>
                                <div className='flex items-center gap-2 mb-1'>
                                    <h3 className='type-body-sm font-semibold text-vaded-text-primary truncate'>
                                        /{cmd.name}
                                    </h3>
                                    <Badge className='text-[10px] uppercase border shrink-0 bg-vaded-bg-active text-vaded-text-secondary border-vaded-border'>
                                        {cmd.useCount} uses
                                    </Badge>
                                </div>
                                <p className='text-xs text-vaded-text-tertiary line-clamp-1'>
                                    {cmd.description ||
                                        cmd.response ||
                                        'No response configured'}
                                </p>
                            </div>
                            <div className='flex items-center gap-2 shrink-0'>
                                <Switch
                                    checked={cmd.enabled}
                                    aria-label={`Toggle ${cmd.name}`}
                                    onCheckedChange={() => handleToggle(cmd)}
                                />
                                <button
                                    aria-label={`Edit ${cmd.name}`}
                                    onClick={() => {
                                        setEditing(cmd)
                                        setDialogOpen(true)
                                    }}
                                    className='p-2 rounded hover:bg-vaded-bg-active text-vaded-text-tertiary hover:text-vaded-text-primary'
                                >
                                    <Pencil className='w-4 h-4' />
                                </button>
                                <button
                                    aria-label={`Delete ${cmd.name}`}
                                    onClick={() => void handleDelete(cmd)}
                                    className='p-2 rounded hover:bg-vaded-error/10 text-vaded-text-tertiary hover:text-vaded-error'
                                >
                                    <Trash2 className='w-4 h-4' />
                                </button>
                            </div>
                        </Card>
                    ))
                ) : (
                    <div className='surface-panel rounded-lg p-12 border border-vaded-border text-center'>
                        <Code className='w-12 h-12 text-vaded-text-tertiary mx-auto mb-3' />
                        <p className='text-sm text-vaded-text-secondary mb-1'>
                            {t('customCommands.noCommandsFound')}
                        </p>
                        <p className='text-xs text-vaded-text-tertiary'>
                            {searchQuery
                                ? t('customCommands.tryAdjustingFilters')
                                : t('customCommands.commandsWillAppearHere')}
                        </p>
                    </div>
                )}
            </div>

            <CommandFormDialog
                open={dialogOpen}
                initial={editing}
                onSave={handleSave}
                onClose={() => {
                    setDialogOpen(false)
                    setEditing(undefined)
                }}
            />
        </div>
    )
}
