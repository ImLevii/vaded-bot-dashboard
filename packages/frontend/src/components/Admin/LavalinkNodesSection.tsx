import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
    Server,
    Cpu,
    MemoryStick,
    Users,
    Plus,
    Trash2,
    ArrowRightLeft,
} from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { api, type LavalinkNodeInfo } from '@/services/api'

const POLL_INTERVAL_MS = 5000

function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 MB'
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

function formatUptime(ms: number): string {
    const minutes = Math.floor(ms / 60000)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ${minutes % 60}m`
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
}

function NodeRow({
    node,
    onRemove,
    onSwitch,
    removing,
}: {
    node: LavalinkNodeInfo
    onRemove: (name: string) => void
    onSwitch: (name: string, guildId: string) => void
    removing: boolean
}) {
    const [guildId, setGuildId] = useState('')

    return (
        <div className='rounded-lg border border-vaded-border bg-vaded-bg-secondary/60 px-4 py-3 space-y-3'>
            <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vaded-bg-tertiary'>
                    <Server className='h-5 w-5 text-vaded-text-subtle' />
                </div>
                <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium text-vaded-text-primary'>
                        {node.name}
                    </p>
                    <p className='text-xs text-vaded-text-subtle'>
                        {node.host}:{node.port} {node.secure ? '(TLS)' : ''}
                        {node.driver ? ` · ${node.driver}` : ''}
                    </p>
                </div>
                <Badge variant={node.online ? 'success' : 'error'}>
                    {node.state}
                </Badge>
                <Button
                    variant='destructive'
                    size='sm'
                    onClick={() => onRemove(node.name)}
                    loading={removing}
                    aria-label={`Remove node ${node.name}`}
                >
                    <Trash2 className='h-4 w-4' />
                </Button>
            </div>

            {node.stats && (
                <div className='flex flex-wrap items-center gap-4 text-xs text-vaded-text-secondary'>
                    <span className='flex items-center gap-1'>
                        <Users className='h-3.5 w-3.5' />
                        {node.stats.playingPlayers}/{node.stats.players} playing
                    </span>
                    <span className='flex items-center gap-1'>
                        <Cpu className='h-3.5 w-3.5' />
                        {(node.stats.cpuLavalinkLoad * 100).toFixed(1)}% load
                    </span>
                    <span className='flex items-center gap-1'>
                        <MemoryStick className='h-3.5 w-3.5' />
                        {formatBytes(node.stats.memoryUsed)} /{' '}
                        {formatBytes(node.stats.memoryReservable)}
                    </span>
                    <span>uptime {formatUptime(node.stats.uptime)}</span>
                </div>
            )}

            <div className='flex items-center gap-2'>
                <Input
                    placeholder='Guild ID to move here'
                    value={guildId}
                    onChange={(e) => setGuildId(e.target.value)}
                    className='h-8 max-w-xs'
                />
                <Button
                    variant='secondary'
                    size='sm'
                    disabled={!guildId.trim() || !node.online}
                    onClick={() => {
                        onSwitch(node.name, guildId.trim())
                        setGuildId('')
                    }}
                >
                    <ArrowRightLeft className='h-3.5 w-3.5' />
                    Switch here
                </Button>
            </div>
        </div>
    )
}

function AddNodeForm({
    onAdd,
    adding,
}: {
    onAdd: (node: {
        name: string
        host: string
        port: number
        auth: string
        secure: boolean
    }) => void
    adding: boolean
}) {
    const [name, setName] = useState('')
    const [host, setHost] = useState('')
    const [port, setPort] = useState('')
    const [auth, setAuth] = useState('')
    const [secure, setSecure] = useState(false)

    const canSubmit = name.trim() && host.trim() && port.trim() && auth.trim()

    return (
        <form
            className='grid grid-cols-2 gap-2 rounded-lg border border-vaded-border bg-vaded-bg-secondary/40 p-4 sm:grid-cols-5'
            onSubmit={(e) => {
                e.preventDefault()
                if (!canSubmit) return
                onAdd({
                    name: name.trim(),
                    host: host.trim(),
                    port: Number(port),
                    auth: auth.trim(),
                    secure,
                })
                setName('')
                setHost('')
                setPort('')
                setAuth('')
                setSecure(false)
            }}
        >
            <Input
                placeholder='Name'
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
            <Input
                placeholder='Host'
                value={host}
                onChange={(e) => setHost(e.target.value)}
            />
            <Input
                placeholder='Port'
                type='number'
                value={port}
                onChange={(e) => setPort(e.target.value)}
            />
            <Input
                placeholder='Password'
                value={auth}
                onChange={(e) => setAuth(e.target.value)}
            />
            <div className='flex items-center gap-3'>
                <label className='flex items-center gap-1.5 text-xs text-vaded-text-secondary'>
                    <Checkbox
                        checked={secure}
                        onCheckedChange={(v) => setSecure(v === true)}
                    />
                    Secure
                </label>
                <Button
                    type='submit'
                    size='sm'
                    disabled={!canSubmit}
                    loading={adding}
                >
                    <Plus className='h-3.5 w-3.5' />
                    Add
                </Button>
            </div>
        </form>
    )
}

export default function LavalinkNodesSection() {
    const [nodes, setNodes] = useState<LavalinkNodeInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [removingName, setRemovingName] = useState<string | null>(null)

    const load = useCallback(() => {
        return api.admin.lavalink
            .getNodes()
            .then((res) => setNodes(res.data))
            .catch(() => setError('Failed to load Lavalink nodes.'))
    }, [])

    useEffect(() => {
        load().finally(() => setLoading(false))
        const interval = setInterval(load, POLL_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [load])

    const handleAdd = (node: {
        name: string
        host: string
        port: number
        auth: string
        secure: boolean
    }) => {
        setAdding(true)
        api.admin.lavalink
            .addNode(node)
            .then(() => {
                toast.success(`Node "${node.name}" added`)
                return load()
            })
            .catch((err: Error) =>
                toast.error(err.message || 'Failed to add node'),
            )
            .finally(() => setAdding(false))
    }

    const handleRemove = (name: string) => {
        setRemovingName(name)
        api.admin.lavalink
            .removeNode(name)
            .then(() => {
                toast.success(`Node "${name}" removed`)
                return load()
            })
            .catch((err: Error) =>
                toast.error(err.message || 'Failed to remove node'),
            )
            .finally(() => setRemovingName(null))
    }

    const handleSwitch = (name: string, guildId: string) => {
        api.admin.lavalink
            .switchNode(name, guildId)
            .then(() => toast.success(`Moved guild ${guildId} to "${name}"`))
            .catch((err: Error) =>
                toast.error(err.message || 'Failed to switch node'),
            )
    }

    return (
        <section>
            <div className='flex items-center gap-2 mb-4'>
                <Server
                    className='w-5 h-5 text-vaded-purple'
                    aria-hidden='true'
                />
                <h2 className='text-lg font-semibold text-white'>
                    Lavalink Nodes
                </h2>
                {!loading && (
                    <span className='ml-1 rounded-full bg-vaded-bg-tertiary px-2 py-0.5 text-xs text-vaded-text-secondary'>
                        {nodes.filter((n) => n.online).length}/{nodes.length}{' '}
                        online
                    </span>
                )}
            </div>

            {loading && (
                <div className='space-y-2'>
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className='h-16 w-full' />
                    ))}
                </div>
            )}

            {error && <p className='text-sm text-vaded-red'>{error}</p>}

            {!loading && !error && (
                <div className='space-y-4'>
                    {nodes.length === 0 ? (
                        <p className='text-sm text-vaded-text-secondary'>
                            No Lavalink nodes configured.
                        </p>
                    ) : (
                        <div className='space-y-2'>
                            {nodes.map((node) => (
                                <NodeRow
                                    key={node.name}
                                    node={node}
                                    onRemove={handleRemove}
                                    onSwitch={handleSwitch}
                                    removing={removingName === node.name}
                                />
                            ))}
                        </div>
                    )}
                    <AddNodeForm onAdd={handleAdd} adding={adding} />
                </div>
            )}
        </section>
    )
}
