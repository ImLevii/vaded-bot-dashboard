import { useCallback, useEffect, useMemo, useState } from 'react'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import type { ISourceOptions } from '@tsparticles/engine'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

let enginePromise: Promise<void> | null = null

/** Shared, memoized engine init — `loadSlim` only needs to run once per page. */
function useParticlesEngine() {
    const [ready, setReady] = useState(false)

    useEffect(() => {
        if (!enginePromise) {
            enginePromise = initParticlesEngine(async (engine) => {
                await loadSlim(engine)
            })
        }
        let mounted = true
        enginePromise.then(() => {
            if (mounted) setReady(true)
        })
        return () => {
            mounted = false
        }
    }, [])

    return ready
}

interface ParticleBackgroundProps {
    /** `landing` = full-intensity hero field. `dashboard` = subtle ambient layer that never competes with data. */
    variant?: 'landing' | 'dashboard'
    className?: string
}

/**
 * Red-tinted particle field. Landing gets up to 150 drifting sparks with
 * occasional link lines; dashboard gets a much sparser, lower-opacity layer
 * (<=60) so it reads as ambience, not noise, behind real data. Skips
 * animation entirely under prefers-reduced-motion — particles render static.
 */
export default function ParticleBackground({
    variant = 'landing',
    className,
}: ParticleBackgroundProps) {
    const ready = useParticlesEngine()
    const prefersReducedMotion = useReducedMotion()
    const isDashboard = variant === 'dashboard'

    const options = useMemo<ISourceOptions>(
        () => ({
            fullScreen: { enable: false },
            fpsLimit: 60,
            detectRetina: true,
            background: { color: { value: 'transparent' } },
            particles: {
                number: {
                    value: isDashboard ? 40 : 120,
                    density: { enable: true, width: 1200, height: 800 },
                },
                color: { value: ['#dc2626', '#ef4444', '#f87171'] },
                opacity: {
                    value: isDashboard ? 0.25 : 0.55,
                },
                size: { value: { min: 1, max: isDashboard ? 2 : 3 } },
                links: {
                    enable: !isDashboard,
                    color: '#dc2626',
                    distance: 130,
                    opacity: 0.12,
                    width: 1,
                },
                move: {
                    enable: !prefersReducedMotion,
                    direction: 'top',
                    speed: isDashboard ? 0.3 : 0.6,
                    outModes: { default: 'out' },
                    random: true,
                    straight: false,
                },
            },
            interactivity: {
                events: {
                    onHover: { enable: false },
                    onClick: { enable: false },
                },
            },
        }),
        [isDashboard, prefersReducedMotion],
    )

    const particlesLoaded = useCallback(async () => {}, [])

    if (!ready) return null

    return (
        <Particles
            id={`vaded-particles-${variant}`}
            className={cn('particle-layer', className)}
            options={options}
            particlesLoaded={particlesLoaded}
            aria-hidden='true'
        />
    )
}
