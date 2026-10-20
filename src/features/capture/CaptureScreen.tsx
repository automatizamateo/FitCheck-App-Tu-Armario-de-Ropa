import { useCallback, useEffect, useRef, useState } from 'react'
import type { View } from '../../domain/types'
import { beep, unlockAudio } from '../../lib/beep'
import { haptic } from '../../lib/haptics'
import { useObjectUrl } from '../../lib/useObjectUrl'
import { BodyGuide } from './BodyGuide'

const TIMERS = [0, 3, 5, 10] as const
type Timer = (typeof TIMERS)[number]
const TIMER_KEY = 'fitcheck-capture-timer'

interface CaptureScreenProps {
  view: View
  step: string // e.g. "1 of 3"
  tip: string
  /** Earlier cut-out for this view, shown as a semi-transparent silhouette to match pose and distance. */
  overlay: Blob | null
  onCaptured: (photo: Blob) => void
  onClose: () => void
  onShowTips: () => void
}

function readTimer(): Timer {
  try {
    const v = Number(localStorage.getItem(TIMER_KEY))
    return (TIMERS as readonly number[]).includes(v) ? (v as Timer) : 5
  } catch {
    return 5
  }
}

export function CaptureScreen({ view, step, tip, overlay, onCaptured, onClose, onShowTips }: CaptureScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [frame, setFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [timer, setTimer] = useState<Timer>(readTimer)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const overlayUrl = useObjectUrl(overlay)
  const countdownRef = useRef<number | null>(null)
  const hasCameraApi = 'mediaDevices' in navigator && typeof navigator.mediaDevices.getUserMedia === 'function'

  // Camera stream; always stopped on unmount so the iOS camera indicator turns off.
  useEffect(() => {
    if (!hasCameraApi) return
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => {
            t.stop()
          })
          return
        }
        stream = s
        const video = videoRef.current
        if (video) {
          video.srcObject = s
          // Rejects harmlessly if the screen closes before playback starts.
          video.play().catch(() => undefined)
        }
        setStreamError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        setStreamError(
          name === 'NotAllowedError'
            ? 'Camera access was denied. Allow it in Settings → Safari → Camera, or use “Take photo”.'
            : 'The camera could not start. Use “Take photo” or pick one from your library.',
        )
      })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => {
        t.stop()
      })
    }
  }, [facing, hasCameraApi])

  const cameraError = hasCameraApi
    ? streamError
    : 'This browser has no camera access. Use “Take photo” or pick one from your library.'

  // Where the video image actually sits inside the box (object-contain), so the overlay lines up.
  const layout = useCallback(() => {
    const video = videoRef.current
    const box = boxRef.current
    if (!video?.videoWidth || !box) return
    const bw = box.clientWidth
    const bh = box.clientHeight
    const s = Math.min(bw / video.videoWidth, bh / video.videoHeight)
    const width = video.videoWidth * s
    const height = video.videoHeight * s
    setFrame({ left: (bw - width) / 2, top: (bh - height) / 2, width, height })
  }, [])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(layout)
    observer.observe(box)
    return () => {
      observer.disconnect()
    }
  }, [layout])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    setFlash(true)
    window.setTimeout(() => {
      setFlash(false)
    }, 180)
    canvas.toBlob(
      (blob) => {
        if (blob) onCaptured(blob)
      },
      'image/jpeg',
      0.92,
    )
  }, [onCaptured])

  const stopCountdown = () => {
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current)
    countdownRef.current = null
    setCountdown(null)
  }

  useEffect(() => stopCountdown, [])

  const shutter = () => {
    if (countdown !== null) {
      stopCountdown()
      return
    }
    unlockAudio()
    haptic()
    if (timer === 0) {
      capture()
      return
    }
    let remaining: number = timer
    setCountdown(remaining)
    beep(660)
    countdownRef.current = window.setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        stopCountdown()
        beep(1320, 160)
        haptic()
        capture()
        return
      }
      setCountdown(remaining)
      beep(remaining <= 2 ? 990 : 660)
      haptic()
    }, 1000)
  }

  const cycleTimer = () => {
    const next = TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length] ?? 0
    setTimer(next)
    try {
      localStorage.setItem(TIMER_KEY, String(next))
    } catch {
      /* not remembered */
    }
  }

  const pickFile = (file: File | undefined) => {
    if (file) onCaptured(file)
  }

  const mirrored = facing === 'user'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none [-webkit-touch-callout:none]">
      <div className="pt-safe px-safe flex h-[calc(env(safe-area-inset-top)+3.5rem)] items-center justify-between">
        <button type="button" onClick={onClose} className="-ml-2 flex size-11 items-center justify-center text-[15px]">
          Cancel
        </button>
        <div className="text-center">
          <p className="text-[15px] font-semibold capitalize">{view}</p>
          <p className="text-xs text-white/60">{step}</p>
        </div>
        <button type="button" onClick={onShowTips} className="-mr-2 flex size-11 items-center justify-center text-[15px]">
          Tips
        </button>
      </div>

      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        {cameraError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-[15px] leading-relaxed text-white/80">{cameraError}</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            onLoadedMetadata={layout}
            className={`h-full w-full object-contain ${mirrored ? '-scale-x-100' : ''}`}
          />
        )}
        {!cameraError && frame && (
          <div
            className={`pointer-events-none absolute ${mirrored ? '-scale-x-100' : ''}`}
            style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
          >
            {overlayUrl ? (
              <img src={overlayUrl} alt="" className="h-full w-full object-contain opacity-40" />
            ) : (
              <div className="flex h-full items-center justify-center py-[4%]">
                <BodyGuide view={view} />
              </div>
            )}
          </div>
        )}
        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span key={countdown} className="animate-[fade-in_200ms] text-[120px] font-bold tabular-nums drop-shadow-lg">
              {countdown}
            </span>
          </div>
        )}
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}
      </div>

      <div className="pb-safe px-safe">
        <p className="py-3 text-center text-sm text-white/80">{tip}</p>
        <div className="flex items-center justify-between pb-4">
          <label className="flex size-14 cursor-pointer flex-col items-center justify-center rounded-full bg-white/10 text-[11px]">
            Library
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>

          {cameraError ? (
            <label className="flex h-[72px] cursor-pointer items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-black">
              Take photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          ) : (
            <button
              type="button"
              aria-label={countdown !== null ? 'Cancel timer' : 'Take photo'}
              onClick={shutter}
              className="flex size-[76px] items-center justify-center rounded-full border-4 border-white transition active:scale-90"
            >
              <span className={`rounded-full ${countdown !== null ? 'size-7 rounded-md bg-red-500' : 'size-[60px] bg-white'}`} />
            </button>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={cycleTimer}
              aria-label="Self-timer"
              className="flex size-14 items-center justify-center rounded-full bg-white/10 text-sm font-semibold tabular-nums"
            >
              {timer === 0 ? 'Off' : `${timer}s`}
            </button>
          </div>
        </div>
        {!cameraError && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={() => {
                setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
              }}
              className="h-11 rounded-full px-4 text-xs text-white/70"
            >
              Switch camera
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
