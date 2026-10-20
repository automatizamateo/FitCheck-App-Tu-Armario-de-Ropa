import type { MlSettings } from '../domain/types'
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
  /** Frees SegFormer and pose memory before SlimSAM loads; they reload lazily for the next photo. */
  releaseForRefine(): void
  releaseRefiner(): void
}

/**
 * The models used by one capture flow. Created lazily so nothing downloads until needed, kept loaded
 * between views (reloading costs seconds), and all disposed together when the flow ends. The edge
 * refiner is the exception: it only lives for one refine step.
 */
export class MlSession implements PipelineSession {
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
    this.refiner ??= new SlimSamRefiner()
    return this.refiner
  }

  poseDetector(): PoseProvider {
    this.pose ??= new MediaPipePoseProvider()
    return this.pose
  }

  releaseForRefine() {
    this.seg?.dispose()
    this.pose?.dispose()
    this.seg = this.pose = null
  }

  releaseRefiner() {
    this.refiner?.dispose()
    this.refiner = null
  }

  dispose() {
    this.releaseForRefine()
    this.releaseRefiner()
  }
}
