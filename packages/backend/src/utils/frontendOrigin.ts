const DEFAULT_FRONTEND_URL = 'http://localhost:5173'
const DEFAULT_PRODUCTION_FRONTEND_URLS = [
    'https://vaded-bot-dashboard.vercel.app',
    'https://vaded.gg',
]

export function getFrontendOrigins(): string[] {
    const configured = process.env.WEBAPP_FRONTEND_URL
    if (configured === undefined) {
        if (process.env.NODE_ENV === 'production') {
            return DEFAULT_PRODUCTION_FRONTEND_URLS
        }
        return [DEFAULT_FRONTEND_URL]
    }

    const origins = configured
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)

    if (origins.length > 0) {
        return origins
    }

    return [DEFAULT_FRONTEND_URL]
}

export function getPrimaryFrontendUrl(): string {
    return getFrontendOrigins()[0]
}
