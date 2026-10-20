import type { ViewportHandle, ViewportTool } from '../../components/ViewportCanvas'
import type { LandmarkName, PoseLandmarks } from '../../domain/types'
import type { Point } from '../../lib/gesture/similarity'
import { MaskHistory } from '../../lib/mask/maskHistory'
import { featherAlpha } from '../../lib/mask/ops'
import { releaseCanvas, trackCanvas } from '../../lib/resources'

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
const UNDO_BYTES = 2_000_000

function makeCanvas(w: number, h: number) {
  const canvas = trackCanvas(document.createElement('canvas'))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D unavailable')
  return { canvas, ctx }
}

/**
 * Imperative brush editor for a binary mask over a photo, kept outside React so pointer moves never
 * re-render. One full-size canvas holds the cut-out itself (photo pixels, alpha = in/out), so painting
 * is GPU-cheap and there is no separate mask layer. After each stroke the mask is snapped to 0/1 and
 * only the changed area goes into a byte-capped undo history. The preview canvas exists only while
 * previewing.
 */
export class MaskEditorEngine {
  readonly width: number
  readonly height: number
  private viewport: ViewportHandle | null = null
  private onHistoryChange: ((canUndo: boolean, canRedo: boolean) => void) | null = null

  private readonly photo: ImageBitmap
  private readonly landmarks: PoseLandmarks
  private readonly cutout: ReturnType<typeof makeCanvas>
  private readonly history: MaskHistory
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
    this.cutout = makeCanvas(this.width, this.height)
    this.history = new MaskHistory(initialMask, this.width, this.height, UNDO_BYTES)
    this.writeMask(initialMask)
  }

  attach(viewport: ViewportHandle | null, onHistoryChange: (canUndo: boolean, canRedo: boolean) => void) {
    this.viewport = viewport
    this.onHistoryChange = onHistoryChange
    this.emitHistory()
  }

  setState(state: MaskEditorState) {
    this.state = state
    if (!state.preview || this.preview?.feather !== state.feather) {
      releaseCanvas(this.preview?.canvas)
      this.preview = state.preview ? { canvas: this.buildPreview(state.feather), feather: state.feather } : null
    }
    this.viewport?.invalidate()
  }

  emitHistory() {
    this.onHistoryChange?.(this.history.canUndo, this.history.canRedo)
  }

  undo() {
    const s = this.history.undo()
    if (s) this.writeMask(s)
    this.emitHistory()
  }

  redo() {
    const s = this.history.redo()
    if (s) this.writeMask(s)
    this.emitHistory()
  }

  /** Current mask as 0/1. */
  getMask(): Uint8Array {
    const img = this.cutout.ctx.getImageData(0, 0, this.width, this.height)
    const out = new Uint8Array(this.width * this.height)
    for (let i = 0; i < out.length; i++) out[i] = (img.data[i * 4 + 3] ?? 0) >= 128 ? 1 : 0
    return out
  }

  dispose() {
    this.cancelPendingDot()
    releaseCanvas(this.preview?.canvas)
    this.preview = null
    releaseCanvas(this.cutout.canvas)
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
      if (this.stroke?.painted) this.writeMask(this.history.current)
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
      ctx.fillStyle = '#1c1917'
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 0.3 // removed areas stay faintly visible so you can paint them back
      ctx.drawImage(this.photo, 0, 0)
      ctx.globalAlpha = 1
      ctx.drawImage(this.cutout.canvas, 0, 0)
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
    const ctx = this.cutout.ctx
    const r = this.state.brushSize / (this.viewport?.scale() ?? 1) / 2
    ctx.save()
    if (this.state.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill(capsule(from, to, r))
    } else {
      // Adding brings back the photo's own pixels under the brush.
      ctx.clip(capsule(from, to, r))
      ctx.drawImage(this.photo, 0, 0)
    }
    ctx.restore()
    this.viewport?.invalidate()
  }

  private commit() {
    const mask01 = this.getMask()
    this.writeMask(mask01)
    this.history.commit(mask01)
    this.emitHistory()
  }

  /** Redraws the cut-out canvas from a 0/1 mask: alpha from the mask, colour from the photo. */
  private writeMask(mask01: Uint8Array) {
    const { ctx } = this.cutout
    const img = ctx.createImageData(this.width, this.height)
    for (let i = 0; i < mask01.length; i++) img.data[i * 4 + 3] = mask01[i] ? 255 : 0
    ctx.putImageData(img, 0, 0) // replaces every pixel, compositing doesn't apply
    ctx.save()
    ctx.globalCompositeOperation = 'source-in'
    ctx.drawImage(this.photo, 0, 0)
    ctx.restore()
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

/**
 * The shape a round brush of radius r sweeps from `a` to `b`. Every part is wound clockwise on
 * screen, so with the nonzero fill rule the overlaps add up instead of cancelling into holes.
 */
function capsule(a: Point, b: Point, r: number): Path2D {
  const path = new Path2D()
  path.arc(a.x, a.y, r, 0, Math.PI * 2)
  path.moveTo(b.x + r, b.y)
  path.arc(b.x, b.y, r, 0, Math.PI * 2)
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len > 0) {
    const nx = (-(b.y - a.y) / len) * r
    const ny = ((b.x - a.x) / len) * r
    path.moveTo(a.x - nx, a.y - ny)
    path.lineTo(b.x - nx, b.y - ny)
    path.lineTo(b.x + nx, b.y + ny)
    path.lineTo(a.x + nx, a.y + ny)
    path.closePath()
  }
  return path
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
