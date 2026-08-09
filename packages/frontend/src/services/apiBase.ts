type ApiLocation = {
    protocol: string
    hostname: string
}

function isManagedFrontendHost(hostname: string): boolean {
    return (
        hostname === 'vaded-bot-dashboard.vercel.app' ||
        hostname === 'vadedgaming.com' ||
        hostname.endsWith('.vadedgaming.com')
    )
}

export function inferApiBase(
    configuredApiBase?: string,
    location?: ApiLocation,
): string {
    const configured = configuredApiBase?.trim()
    if (configured) {
        return configured
    }

    const hostname = location?.hostname
    if (!hostname) {
        return '/api'
    }

    if (isManagedFrontendHost(hostname)) {
        return '/api'
    }

    return '/api'
}
