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

export interface BaseModel {
  id: 'base'
  views: Record<View, BaseModelView>
  createdAt: number
  updatedAt: number
}

export interface GarmentLayer {
  image: Blob
  bbox: { x: number; y: number; w: number; h: number }
  transform: Transform
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
  refineEdges: 'auto' | 'on' | 'off'
  refineBenchmarkMs?: number // last edge-refinement time on this device
  refineCrashed?: boolean // iOS killed the page while refining
  webgpuBroken?: boolean // WebGPU failed to load or run inside the worker
  crashFallback?: boolean // iOS killed the page with the default model → auto uses the light one
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
