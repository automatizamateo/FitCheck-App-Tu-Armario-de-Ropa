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
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle'

export type PoseLandmarks = Partial<Record<LandmarkName, Landmark>>

export interface Transform {
  dx: number
  dy: number
  scale: number
  rotation: number
}

export interface BaseModelView {
  image: Blob
  width: number
  height: number
  landmarks: PoseLandmarks
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

export interface Settings {
  id: 'settings'
  unusedThresholdDays: number
  keepOriginalPhotos: boolean
  onboardingDone: boolean
  lastBackupAt?: number
}
