import type { MlDevice, MlDtype } from '../domain/types'

export type Device = MlDevice
export type Dtype = MlDtype

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

export const DEFAULT_SEGMENTATION_MODEL = 'Xenova/segformer_b2_clothes'
/** Used automatically after iOS kills the page while running the default model. */
export const LIGHT_SEGMENTATION_MODEL = 'Xenova/segformer_b0_clothes'

/** Point-prompted edge refiner (Apache-2.0). Sizes are vision encoder + prompt decoder. */
export const SLIMSAM = {
  id: 'Xenova/slimsam-77-uniform',
  sizesMB: { q8: 13.8, fp16: 20.8, fp32: 39.9 } as Record<Dtype, number>,
}

/** MediaPipe Pose Landmarker lite (Apache-2.0, BlazePose GHUM 3D model card). */
export const POSE_MODEL = {
  url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  sizeMB: 5.8,
}

/** One-time runtime downloads served from our own origin. */
export const RUNTIME_SIZES_MB = { onnxWebgpu: 26.9, onnxWasm: 14.3, mediapipe: 13.5 }

/** Default precision for a resolved backend. */
export function defaultDtype(device: 'webgpu' | 'wasm'): Dtype {
  return device === 'webgpu' ? 'fp16' : 'q8'
}

export function onnxFileName(dtype: Dtype): string {
  return dtype === 'q8' ? 'model_quantized.onnx' : dtype === 'fp16' ? 'model_fp16.onnx' : 'model.onnx'
}

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

export const BACKGROUND_LABEL = 0
/** Everything except Background is the person (clothes, skin, hair, accessories). */
export const PERSON_CLASSES = CLOTHES_LABELS.map((_, i) => i).filter((i) => i !== BACKGROUND_LABEL)
