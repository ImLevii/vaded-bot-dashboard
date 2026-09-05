import {
    vgMusicBotRequest,
    vgMusicBotError,
    MUSIC_BOT_TIMEOUT_MS,
} from '../../../src/services/vgMusicBotClient'

describe('music bot HTTP client', () => {
    const originalFetch = global.fetch
    const originalUrl = process.env.VG_MUSIC_BOT_URL
    const originalToken = process.env.VG_MUSIC_BOT_TOKEN
    beforeEach(() => {
        process.env.VG_MUSIC_BOT_URL = 'http://music.example:25573'
        process.env.VG_MUSIC_BOT_TOKEN = 'test-token'
        global.fetch = jest.fn()
    })
    afterEach(() => {
        global.fetch = originalFetch
        if (originalUrl === undefined) delete process.env.VG_MUSIC_BOT_URL
        else process.env.VG_MUSIC_BOT_URL = originalUrl
        if (originalToken === undefined) delete process.env.VG_MUSIC_BOT_TOKEN
        else process.env.VG_MUSIC_BOT_TOKEN = originalToken
        jest.useRealTimers()
    })

    test('reports missing deployment settings without attempting a connection', async () => {
        delete process.env.VG_MUSIC_BOT_URL
        const res = await vgMusicBotRequest('/v1/info')
        expect(res.status).toBe(503)
        expect(res.error).toContain('VG_MUSIC_BOT_URL')
        expect(fetch).not.toHaveBeenCalled()
    })
    test('preserves upstream status and reason and clears the timeout', async () => {
        jest.useFakeTimers()
        jest.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: 'No healthy USA Lavalink servers available',
                }),
                { status: 503 },
            ),
        )
        const res = await vgMusicBotRequest('/v1/players')
        expect(vgMusicBotError(res)).toMatchObject({
            statusCode: 503,
            message: 'No healthy USA Lavalink servers available',
        })
        expect(jest.getTimerCount()).toBe(0)
    })
    test('sets authentication and a bounded abort signal on HTTPS requests', async () => {
        process.env.VG_MUSIC_BOT_URL = 'https://music.example'
        jest.mocked(fetch).mockResolvedValue(new Response('{}'))
        await vgMusicBotRequest('/v1/info', {
            headers: new Headers({ 'x-test': 'one' }),
        })
        const [url, init] = jest.mocked(fetch).mock.calls[0]
        expect(String(url)).toBe('https://music.example/v1/info')
        expect(new Headers(init?.headers).get('authorization')).toBe(
            'test-token',
        )
        expect(new Headers(init?.headers).get('x-test')).toBe('one')
        expect(init?.signal).toBeInstanceOf(AbortSignal)
        expect(init?.redirect).toBe('error')
    })
    test('aborts stalled connections and clears the timer', async () => {
        jest.useFakeTimers()
        jest.mocked(fetch).mockImplementation(
            (_url, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener(
                        'abort',
                        () => reject(new Error('aborted')),
                        { once: true },
                    )
                }),
        )
        const pending = vgMusicBotRequest('/v1/info')
        await jest.advanceTimersByTimeAsync(MUSIC_BOT_TIMEOUT_MS)
        expect(await pending).toMatchObject({ ok: false, status: 504 })
        expect(jest.getTimerCount()).toBe(0)
    })
    test('reports connection failures without leaking internal URLs or tokens', async () => {
        jest.mocked(fetch).mockRejectedValue(
            new Error('test-token at internal-address'),
        )
        const res = await vgMusicBotRequest('/v1/info')
        expect(res.status).toBe(502)
        expect(res.error).not.toContain('test-token')
        expect(res.error).not.toContain('internal-address')
    })
    test('upstream credential rejection does not invalidate the dashboard session', () => {
        expect(
            vgMusicBotError({
                ok: false,
                status: 401,
                body: { error: 'Unauthorized' },
            }),
        ).toMatchObject({
            statusCode: 502,
            message: expect.stringContaining('VG_MUSIC_BOT_TOKEN'),
        })
    })
})
