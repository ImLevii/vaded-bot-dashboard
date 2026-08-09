import { describe, expect, test } from 'vitest'
import { inferApiBase } from './apiBase'

describe('inferApiBase', () => {
    test('uses configured VITE_API_BASE_URL when provided', () => {
        const result = inferApiBase('https://custom.example.com/api', {
            protocol: 'https:',
            hostname: 'vadedgaming.com',
        })

        expect(result).toBe('https://custom.example.com/api')
    })

    test.each([
        {
            hostname: 'vadedgaming.com',
            expected: '/api',
        },
        {
            hostname: 'unknown-host.example.com',
            expected: '/api',
        },
    ])(
        'infers API base for $hostname',
        ({ hostname, expected }) => {
            const result = inferApiBase(undefined, {
                protocol: 'https:',
                hostname,
            })

            expect(result).toBe(expected)
        },
    )

    test('falls back to /api when location is unavailable', () => {
        expect(inferApiBase()).toBe('/api')
    })
})
