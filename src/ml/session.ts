import type { MlSettings } from '../domain/types'
import { isIOS } from '../lib/platform'
import { resolveSegmentationConfig } from './mlConfig'
import {
  createSegmentationProvider,
  MediaPipePoseProvider,
  SlimSamRefiner,
  type EdgeRefiner,
  type PoseProvider,
  type SegmentationProvider,
} from './providers'

/** What the photo pipeline needs from a session (a fake implements it in tests). */
export interface PipelineSession {
  readonly settings: MlSettings
  segmentation(): SegmentationProvider
  poseDetector(): PoseProvider
  edgeRefiner(): EdgeRefiner
  /** Frees the model and terminates its worker; the next segmentation() starts a fresh one. */
  unloadSegmentation(): Promise<void>
  unloadPose(): Promise<void>
  releaseRefiner(): void
}

/**
 * The models used by one capture flow, created lazily. The pipeline is strictly sequential: each
 * model is unloaded (worker terminated) before the next one loads, so at most one is ever in memory.
 * That costs a reload per photo, which is what keeps iPhones from killing the page.
 */
export class MlSession implements PipelineSession {
  private seg: SegmentationProvider | null = null
  private refiner: EdgeRefiner | null = null
  private pose: PoseProvider | null = null
  private readonly ml: MlSettings
  private readonly ios: boolean

  constructor(ml: MlSettings, ios = isIOS()) {
    this.ml = ml
    this.ios = ios
  }

  get settings(): MlSettings {
    return this.ml
  }

  segmentation(): SegmentationProvider {
    this.seg ??= createSegmentationProvider(resolveSegmentationConfig(this.ml, this.ios))
    return this.seg
  }

  edgeRefiner(): EdgeRefiner {
    this.refiner ??= new SlimSamRefiner()
    return this.refiner
  }

  poseDetector(): PoseProvider {
    this.pose ??= new MediaPipePoseProvider()
    return this.pose
  }

  async unloadSegmentation() {
    const seg = this.seg
    this.seg = null
    await seg?.unload()
  }

  async unloadPose() {
    const pose = this.pose
    this.pose = null
    await pose?.unload()
  }

  releaseRefiner() {
    this.refiner?.dispose()
    this.refiner = null
  }

  dispose() {
    this.seg?.dispose()
    this.pose?.dispose()
    this.seg = this.pose = null
    this.releaseRefiner()
  }
}
