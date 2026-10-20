import type { MlSettings } from '../domain/types'
import { resolveRefinerConfig, resolveSegmentationConfig } from './mlConfig'
import {
  createSegmentationProvider,
  MediaPipePoseProvider,
  SlimSamRefiner,
  type EdgeRefiner,
  type PoseProvider,
  type SegmentationProvider,
} from './providers'

/**
 * The models used by one capture flow. Created lazily so nothing downloads until needed, kept loaded
 * between views (reloading costs seconds), and all disposed together when the flow ends.
 */
export class MlSession {
  private seg: SegmentationProvider | null = null
  private refiner: EdgeRefiner | null = null
  private pose: PoseProvider | null = null
  private readonly ml: MlSettings

  constructor(ml: MlSettings) {
    this.ml = ml
  }

  get settings(): MlSettings {
    return this.ml
  }

  segmentation(): SegmentationProvider {
    this.seg ??= createSegmentationProvider(resolveSegmentationConfig(this.ml))
    return this.seg
  }

  edgeRefiner(): EdgeRefiner {
    this.refiner ??= new SlimSamRefiner(resolveRefinerConfig(this.ml))
    return this.refiner
  }

  poseDetector(): PoseProvider {
    this.pose ??= new MediaPipePoseProvider()
    return this.pose
  }

  dispose() {
    this.seg?.dispose()
    this.refiner?.dispose()
    this.pose?.dispose()
    this.seg = this.refiner = this.pose = null
  }
}
