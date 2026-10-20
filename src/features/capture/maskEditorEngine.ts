import type { ViewportHandle, ViewportTool } from '../../components/ViewportCanvas'
import type { LandmarkName, PoseLandmarks } from '../../domain/types'
import type { Point } from '../../lib/gesture/similarity'
import { History } from '../../lib/history'
import { featherAlpha } from '../../lib/mask/ops'
import { decodeRLE, encodeRLE } from '../../lib/mask/rle'

export type BrushMode = 'add' | 'erase'

export interface MaskEditorState {
  mode: BrushMode
  brushSize: number // screen px, so the brush feels the same at any zoom
  showPose: boolean
  preview: boolean // checkerboard + soft edges instead of the editing view
  feather: number
}

const SKELETON: [LandmarkName, LandmarkName][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
]

const DOT_DELAY_MS = 330 // a single tap paints a dot, unless it turns out to be a double-tap
const UNDO_STEPS = 30

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D unavailable')
  return { canvas, ctx }
}

/**
 * Imperative brush editor for a binary mask over a photo, kept outside React so pointer moves never
 * re-render. The mask lives in a canvas (alpha = in/out) so painting is GPU-cheap; after each stroke
 * it is snapped to 0/1 and stored run-length encoded in the undo history.
 */
export class MaskEditorEngine {
  readonly width: number
  readonly height: number
  private viewport: ViewportHandle | null = null
  private onHistoryChange: ((canUndo: boolean, canRedo: boolean) => void) | null = null

  private readonly photo: ImageBitmap
  private readonly landmarks: PoseLandmarks
  private readonly maskLayer: ReturnType<typeof makeCanvas>
  private readonly cutoutLayer: ReturnType<typeof makeCanvas>
  private dirty = true
  private readonly history: History<Uint32Array>
  private state: MaskEditorState
  private stroke: { start: Point; painted: boolean } | null = null
  private cursor: Point | null = null
  private pendingDot: number | null = null
  private preview: { canvas: HTMLCanvasElement; feather: number } | null = null

  constructor(photo: ImageBitmap, initialMask: Uint8Array, landmarks: PoseLandmarks, state: MaskEditorState) {
    this.photo = photo
    this.width = photo.width
    this.height = photo.height
    this.landmarks = landmarks
    this.state = state
    this.maskLayer = makeCanvas(this.width, this.height)
    this.cutoutLayer = makeCanvas(this.width, this.height)
    this.history = new History(encodeRLE(initialMask), UNDO_STEPS)
    this.writeMask(initialMask)
  }

  attach(viewport: ViewportHandle | null, onHistoryChange: (canUndo: boolean, canRedo: boolean) => void) {
    this.viewport = viewport
    this.onHistoryChange = onHistoryChange
    this.emitHistory()
  }

  setState(state: MaskEditorState) {
    this.state = state
    if (!state.preview) this.preview = null
    else if (this.preview?.feather !== state.feather) this.preview = { canvas: this.buildPreview(state.feather), feather: state.feather }
    this.viewport?.invalidate()
  }

  emitHistory() {
    this.onHistoryChange?.(this.history.canUndo, this.history.canRedo)
  }

  undo() {
    const s = this.history.undo()
    if (s) this.restore(s)
    this.emitHistory()
  }

  redo() {
    const s = this.history.redo()
    if (s) this.restore(s)
    this.emitHistory()
  }

  /** Current mask as 0/1. */
  getMask(): Uint8Array {
    const img = this.maskLayer.ctx.getImageData(0, 0, this.width, this.height)
    const out = new Uint8Array(this.width * this.height)
    for (let i = 0; i < out.length; i++) out[i] = (img.data[i * 4 + 3] ?? 0) >= 128 ? 1 : 0
    return out
  }

  dispose() {
    this.cancelPendingDot()
  }

  readonly cancelPendingDot = () => {
    if (this.pendingDot !== null) window.clearTimeout(this.pendingDot)
    this.pendingDot = null
  }

  readonly tool: ViewportTool = {
    onStart: (p) => {
      this.cancelPendingDot()
      this.stroke = { start: p, painted: false }
      this.cursor = p
    },
    onMove: (p, prev) => {
      const s = this.stroke
      if (!s) return
      if (!s.painted) {
        this.paint(s.start, s.start)
        s.painted = true
      }
      this.paint(prev, p)
      this.cursor = p
    },
    onEnd: (p, { tap }) => {
      const s = this.stroke
      this.stroke = null
      this.cursor = null
      if (s?.painted) {
        this.commit()
      } else if (tap) {
        this.pendingDot = window.setTimeout(() => {
          this.pendingDot = null
          this.paint(p, p)
          this.commit()
        }, DOT_DELAY_MS)
      }
      this.viewport?.invalidate()
    },
    onCancel: () => {
      // A second finger arrived: this was a pinch, not a stroke.
      if (this.stroke?.painted) this.restore(this.history.current)
      this.stroke = null
      this.cursor = null
    },
  }

  readonly draw = (ctx: CanvasRenderingContext2D) => {
    const { width, height } = this
    const s = this.state
    if (s.preview && this.preview) {
      drawCheckerboard(ctx, width, height)
      ctx.drawImage(this.preview.canvas, 0, 0)
    } else {
      if (this.dirty) {
        const c = this.cutoutLayer.ctx
        c.globalCompositeOperation = 'source-over'
        c.clearRect(0, 0, width, height)
        c.drawImage(this.maskLayer.canvas, 0, 0)
        c.globalCompositeOperation = 'source-in'
        c.drawImage(this.photo, 0, 0)
        this.dirty = false
      }
      ctx.fillStyle = '#1c1917'
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 0.3 // removed areas stay faintly visible so you can paint them back
      ctx.drawImage(this.photo, 0, 0)
      ctx.globalAlpha = 1
      ctx.drawImage(this.cutoutLayer.canvas, 0, 0)
    }

    const scale = this.viewport?.scale() ?? 1
    if (s.showPose) drawPose(ctx, this.landmarks, width, height, scale)
    const c = this.cursor
    if (c && !s.preview) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, s.brushSize / 2 / scale, 0, Math.PI * 2)
      ctx.lineWidth = 1.5 / scale
      ctx.strokeStyle = s.mode === 'add' ? '#22c55e' : '#ef4444'
      ctx.stroke()
    }
  }

  private paint(from: Point, to: Point) {
    const ctx = this.maskLayer.ctx
    ctx.save()
    ctx.globalCompositeOperation = this.state.mode === 'add' ? 'source-over' : 'destination-out'
    ctx.strokeStyle = '#fff'
    ctx.lineCap = 'round'
    ctx.lineWidth = this.state.brushSize / (this.viewport?.scale() ?? 1)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.restore()
    this.dirty = true
    this.viewport?.invalidate()
  }

  private commit() {
    const mask01 = this.getMask()
    this.writeMask(mask01)
    this.history.push(encodeRLE(mask01))
    this.emitHistory()
  }

  private restore(rle: Uint32Array) {
    this.writeMask(decodeRLE(rle, this.width * this.height))
  }

  private writeMask(mask01: Uint8Array) {
    const { ctx } = this.maskLayer
    const img = ctx.createImageData(this.width, this.height)
    for (let i = 0; i < mask01.length; i++) {
      const o = i * 4
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255
      img.data[o + 3] = mask01[i] ? 255 : 0
    }
    ctx.putImageData(img, 0, 0)
    this.dirty = true
    this.viewport?.invalidate()
  }

  private buildPreview(feather: number): HTMLCanvasElement {
    const alpha = featherAlpha(this.getMask(), this.width, this.height, feather)
    const { canvas, ctx } = makeCanvas(this.width, this.height)
    ctx.drawImage(this.photo, 0, 0)
    const img = ctx.getImageData(0, 0, this.width, this.height)
    for (let i = 0; i < alpha.length; i++) img.data[i * 4 + 3] = alpha[i] ?? 0
    ctx.putImageData(img, 0, 0)
    return canvas
  }
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = Math.max(8, Math.round(Math.max(w, h) / 60))
  ctx.fillStyle = '#e7e5e4'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fafaf9'
  for (let y = 0; y < h; y += size) {
    for (let x = (y / size) % 2 ? size : 0; x < w; x += size * 2) ctx.fillRect(x, y, size, size)
  }
}

function drawPose(ctx: CanvasRenderingContext2D, lm: PoseLandmarks, w: number, h: number, scale: number) {
  ctx.lineWidth = 3 / scale
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)'
  for (const [a, b] of SKELETON) {
    const p = lm[a]
    const q = lm[b]
    if (!p || !q) continue
    ctx.beginPath()
    ctx.moveTo(p.x * w, p.y * h)
    ctx.lineTo(q.x * w, q.y * h)
    ctx.stroke()
  }
  ctx.fillStyle = '#facc15'
  for (const p of Object.values(lm)) {
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, 5 / scale, 0, Math.PI * 2)
    ctx.fill()
  }
}
