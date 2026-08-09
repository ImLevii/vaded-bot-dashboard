import type { Request } from 'express'

const getForwardedHeader = (
    req: Request,
    headerName: string,
): string | undefined => {
    const value = req.headers[headerName]
    if (!value) return undefined
    const raw = Array.isArray(value) ? value[0] : value
    return raw.split(',')[0].trim() || undefined
}

const normalizeCallbackPath = (redirectUri?: string): string | undefined => {
    if (!redirectUri) return undefined

    try {
        const parsed = new URL(redirectUri)
        if (parsed.pathname === '/auth/callback') {
            parsed.pathname = '/api/auth/callback'
        }
        return parsed.toString()
    } catch {
        return undefined
    }
}

const buildRequestRedirectUri = (req: Request): string => {
    const forwardedProto = getForwardedHeader(req, 'x-forwarded-proto')
    const forwardedHost = getForwardedHeader(req, 'x-forwarded-host')
    const protocol =
        process.env.NODE_ENV === 'production'
            ? 'https'
            : (forwardedProto ?? req.protocol ?? 'http')
    const host =
        forwardedHost ??
        req.get('host') ??
        `localhost:${process.env.WEBAPP_PORT ?? '3000'}`

    return `${protocol}://${host}/api/auth/callback`
}

const hasForwardedHost = (req: Request): boolean => {
    return getForwardedHeader(req, 'x-forwarded-host') !== undefined
}

const resolveEnvRedirectUri = (): string | undefined => {
    const normalized = normalizeCallbackPath(process.env.WEBAPP_REDIRECT_URI)
    if (!normalized) return undefined

    return normalized
}

const shouldForceEnvRedirectUri = (): boolean => {
    return process.env.WEBAPP_REDIRECT_URI_FORCE === 'true'
}

export function getOAuthRedirectUri(
    req: Request,
    sessionRedirectUri?: string,
): string {
    const normalizedSessionRedirectUri =
        normalizeCallbackPath(sessionRedirectUri)

    if (normalizedSessionRedirectUri) {
        return normalizedSessionRedirectUri
    }

    if (shouldForceEnvRedirectUri()) {
        return resolveEnvRedirectUri() ?? buildRequestRedirectUri(req)
    }

    // When traffic is proxied (Vercel/Cloudflare), always trust the forwarded
    // host for callback origin so stale env values cannot pin OAuth to an old
    // public domain.
    if (hasForwardedHost(req)) {
        return buildRequestRedirectUri(req)
    }

    return resolveEnvRedirectUri() ?? buildRequestRedirectUri(req)
}
