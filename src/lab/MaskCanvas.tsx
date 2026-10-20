import { useEffect, useMemo, useRef } from 'react'
import { ViewportCanvas, type ViewportHandle } from '../components/ViewportCanvas'
import { LABEL_COLORS } from '../ml/models'

export type OverlayMode = 'classes' | 'cutout' | 'photo'

interface MaskCanvasProps {
  image: ImageBitmap
  labels: Uint8Array | null
  maskWidth: number
  maskHeight: number
  mode: OverlayMode
}

/** Lab result view: class overlay or cut-out, with pinch-zoom / pan / double-tap to fit. */
export function MaskCanvas({ image, labels, maskWidth, maskHeight, mode }: MaskCanvasProps) {
  const viewport = useRef<ViewportHandle>(null)

  const composed = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas
    if (!labels || mode === 'photo') {
      ctx.drawImage(image, 0, 0)
      return canvas
    }
    const mask = new ImageData(maskWidth, maskHeight)
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i] ?? 0
      const o = i * 4
      if (mode === 'classes') {
        const [r, g, b] = LABEL_COLORS[label] ?? [0, 0, 0]
        mask.data[o] = r
        mask.data[o + 1] = g
        mask.data[o + 2] = b
        mask.data[o + 3] = label === 0 ? 0 : 150
      } else {
        mask.data[o + 3] = label === 0 ? 0 : 255
      }
    }
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = maskWidth
    maskCanvas.height = maskHeight
    maskCanvas.getContext('2d')?.putImageData(mask, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    if (mode === 'classes') {
      ctx.drawImage(image, 0, 0)
      ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height)
    } else {
      ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(image, 0, 0)
    }
    return canvas
  }, [image, labels, maskWidth, maskHeight, mode])

  useEffect(() => {
    viewport.current?.invalidate()
  }, [composed])

  return (
    <div
      className="aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[repeating-conic-gradient(#d6d3d1_0%_25%,#fafaf9_0%_50%)] bg-[length:20px_20px]"
    >
      <ViewportCanvas
        ref={viewport}
        contentWidth={image.width}
        contentHeight={image.height}
        draw={(ctx) => {
          ctx.drawImage(composed, 0, 0)
        }}
      />
    </div>
  )
}
