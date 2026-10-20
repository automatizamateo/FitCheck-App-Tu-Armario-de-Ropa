import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ML_SETTINGS } from '../../db/db'
import type { MlSettings, PoseLandmarks } from '../../domain/types'
import { readDebugLog } from '../../lib/debugLog'
import type { EdgeRefiner, LoadInfo, PoseProvider, SegmentationProvider } from '../../ml/providers'
import type { PipelineSession } from '../../ml/session'
import { memoryStorage } from '../../test/memoryStorage'
import { processPhoto, type PipelineDeps, type StageUpdate } from './processPhoto'

const updateMlSettings = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../../db/settings', () => ({ updateMlSettings }))

const W = 40
const H = 60
const INFO: LoadInfo = { modelId: 'seg', device: 'wasm', dtype: 'q8', ms: 1 }
const LANDMARKS: PoseLandmarks = { leftShoulder: { x: 0.4, y: 0.2, visibility: 1 }, rightHip: { x: 0.5, y: 0.6, visibility: 1 } }

/** A person-shaped probability map: a box in the middle. */
function personProb(): Uint8Array {
  const p = new Uint8Array(W * H)
  for (let y = 10; y < 50; y++) for (let x = 10; x < 30; x++) p[y * W + x] = 255
  return p
}

const fakeBitmap = (width = W, height = H) => ({ width, height, close: () => undefined }) as unknown as ImageBitmap

const deps: PipelineDeps = {
  copy: (photo, maxSide) => {
    const s = maxSide ? Math.min(1, maxSide / Math.max(photo.width, photo.height)) : 1
    return Promise.resolve(fakeBitmap(Math.round(photo.width * s), Math.round(photo.height * s)))
  },
  luminance: () => {
    throw new Error('no canvas in tests')
  },
  ios: true,
  refineTimeoutMs: 50,
}

interface FakeOptions {
  ml?: Partial<MlSettings>
  refine?: (image: ImageBitmap, mask: Uint8Array, w: number, h: number) => Promise<{ mask: Uint8Array; iou: number; ms: number }>
  refineLoad?: () => Promise<LoadInfo>
  segmentRun?: () => Promise<never>
}

function fakeSession(opts: FakeOptions = {}) {
  const calls: string[] = []
  const seg: SegmentationProvider = {
    modelId: 'seg',
    labels: [],
    personClasses: [1],
    load: () => {
      calls.push('segment.load')
      return Promise.resolve(INFO)
    },
    segmentGroups: () => {
      calls.push('segment.run')
      if (opts.segmentRun) return opts.segmentRun()
      return Promise.resolve({ masks: [personProb()], width: W, height: H, ms: 5 })
    },
    dispose: () => calls.push('segment.dispose'),
  }
  const pose: PoseProvider = {
    load: () => {
      calls.push('pose.load')
      return Promise.resolve()
    },
    detect: () => {
      calls.push('pose.run')
      return Promise.resolve({ landmarks: LANDMARKS, ms: 3 })
    },
    dispose: () => calls.push('pose.dispose'),
  }
  const refiner: EdgeRefiner = {
    load: () => {
      calls.push('refine.load')
      return opts.refineLoad ? opts.refineLoad() : Promise.resolve({ ...INFO, modelId: 'sam' })
    },
    refine: (image, mask, w, h) => {
      calls.push(`refine.run ${w}×${h}`)
      return opts.refine ? opts.refine(image, mask, w, h) : Promise.resolve({ mask, iou: 1, ms: 7 })
    },
    dispose: () => calls.push('refine.dispose'),
  }
  const session: PipelineSession = {
    settings: { ...DEFAULT_ML_SETTINGS, ...opts.ml },
    segmentation: () => seg,
    poseDetector: () => pose,
    edgeRefiner: () => refiner,
    releaseForRefine: () => {
      seg.dispose()
      pose.dispose()
    },
    releaseRefiner: () => {
      refiner.dispose()
    },
  }
  return { session, calls }
}

async function run(opts: FakeOptions = {}, d: Partial<PipelineDeps> = {}) {
  const { session, calls } = fakeSession(opts)
  const stages: StageUpdate[] = []
  const result = await processPhoto(session, fakeBitmap(), (u) => stages.push(u), { ...deps, ...d })
  const final = (id: string) => stages.filter((s) => s.stage === id).at(-1)?.status
  return { result, calls, final }
}

/** What the SegFormer step alone produces for personProb(). */
async function baseline() {
  return (await run()).result.mask
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  updateMlSettings.mockClear()
})

describe('processPhoto', () => {
  it('on iOS with default settings: segment then pose, no refinement', async () => {
    const { result, calls, final } = await run()
    expect(calls).toEqual(['segment.load', 'segment.run', 'pose.load', 'pose.run'])
    expect(final('refine')).toBe('skipped')
    expect(result.landmarks).toEqual(LANDMARKS)
    expect(result.mask.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })

  it('when refinement is on: pose first, other models released before SlimSAM loads, SlimSAM released after', async () => {
    const { calls, final } = await run({ ml: { refineEdges: 'on' } }, { copy: (p) => deps.copy(p) })
    expect(calls).toEqual([
      'segment.load',
      'segment.run',
      'pose.load',
      'pose.run',
      'segment.dispose',
      'pose.dispose',
      'refine.load',
      `refine.run ${W}×${H}`,
      'refine.dispose',
    ])
    expect(final('refine')).toBe('done')
  })

  it('sends SlimSAM a downscaled image and mask', async () => {
    const { calls } = await run({ ml: { refineEdges: 'on' } }, { copy: (p) => deps.copy(p, 20) })
    expect(calls).toContain('refine.run 13×20')
  })

  it('keeps the SegFormer mask and the pose when refinement throws', async () => {
    const expected = await baseline()
    const { result, calls, final } = await run({
      ml: { refineEdges: 'on' },
      refine: () => Promise.reject(new Error('out of memory')),
    })
    expect(result.mask).toEqual(expected)
    expect(result.landmarks).toEqual(LANDMARKS)
    expect(final('refine')).toBe('failed')
    expect(result.notes.join(' ')).toMatch(/out of memory/)
    expect(calls.at(-1)).toBe('refine.dispose')
  })

  it('keeps the SegFormer mask when refinement loading fails', async () => {
    const expected = await baseline()
    const { result, final } = await run({ ml: { refineEdges: 'on' }, refineLoad: () => Promise.reject(new Error('404')) })
    expect(result.mask).toEqual(expected)
    expect(final('refine')).toBe('failed')
  })

  it('aborts a refinement that hangs past the timeout and falls back', async () => {
    const expected = await baseline()
    const { result, calls, final } = await run({
      ml: { refineEdges: 'on' },
      refine: () => new Promise(() => undefined), // never settles
    })
    expect(result.mask).toEqual(expected)
    expect(final('refine')).toBe('failed')
    expect(result.notes.join(' ')).toMatch(/longer than/)
    expect(calls.filter((c) => c === 'refine.dispose').length).toBeGreaterThanOrEqual(1)
  })

  it('on auto (desktop), a timed-out refinement is recorded so auto turns it off next time', async () => {
    await run({ refine: () => new Promise(() => undefined) }, { ios: false })
    expect(updateMlSettings).toHaveBeenCalledWith({ refineBenchmarkMs: 50 })
  })

  it('ignores a refinement that disagrees with the SegFormer mask', async () => {
    const expected = await baseline()
    const { result } = await run({
      ml: { refineEdges: 'on' },
      refine: (_i, m) => Promise.resolve({ mask: new Uint8Array(m.length), iou: 0, ms: 5 }),
    })
    expect(result.mask).toEqual(expected)
    expect(result.notes.join(' ')).toMatch(/didn’t match/)
  })

  it('a failed edge cleanup keeps the plain mask; a failed segmentation fails the photo', async () => {
    // deps.luminance throws in every test above, so the cleanup fallback is already exercised; check it was logged.
    await run()
    expect(readDebugLog().some((e) => e.m.startsWith('✗ segment.post'))).toBe(true)
    await expect(run({ segmentRun: () => Promise.reject(new Error('boom')) })).rejects.toThrow('boom')
  })

  it('writes the in-flight marker before each heavy step and logs each step with its duration', async () => {
    const markers: string[] = []
    const storage = memoryStorage()
    const setItem = storage.setItem.bind(storage)
    storage.setItem = (k, v) => {
      if (k === 'fitcheck-ml-inflight') markers.push((JSON.parse(v) as { info: { stage: string; step: string } }).info.step)
      setItem(k, v)
    }
    vi.stubGlobal('localStorage', storage)
    const { session } = fakeSession({ ml: { refineEdges: 'on' } })
    await processPhoto(session, fakeBitmap(), () => undefined, deps)
    expect(markers).toEqual(['load', 'run', 'post', 'load', 'run', 'load', 'run'])
    expect(storage.getItem('fitcheck-ml-inflight')).toBeNull()
    const log = readDebugLog().map((e) => e.m)
    for (const step of ['segment.load', 'segment.run', 'pose.load', 'pose.run', 'refine.load', 'refine.run']) {
      expect(log.some((m) => m.startsWith(`▶ ${step}`))).toBe(true)
      expect(log.some((m) => new RegExp(`^✓ ${step.replace('.', '\\.')} \\d+ ms$`).test(m))).toBe(true)
    }
  })
})
