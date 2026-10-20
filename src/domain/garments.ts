// How each category is found in a photo and placed on the base model (SPEC §6.3).

import { CLOTHES_LABELS } from '../ml/models'
import type { Category, LandmarkName } from './types'

export type AccessoryType = 'Cap / Hat' | 'Necklace' | 'Scarf' | 'Other'

const label = (name: (typeof CLOTHES_LABELS)[number]) => CLOTHES_LABELS.indexOf(name)

/** What kind of garment this is for detection and alignment. */
export type GarmentKind = 'top' | 'pants' | 'shorts' | 'shoes' | 'socks' | 'hat' | 'necklace' | 'scarf' | 'other'

export function garmentKind(category: Category, accessoryType?: string): GarmentKind {
  switch (category) {
    case 'T-Shirts':
    case 'Shirts':
    case 'Sweaters & Hoodies':
    case 'Jackets & Coats':
      return 'top'
    case 'Pants':
      return 'pants'
    case 'Shorts':
      return 'shorts'
    case 'Shoes':
      return 'shoes'
    case 'Socks':
      return 'socks'
    case 'Accessories':
      return accessoryType === 'Cap / Hat'
        ? 'hat'
        : accessoryType === 'Necklace'
          ? 'necklace'
          : accessoryType === 'Scarf'
            ? 'scarf'
            : 'other'
  }
}

/**
 * Clothes-parsing classes that make up this garment, or null when the model has no reliable class
 * for it (socks, necklaces, other accessories): those go straight to the brush.
 */
export function garmentClasses(kind: GarmentKind): number[] | null {
  switch (kind) {
    case 'top':
      return [label('Upper-clothes'), label('Dress')]
    case 'pants':
    case 'shorts':
      return [label('Pants'), label('Skirt')]
    case 'shoes':
      return [label('Left-shoe'), label('Right-shoe')]
    case 'hat':
      return [label('Hat')]
    case 'scarf':
      return [label('Scarf')]
    case 'socks':
    case 'necklace':
    case 'other':
      return null
  }
}

/** Pose landmarks used to align this garment to the base model (SPEC §6.3 step 6). */
export function alignmentLandmarks(kind: GarmentKind): LandmarkName[] {
  switch (kind) {
    case 'top':
    case 'other':
      return ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']
    case 'pants':
      return ['leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle']
    case 'shorts':
      return ['leftHip', 'rightHip', 'leftKnee', 'rightKnee']
    case 'shoes':
    case 'socks':
      return ['leftAnkle', 'rightAnkle', 'leftHeel', 'rightHeel', 'leftFootIndex', 'rightFootIndex']
    case 'hat':
      return ['nose', 'leftEar', 'rightEar', 'leftShoulder', 'rightShoulder']
    case 'necklace':
    case 'scarf':
      return ['nose', 'leftShoulder', 'rightShoulder', 'leftEar', 'rightEar']
  }
}

/**
 * Where this garment sits on the body, as fractions of the person's bounding box (top = 0, bottom = 1).
 * Used to place it when pose landmarks are missing.
 */
export function bodyRegion(kind: GarmentKind): { top: number; bottom: number; width: number } {
  switch (kind) {
    case 'hat':
      return { top: 0, bottom: 0.1, width: 0.35 }
    case 'necklace':
      return { top: 0.13, bottom: 0.3, width: 0.3 }
    case 'scarf':
      return { top: 0.12, bottom: 0.35, width: 0.45 }
    case 'top':
      return { top: 0.15, bottom: 0.55, width: 1 }
    case 'pants':
      return { top: 0.45, bottom: 0.97, width: 0.7 }
    case 'shorts':
      return { top: 0.45, bottom: 0.7, width: 0.7 }
    case 'shoes':
      return { top: 0.92, bottom: 1, width: 0.6 }
    case 'socks':
      return { top: 0.82, bottom: 0.98, width: 0.5 }
    case 'other':
      return { top: 0, bottom: 1, width: 1 }
  }
}

const SINGULAR: Record<Category, string> = {
  Socks: 'Socks',
  Pants: 'Pants',
  Shorts: 'Shorts',
  'T-Shirts': 'T-Shirt',
  Shirts: 'Shirt',
  'Sweaters & Hoodies': 'Sweater',
  'Jackets & Coats': 'Jacket',
  Shoes: 'Shoes',
  Accessories: 'Accessory',
}

/** A ready-to-edit name such as "Navy T-Shirt", so saving a new purchase takes one tap. */
export function suggestName(category: Category, accessoryType: string | undefined, color: string | undefined): string {
  const noun =
    category === 'Accessories' && accessoryType
      ? accessoryType === 'Cap / Hat'
        ? 'Cap'
        : accessoryType
      : SINGULAR[category]
  return color ? `${color} ${noun}` : noun
}
