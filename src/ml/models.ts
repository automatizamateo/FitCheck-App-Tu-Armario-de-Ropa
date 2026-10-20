export type Device = 'auto' | 'webgpu' | 'wasm'
export type Dtype = 'q8' | 'fp16' | 'fp32'

export interface SegmentationModel {
  id: string
  label: string
  /** Approximate ONNX file size per dtype, in MB (from the Hugging Face repo). */
  sizesMB: Record<Dtype, number>
}

export const SEGMENTATION_MODELS: readonly SegmentationModel[] = [
  { id: 'Xenova/segformer_b2_clothes', label: 'SegFormer B2 clothes', sizesMB: { q8: 28.8, fp16: 55.5, fp32: 110 } },
  { id: 'Xenova/segformer_b0_clothes', label: 'SegFormer B0 clothes', sizesMB: { q8: 4.4, fp16: 7.9, fp32: 15.2 } },
]

// ATR label set shared by both models (see config.json id2label).
export const CLOTHES_LABELS = [
  'Background',
  'Hat',
  'Hair',
  'Sunglasses',
  'Upper-clothes',
  'Skirt',
  'Pants',
  'Dress',
  'Belt',
  'Left-shoe',
  'Right-shoe',
  'Face',
  'Left-leg',
  'Right-leg',
  'Left-arm',
  'Right-arm',
  'Bag',
  'Scarf',
] as const

/** RGB per label, for overlays. */
export const LABEL_COLORS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [255, 179, 0],
  [128, 62, 117],
  [255, 104, 0],
  [166, 189, 215],
  [193, 0, 32],
  [206, 162, 98],
  [129, 112, 102],
  [0, 125, 52],
  [246, 118, 142],
  [0, 83, 138],
  [255, 122, 92],
  [83, 55, 122],
  [255, 142, 0],
  [179, 40, 81],
  [244, 200, 0],
  [127, 24, 13],
  [147, 170, 0],
]
