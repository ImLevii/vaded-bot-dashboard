import type { Transition, Variants } from 'framer-motion'

/**
 * Shared Framer Motion variants for the maximalist red-brand redesign.
 * Every consumer should pair these with `useReducedMotion()` and swap to the
 * `*Reduced` variant (or `initial={false}`) when it's true — none of these
 * bake the reduced-motion check in themselves, since the right fallback
 * differs per component (some just skip the transform, some skip entirely).
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const

export const fadeUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: EASE_OUT },
    },
}

export const fadeUpReduced: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
}

export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.25 } },
}

export const scaleIn: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: { type: 'spring', stiffness: 300, damping: 26 },
    },
}

/** Container for staggered children — pair with `fadeUp` on each child. */
export const staggerContainer = (staggerChildren = 0.08): Variants => ({
    hidden: {},
    visible: {
        transition: { staggerChildren, delayChildren: 0.05 },
    },
})

export const cardHover = {
    y: -4,
    scale: 1.01,
    transition: { type: 'spring', stiffness: 400, damping: 25 } as Transition,
}

export const buttonHover = {
    scale: 1.03,
    transition: { type: 'spring', stiffness: 400, damping: 20 } as Transition,
}

export const buttonTap = { scale: 0.97 }

/** Route-level page transition — wrap pages in `AnimatePresence` to use exit. */
export const pageTransition: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: EASE_OUT },
    },
    exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

/** Gentle up/down drift for floating illustrations/mockups. */
export const floatLoop: Variants = {
    animate: {
        y: [0, -8, 0],
        transition: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
    },
}

/** Breathing scale/opacity pulse for "live" status dots. */
export const breathingPulse: Variants = {
    animate: {
        scale: [1, 1.2, 1],
        opacity: [1, 0.6, 1],
        transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
    },
}
