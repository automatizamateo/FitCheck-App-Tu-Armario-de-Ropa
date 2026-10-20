export type View = 'front' | 'back' | 'side'

export const VIEWS: readonly View[] = ['front', 'side', 'back']

export type Category =
  | 'Socks'
  | 'Pants'
  | 'Shorts'
  | 'T-Shirts'
  | 'Shirts'
  | 'Sweaters & Hoodies'
  | 'Jackets & Coats'
  | 'Shoes'
  | 'Accessories'

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter'

export interface Landmark {
  x: number // normalized 0..1
  y: number // normalized 0..1
  visibility?: number
}

export type LandmarkName =
  | 'nose'
  | 'leftEar'
  | 'rightEar'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle'
  | 'leftHeel'
  | 'rightHeel'
  | 'leftFootIndex'
  | 'rightFootIndex'

export type PoseLandmarks = Partial<Record<LandmarkName, Landmark>>

export interface Transform {
  dx: number
  dy: number
  scale: number
  rotation: number
}

export interface BaseModelView {
  image: Blob // full photo frame with transparent background (not cropped), so overlays line up
  width: number
  height: number
  landmarks: PoseLandmarks
  original?: Blob // only when Settings.keepOriginalPhotos
}

/** Views confirmed so far while creating a base model; survives the page being killed. */
export interface BaseModelDraft {
  id: 'draft'
  views: Partial<Record<View, BaseModelView>>
  startedAt: number
}

/** The photo being processed, kept so "Retry" works after iOS kills the page mid-processing. */
export interface PendingPhoto {
  id: 'pending'
  flow?: 'base' | 'item' // missing = base model
  view: View
  image: Blob // JPEG of the downscaled photo
  savedAt: number
}

export interface BaseModel {
  id: 'base'
  views: Record<View, BaseModelView>
  createdAt: number
  updatedAt: number
}

export interface GarmentLayer {
  image: Blob // WebP with alpha (PNG fallback), cropped to the garment
  bbox: { x: number; y: number; w: number; h: number } // auto placement in base-model view pixels
  transform: Transform // fine-tune about the bbox center (see lib/align.ts layerToSimilarity)
  original?: Blob // only when Settings.keepOriginalPhotos
}

/** An item being added; each confirmed view is saved right away so a crash loses nothing. */
export interface ItemDraft {
  id: 'draft'
  category: Category
  accessoryType?: string
  views: Partial<Record<View, GarmentLayer>>
  skipped: View[]
  startedAt: number
}

export interface Item {
  id: string
  name: string
  category: Category
  accessoryType?: string
  styleIds: string[]
  seasons: Season[]
  colors: string[]
  brand?: string
  notes?: string
  favorite: boolean
  layer: number
  views: Partial<Record<View, GarmentLayer>>
  thumbnail: Blob
  createdAt: number
  wearCount: number
  lastWornAt?: number
}

export type OutfitOverride = Transform & { layer?: number }

export interface Outfit {
  id: string
  name: string
  itemIds: string[]
  overrides: Record<string, Partial<Record<View, OutfitOverride>>>
  styleIds: string[]
  seasons: Season[]
  occasion?: string
  favorite: boolean
  thumbnail: Blob
  createdAt: number
  updatedAt: number
}

export interface WearLogEntry {
  id: string
  date: string // 'YYYY-MM-DD'
  outfitId: string
  note?: string
}

export interface Style {
  id: string
  name: string
  builtIn: boolean
}

export type MlDevice = 'auto' | 'webgpu' | 'wasm'
export type MlDtype = 'q8' | 'fp16' | 'fp32'

export interface MlSettings {
  model: string // 'auto' or a segmentation model id
  device: MlDevice
  dtype: 'auto' | MlDtype
  refineEdges: 'auto' | 'on' | 'off' // auto = off on iOS; elsewhere on until a run is too slow
  refineBenchmarkMs?: number // last edge-refinement time on this device
  webgpuBroken?: boolean // WebGPU failed to load or run inside the worker
  iosVerifiedRuns?: number // full photo runs completed on this iPhone/iPad; auto steps up only after one
  poseCrashes?: number // consecutive launches killed during pose detection
  skipPose?: boolean // pose detection off (after it killed the page twice); clothes are aligned by hand
  lastUsed?: { modelId: string; device: 'webgpu' | 'wasm'; dtype: MlDtype }
  pendingNotice?: string // shown once, then cleared
}

export interface Settings {
  id: 'settings'
  unusedThresholdDays: number
  keepOriginalPhotos: boolean
  onboardingDone: boolean
  captureTipsSeen: boolean
  ml: MlSettings
  lastBackupAt?: number
}
