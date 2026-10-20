import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ML_SETTINGS } from '../../db/db'
import type { MlSettings, PoseLandmarks } from '../../domain/types'
import { readDebugLog } from '../../lib/debugLog'
import type { EdgeRefiner, LoadInfo, PoseProvider, SegmentationProvider } from '../../ml/providers'
import type { PipelineSession } from '../../ml/session'
import { memoryStorage } from '../../test/memoryStorage'
import { processPhoto, type PipelineDeps, type StageUpdate } from './processPhoto'

const settings = vi.hoisted(() => ({
  updateMlSettings: vi.fn(() => Promise.resolve()),
  getSettings: vi.fn(() => Promise.resolve({ ml: { iosVerifiedRuns: 2 } })),
}))
vi.mock('../../db/settings', () => settings)

const W = 40
const H = 60
const INFO: LoadInfo = { modelId: 'seg', device: 'wasm', dtype: 'q8', ms: 1 }
const LANDMARKS: PoseLandmarks = { leftShoulder: { x: 0.4, y: 0.2, visibility: 1 }, rightHip: { x: 0.5, y: 0.6, visibility: 1 } }
const never = () => new Promise<never>(() => undefined)

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
  poseTimeoutMs: 50,
  refineTimeoutMs: 50,
}

interface FakeOptions {
  ml?: Partial<MlSettings>
  refine?: (image: ImageBitmap, mask: Uint8Array, w: number, h: number) => Promise<{ mask: Uint8Array; iou: number; ms: number }>
  refineLoad?: () => Promise<LoadInfo>
  segmentRun?: () => Promise<never>
  poseLoad?: () => Promise<void>
  poseRun?: (image: ImageBitmap) => Promise<{ landmarks: PoseLandmarks; ms: number }>
}

/**
 * A session whose fake models record what happens to them. Like MlSession, unloading drops the
 * provider, and using a provider after it was unloaded is recorded as an error.
 */
function fakeSession(opts: FakeOptions = {}) {
  const calls: string[] = []
  const unloaded = new Set<string>()
  const record = (name: string, what: string) => {
    calls.push(unloaded.has(name) ? `ERROR ${what} after unload` : what)
  }
  const seg: SegmentationProvider = {
    modelId: 'seg',
    labels: [],
    personClasses: [1],
    load: () => {
      record('segment', 'segment.load')
      return Promise.resolve(INFO)
    },
    segmentGroups: () => {
      record('segment', 'segment.run')
      if (opts.segmentRun) return opts.segmentRun()
      return Promise.resolve({ masks: [personProb()], width: W, height: H, ms: 5 })
    },
    unload: () => {
      calls.push('segment.unload')
      unloaded.add('segment')
      return Promise.resolve()
    },
    dispose: () => calls.push('segment.dispose'),
  }
  const pose: PoseProvider = {
    load: () => {
      record('pose', 'pose.load')
      return opts.poseLoad ? opts.poseLoad() : Promise.resolve()
    },
    detect: (image) => {
      record('pose', `pose.run ${image.width}×${image.height}`)
      return opts.poseRun ? opts.poseRun(image) : Promise.resolve({ landmarks: LANDMARKS, ms: 3 })
    },
    unload: () => {
      calls.push('pose.unload')
      unloaded.add('pose')
      return Promise.resolve()
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
  let segLive = false
  let poseLive = false
  const session: PipelineSession = {
    settings: { ...DEFAULT_ML_SETTINGS, ...opts.ml },
    segmentation: () => {
      segLive = true
      return seg
    },
    poseDetector: () => {
      poseLive = true
      return pose
    },
    edgeRefiner: () => refiner,
    unloadSegmentation: () => (segLive ? ((segLive = false), seg.unload()) : Promise.resolve()),
    unloadPose: () => (poseLive ? ((poseLive = false), pose.unload()) : Promise.resolve()),
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
  settings.updateMlSettings.mockClear()
})

describe('processPhoto: one model in memory at a time', () => {
  it('unloads segmentation before pose loads, and pose before finishing (iOS defaults: no refinement)', async () => {
    const { result, calls, final } = await run({}, { copy: (p) => deps.copy(p) })
    expect(calls).toEqual(['segment.load', 'segment.run', 'segment.unload', 'pose.load', `pose.run ${W}×${H}`, 'pose.unload'])
    expect(final('refine')).toBe('skipped')
    expect(result.landmarks).toEqual(LANDMARKS)
  })

  it('with refinement on: segment → unload → pose → unload → SlimSAM → release', async () => {
    const { calls, final } = await run({ ml: { refineEdges: 'on' } }, { copy: (p) => deps.copy(p) })
    expect(calls).toEqual([
      'segment.load',
      'segment.run',
      'segment.unload',
      'pose.load',
      `pose.run ${W}×${H}`,
      'pose.unload',
      'refine.load',
      `refine.run ${W}×${H}`,
      'refine.dispose',
    ])
    expect(calls.some((c) => c.startsWith('ERROR'))).toBe(false)
    expect(final('refine')).toBe('done')
  })

  it('gives pose and SlimSAM downscaled copies', async () => {
    const { calls } = await run({ ml: { refineEdges: 'on' } }, { copy: (p, max) => deps.copy(p, max && 20) })
    expect(calls).toContain('pose.run 13×20')
    expect(calls).toContain('refine.run 13×20')
  })

  it('logs the resolved config, not "auto", and the unload lines', async () => {
    await run()
    const log = readDebugLog().map((e) => e.m)
    const start = log.find((m) => m.startsWith('pipeline start')) ?? ''
    expect(start).toContain('"model":"Xenova/segformer_b0_clothes"')
    expect(start).toContain('"device":"wasm"')
    expect(start).toContain('"dtype":"q8"')
    expect(log.some((m) => /^segment\.unloaded \[w\d+ b\d+ c\d+ [\d.]+MB/.test(m))).toBe(true)
    expect(log.some((m) => m.startsWith('pose.unloaded'))).toBe(true)
  })
})

describe('processPhoto: pose never blocks the base model', () => {
  it('keeps the mask and adds a manual-alignment note when pose loading fails', async () => {
    const expected = await baseline()
    const { result, calls, final } = await run({ poseLoad: () => Promise.reject(new Error('wasm failed')) })
    expect(result.mask).toEqual(expected)
    expect(result.landmarks).toEqual({})
    expect(final('pose')).toBe('failed')
    expect(result.notes.join(' ')).toMatch(/line clothes up by hand/)
    expect(calls.at(-1)).toBe('pose.unload')
  })

  it('aborts a pose run that hangs past the timeout', async () => {
    const expected = await baseline()
    const { result, calls, final } = await run({ poseRun: never })
    expect(result.mask).toEqual(expected)
    expect(final('pose')).toBe('failed')
    expect(result.notes.join(' ')).toMatch(/longer than/)
    expect(calls).toContain('pose.unload')
  })

  it('skips pose entirely when it was turned off after crashes', async () => {
    const { result, calls, final } = await run({ ml: { skipPose: true } })
    expect(calls).not.toContain('pose.load')
    expect(final('pose')).toBe('skipped')
    expect(result.notes.join(' ')).toMatch(/Pose detection is off/)
  })

  it('a successful pose clears the crash counter', async () => {
    await run({ ml: { poseCrashes: 1 } })
    expect(settings.updateMlSettings).toHaveBeenCalledWith({ poseCrashes: 0 })
  })
})

describe('processPhoto: refinement and success bookkeeping', () => {
  it('records a verified run on iOS so auto can step up next time', async () => {
    await run()
    expect(settings.updateMlSettings).toHaveBeenCalledWith({ iosVerifiedRuns: 3 })
    settings.updateMlSettings.mockClear()
    await run({}, { ios: false })
    expect(settings.updateMlSettings).not.toHaveBeenCalledWith(expect.objectContaining({ iosVerifiedRuns: expect.anything() as unknown }))
  })

  it('does not record a verified run when segmentation fails', async () => {
    await expect(run({ segmentRun: () => Promise.reject(new Error('boom')) })).rejects.toThrow('boom')
    expect(settings.updateMlSettings).not.toHaveBeenCalledWith(expect.objectContaining({ iosVerifiedRuns: expect.anything() as unknown }))
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

  it('keeps the SegFormer mask when refinement loading fails or hangs', async () => {
    const expected = await baseline()
    expect((await run({ ml: { refineEdges: 'on' }, refineLoad: () => Promise.reject(new Error('404')) })).result.mask).toEqual(expected)
    const hung = await run({ ml: { refineEdges: 'on' }, refine: never })
    expect(hung.result.mask).toEqual(expected)
    expect(hung.final('refine')).toBe('failed')
    expect(hung.result.notes.join(' ')).toMatch(/longer than/)
  })

  it('on auto (desktop), a timed-out refinement is recorded so auto turns it off next time', async () => {
    await run({ refine: never }, { ios: false })
    expect(settings.updateMlSettings).toHaveBeenCalledWith({ refineBenchmarkMs: 50 })
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

  it('a failed edge cleanup keeps the plain mask', async () => {
    // deps.luminance throws, so the cleanup fallback runs in every test; check it was logged.
    await run()
    expect(readDebugLog().some((e) => e.m.startsWith('✗ segment.post'))).toBe(true)
  })
})

describe('processPhoto: crash markers and log', () => {
  it('writes the in-flight marker before each heavy step and logs each step with duration and resources', async () => {
    const markers: string[] = []
    const storage = memoryStorage()
    const setItem = storage.setItem.bind(storage)
    storage.setItem = (k, v) => {
      if (k === 'fitcheck-ml-inflight') {
        const { stage, step } = (JSON.parse(v) as { info: { stage: string; step: string } }).info
        markers.push(`${stage}.${step}`)
      }
      setItem(k, v)
    }
    vi.stubGlobal('localStorage', storage)
    const { session } = fakeSession({ ml: { refineEdges: 'on' } })
    await processPhoto(session, fakeBitmap(), () => undefined, deps)
    expect(markers).toEqual([
      'segment.load',
      'segment.run',
      'segment.post',
      'segment.unload',
      'pose.load',
      'pose.run',
      'pose.unload',
      'refine.load',
      'refine.run',
    ])
    expect(storage.getItem('fitcheck-ml-inflight')).toBeNull()
    const log = readDebugLog().map((e) => e.m)
    for (const step of ['segment.load', 'segment.run', 'pose.load', 'pose.run', 'refine.load', 'refine.run']) {
      const escaped = step.replace('.', '\\.')
      expect(log.some((m) => new RegExp(`^▶ ${escaped}.* \\[w\\d+ b\\d+ c\\d+ [\\d.]+MB.*\\]$`).test(m))).toBe(true)
      expect(log.some((m) => new RegExp(`^✓ ${escaped} \\d+ ms \\[w\\d+ b\\d+ c\\d+ [\\d.]+MB.*\\]$`).test(m))).toBe(true)
    }
  })
})
