import { useEffect, useRef } from 'react'
import { LABEL_COLORS } from '../ml/models'

export type OverlayMode = 'classes' | 'cutout' | 'photo'

interface MaskCanvasProps {
  image: ImageBitmap
  labels: Uint8Array | null
  maskWidth: number
  maskHeight: number
  mode: OverlayMode
}

export function MaskCanvas({ image, labels, maskWidth, maskHeight, mode }: MaskCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = image.width
    canvas.height = image.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!labels || mode === 'photo') {
      ctx.drawImage(image, 0, 0)
      return
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
    const maskCanvas = new OffscreenCanvas(maskWidth, maskHeight)
    maskCanvas.getContext('2d')?.putImageData(mask, 0, 0)

    if (mode === 'classes') {
      ctx.drawImage(image, 0, 0)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height)
    } else {
      // Cut-out: keep only the person; the checkerboard behind the canvas shows through.
      ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(image, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    }
  }, [image, labels, maskWidth, maskHeight, mode])

  return (
    <canvas
      ref={ref}
      className="w-full rounded-2xl bg-[repeating-conic-gradient(#d6d3d1_0%_25%,#fafaf9_0%_50%)] bg-[length:20px_20px]"
    />
  )
}
