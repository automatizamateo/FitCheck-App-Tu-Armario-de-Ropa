let ctx: AudioContext | null = null

/** Creates/resumes the AudioContext. Call from a tap so iOS allows sound later in a timer. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
  } catch {
    ctx = null
  }
}

/** A short sine beep (no audio files needed). Silent if audio is unavailable or the phone is muted. */
export function beep(frequency = 880, durationMs = 90, volume = 0.15) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durationMs / 1000)
}
