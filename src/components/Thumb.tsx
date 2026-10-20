import { useEffect, useRef, useState } from 'react'
import { useObjectUrl } from '../lib/useObjectUrl'

interface ThumbProps {
  blob: Blob | undefined
  alt?: string
  className?: string
  /** Load right away instead of when scrolled near (for the first screenful). */
  eager?: boolean
}

let observer: IntersectionObserver | null = null
const callbacks = new WeakMap<Element, () => void>()

/** One shared observer for every thumbnail; it starts loading ~1.5 screens ahead. */
function observe(el: Element, onVisible: () => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        callbacks.get(e.target)?.()
        observer?.unobserve(e.target)
        callbacks.delete(e.target)
      }
    },
    { rootMargin: '150% 0px' },
  )
  callbacks.set(el, onVisible)
  observer.observe(el)
  return () => {
    observer?.unobserve(el)
    callbacks.delete(el)
  }
}

/**
 * A small stored thumbnail (never a full-size image). The object URL is created only when the
 * element nears the viewport and revoked on unmount or when the blob changes; the browser decodes
 * asynchronously and can drop decoded pixels of off-screen images.
 */
export function Thumb({ blob, alt = '', className = '', eager = false }: ThumbProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => eager || typeof IntersectionObserver === 'undefined')
  const url = useObjectUrl(visible ? blob : null)

  useEffect(() => {
    const el = ref.current
    if (visible || !el) return
    return observe(el, () => {
      setVisible(true)
    })
  }, [visible])

  return (
    <div ref={ref} className={`flex items-center justify-center overflow-hidden ${className}`}>
      {url && (
        <img src={url} alt={alt} decoding="async" draggable={false} className="max-h-full max-w-full object-contain" />
      )}
    </div>
  )
}
