import type { Response } from 'express'

export function param(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export const sseClients = new Map<string, Set<Response>>()
