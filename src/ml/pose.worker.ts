/// <reference lib="webworker" />
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { LandmarkName, PoseLandmarks } from '../domain/types'
import { fetchCached } from './cachedFetch'
import { POSE_MODEL } from './models'
import type { Outbound, PoseRequest, PoseResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

// BlazePose indices for the landmarks we keep.
const INDEX: Record<LandmarkName, number> = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
}

let landmarker: PoseLandmarker | null = null

function post(message: Outbound<PoseResponse>) {
  self.postMessage(message)
}

async function handleLoad() {
  const start = performance.now()
  if (!landmarker) {
    // MediaPipe's WASM is served from our origin (/mediapipe/) and cached by the service worker.
    // useModule = true: module workers cannot use importScripts.
    const fileset = await FilesetResolver.forVisionTasks(
      new URL(`${import.meta.env.BASE_URL}mediapipe`, self.location.origin).href,
      true,
    )
    const model = await fetchCached(POSE_MODEL.url, (loaded, total) => {
      post({ type: 'progress', loaded, total })
    })
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate: 'CPU' },
      runningMode: 'IMAGE',
      numPoses: 1,
    })
  }
  post({ type: 'loaded', ms: performance.now() - start })
}

function handleDetect(image: ImageBitmap) {
  if (!landmarker) throw new Error('Pose model not loaded')
  const start = performance.now()
  const result = landmarker.detect(image)
  image.close()
  const points = result.landmarks[0] ?? []
  const landmarks: PoseLandmarks = {}
  for (const [name, index] of Object.entries(INDEX) as [LandmarkName, number][]) {
    const p = points[index]
    if (p) landmarks[name] = { x: p.x, y: p.y, visibility: p.visibility }
  }
  post({ type: 'pose', landmarks, ms: performance.now() - start })
}

function handleDispose() {
  landmarker?.close()
  landmarker = null
  post({ type: 'disposed' })
}

self.onmessage = (event: MessageEvent<PoseRequest>) => {
  const message = event.data
  const task = Promise.resolve().then(() => {
    if (message.type === 'load') return handleLoad()
    if (message.type === 'dispose') {
      handleDispose()
      return
    }
    handleDetect(message.image)
  })
  task.catch((err: unknown) => {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  })
}
