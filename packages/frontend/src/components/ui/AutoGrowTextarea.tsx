import { useEffect, useRef, forwardRef } from 'react'

interface AutoGrowTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    minRows?: number
    maxRows?: number
}

const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
    (
        {
            minRows = 3,
            maxRows = 12,
            className = '',
            value,
            onChange,
            ...props
        },
        ref,
    ) => {
        const textareaRef = useRef<HTMLTextAreaElement>(null)

        useEffect(() => {
            const textarea =
                ref && typeof ref !== 'function'
                    ? ref.current
                    : textareaRef.current
            if (!textarea) return

            // Reset height to calculate scrollHeight
            textarea.style.height = 'auto'

            // Get line-height from computed styles
            const lineHeight = parseFloat(
                window.getComputedStyle(textarea).lineHeight,
            )

            // Calculate ideal height based on scrollHeight
            const scrollHeight = textarea.scrollHeight
            const minHeight = lineHeight * minRows
            const maxHeight = lineHeight * maxRows

            let newHeight = scrollHeight
            if (newHeight < minHeight) {
                newHeight = minHeight
            } else if (newHeight > maxHeight) {
                newHeight = maxHeight
            }

            textarea.style.height = `${newHeight}px`
            textarea.style.overflowY =
                scrollHeight > maxHeight ? 'auto' : 'hidden'
        }, [value, minRows, maxRows, ref])

        return (
            <textarea
                ref={ref || textareaRef}
                value={value}
                onChange={onChange}
                className={`resize-none rounded-md border border-vaded-border bg-vaded-bg-tertiary px-3 py-2 text-sm text-vaded-text-primary placeholder:text-vaded-text-tertiary focus:outline-none focus:ring-1 focus:ring-vaded-accent overflow-hidden ${className}`}
                style={{
                    minHeight: `calc(${minRows} * 1.5em + 1rem)`,
                }}
                {...props}
            />
        )
    },
)

AutoGrowTextarea.displayName = 'AutoGrowTextarea'

export default AutoGrowTextarea
