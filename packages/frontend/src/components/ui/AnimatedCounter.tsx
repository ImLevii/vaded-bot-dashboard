import { useEffect, useRef } from 'react'
import {
    useInView,
    useMotionValue,
    useReducedMotion,
    useSpring,
} from 'framer-motion'

interface AnimatedCounterProps {
    /** Numeric target — the count animates from 0 to this value once in view. */
    value: number
    suffix?: string
    prefix?: string
    className?: string
}

/**
 * Counts up from 0 to `value` once scrolled into view, via a spring so it
 * settles rather than ticking linearly. Renders the final value immediately
 * under prefers-reduced-motion.
 */
export default function AnimatedCounter({
    value,
    suffix = '',
    prefix = '',
    className,
}: AnimatedCounterProps) {
    const ref = useRef<HTMLSpanElement>(null)
    const inView = useInView(ref, { once: true, margin: '-40px' })
    const prefersReducedMotion = useReducedMotion()
    const motionValue = useMotionValue(0)
    const spring = useSpring(motionValue, { stiffness: 90, damping: 20 })

    useEffect(() => {
        if (!inView) return
        motionValue.set(prefersReducedMotion ? value : value)
    }, [inView, value, motionValue, prefersReducedMotion])

    useEffect(() => {
        if (prefersReducedMotion) return
        const unsubscribe = spring.on('change', (latest) => {
            if (ref.current) {
                ref.current.textContent = `${prefix}${Math.round(latest).toLocaleString()}${suffix}`
            }
        })
        return unsubscribe
    }, [spring, prefix, suffix, prefersReducedMotion])

    return (
        <span ref={ref} className={className}>
            {prefersReducedMotion
                ? `${prefix}${value.toLocaleString()}${suffix}`
                : `${prefix}0${suffix}`}
        </span>
    )
}
