import { useEffect, useRef, useState } from 'react'
import {
    useInView,
    useMotionValue,
    useReducedMotion,
    useSpring,
} from 'framer-motion'

/**
 * Smoothly counts up to `value` the first time it scrolls into view.
 *
 * Uses framer-motion's `useMotionValue` + `useSpring` (per the brief) so the
 * number eases with spring physics rather than a linear tween. Only the
 * numeric portion animates — `prefix`/`suffix` (e.g. "K+", "/7") render
 * statically around it so values like "10K+" or "24/7" still work.
 *
 * Respects `prefers-reduced-motion` by rendering the final value immediately.
 */

interface AnimatedCounterProps {
    value: number
    prefix?: string
    suffix?: string
    className?: string
    /** Decimal places to preserve when formatting (default 0). */
    decimals?: number
}

export default function AnimatedCounter({
    value,
    prefix = '',
    suffix = '',
    className,
    decimals = 0,
}: AnimatedCounterProps) {
    const ref = useRef<HTMLSpanElement>(null)
    const inView = useInView(ref, { once: true, margin: '-40px' })
    const prefersReducedMotion = useReducedMotion()

    const motionValue = useMotionValue(0)
    const spring = useSpring(motionValue, {
        stiffness: 60,
        damping: 18,
        mass: 1,
    })
    const [display, setDisplay] = useState(0)

    // Kick off the count once when the element enters the viewport.
    useEffect(() => {
        if (!inView) return
        if (prefersReducedMotion) {
            setDisplay(value)
            return
        }
        motionValue.set(value)
    }, [inView, value, prefersReducedMotion, motionValue])

    // Mirror the spring's current value into React state for rendering.
    useEffect(() => {
        if (prefersReducedMotion) return
        const unsubscribe = spring.on('change', (latest) => {
            setDisplay(latest)
        })
        return unsubscribe
    }, [spring, prefersReducedMotion])

    const formatted =
        decimals > 0
            ? display.toFixed(decimals)
            : Math.round(display).toLocaleString()

    return (
        <span ref={ref} className={className}>
            {prefix}
            {formatted}
            {suffix}
        </span>
    )
}
