import { useEffect, useRef } from 'react'

/**
 * Reusable custom-canvas particle field.
 *
 * Why a hand-rolled canvas instead of tsParticles: it ships zero extra
 * dependencies, renders a single <canvas> (cheap for the browser to
 * composite), and lets us cap particle counts precisely per surface so the
 * dashboard stays readable. Two presets are provided:
 *   - "heavy"  → landing hero (more particles + connection lines)
 *   - "subtle" → authenticated shell (fewer particles, lower opacity, no lines)
 *
 * Accessibility/perf notes:
 *   - Honors `prefers-reduced-motion`: paints one static frame, no RAF loop.
 *   - `pointer-events-none` + `aria-hidden` so it never intercepts input or
 *     reaches the accessibility tree.
 *   - Guards against a null 2D context (e.g. jsdom in tests) so it no-ops
 *     safely rather than throwing.
 */

type ParticleVariant = 'heavy' | 'subtle'

interface ParticleBackgroundProps {
    variant?: ParticleVariant
    className?: string
}

interface Particle {
    x: number
    y: number
    vx: number
    vy: number
    radius: number
    alpha: number
}

// Per-variant tuning. Counts stay within the brief's budget
// (<=150 landing, <=60 dashboard) and are density-scaled to viewport area
// so small screens don't get overloaded.
const VARIANT_CONFIG: Record<
    ParticleVariant,
    {
        maxCount: number
        density: number // particles per 1000px^2 of area
        baseAlpha: number
        drawLines: boolean
        linkDistance: number
        speed: number
    }
> = {
    heavy: {
        maxCount: 140,
        density: 0.00009,
        baseAlpha: 0.55,
        drawLines: true,
        linkDistance: 130,
        speed: 0.35,
    },
    subtle: {
        maxCount: 55,
        density: 0.00004,
        baseAlpha: 0.28,
        drawLines: false,
        linkDistance: 110,
        speed: 0.2,
    },
}

// Brand red (#ef4444 accent) so sparks read as embers drifting upward.
const PARTICLE_RGB = '239, 68, 68'

export default function ParticleBackground({
    variant = 'heavy',
    className,
}: ParticleBackgroundProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        // jsdom / unsupported contexts → bail out gracefully.
        if (!ctx) return

        const config = VARIANT_CONFIG[variant]
        const reduceMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
        ).matches

        let width = 0
        let height = 0
        let dpr = 1
        let particles: Particle[] = []
        let rafId = 0

        const createParticles = () => {
            const target = Math.min(
                config.maxCount,
                Math.round(width * height * config.density),
            )
            particles = Array.from({ length: target }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                // Mostly upward drift with slight lateral sway → floating embers.
                vx: (Math.random() - 0.5) * config.speed,
                vy: -(Math.random() * config.speed + config.speed * 0.3),
                radius: Math.random() * 1.6 + 0.6,
                alpha: Math.random() * 0.5 + 0.5,
            }))
        }

        const resize = () => {
            const parent = canvas.parentElement
            width = parent?.clientWidth ?? window.innerWidth
            height = parent?.clientHeight ?? window.innerHeight
            dpr = Math.min(window.devicePixelRatio || 1, 2) // cap DPR for perf
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            createParticles()
        }

        const draw = () => {
            ctx.clearRect(0, 0, width, height)

            // Connection lines first so dots sit on top of them.
            if (config.drawLines) {
                for (let i = 0; i < particles.length; i++) {
                    for (let j = i + 1; j < particles.length; j++) {
                        const a = particles[i]
                        const b = particles[j]
                        const dx = a.x - b.x
                        const dy = a.y - b.y
                        const dist = Math.hypot(dx, dy)
                        if (dist < config.linkDistance) {
                            const lineAlpha =
                                (1 - dist / config.linkDistance) *
                                0.18 *
                                config.baseAlpha
                            ctx.strokeStyle = `rgba(${PARTICLE_RGB}, ${lineAlpha})`
                            ctx.lineWidth = 0.6
                            ctx.beginPath()
                            ctx.moveTo(a.x, a.y)
                            ctx.lineTo(b.x, b.y)
                            ctx.stroke()
                        }
                    }
                }
            }

            for (const p of particles) {
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(${PARTICLE_RGB}, ${p.alpha * config.baseAlpha})`
                ctx.fill()
            }
        }

        const step = () => {
            for (const p of particles) {
                p.x += p.vx
                p.y += p.vy
                // Wrap around edges so the field stays populated.
                if (p.y < -10) {
                    p.y = height + 10
                    p.x = Math.random() * width
                }
                if (p.x < -10) p.x = width + 10
                if (p.x > width + 10) p.x = -10
            }
            draw()
            rafId = requestAnimationFrame(step)
        }

        resize()

        if (reduceMotion) {
            // Static single frame — respects the user's motion preference.
            draw()
        } else {
            rafId = requestAnimationFrame(step)
        }

        window.addEventListener('resize', resize)
        return () => {
            cancelAnimationFrame(rafId)
            window.removeEventListener('resize', resize)
        }
    }, [variant])

    return (
        <canvas
            ref={canvasRef}
            aria-hidden='true'
            className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`}
        />
    )
}
