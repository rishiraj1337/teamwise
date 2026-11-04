// Lightweight Web Audio API synthesized notification sound
// Works in modern browsers without needing external audio files

class SoundNotificationService {
  private audioCtx: AudioContext | null = null

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    try {
      if (!this.audioCtx) {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass()
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume()
      }
      return this.audioCtx
    } catch {
      return null
    }
  }

  isSoundEnabled(): boolean {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('finai_sound_enabled')
    return saved !== 'false'
  }

  setSoundEnabled(enabled: boolean): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('finai_sound_enabled', enabled ? 'true' : 'false')
    }
  }

  /**
   * Plays a gentle, modern harmonic chime
   */
  playChime(): void {
    if (!this.isSoundEnabled()) return

    try {
      const ctx = this.getAudioContext()
      if (!ctx) return

      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      // Primary tone: F#5 (739.99 Hz) transitioning to A#5 (932.33 Hz)
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(739.99, now)
      osc1.frequency.exponentialRampToValueAtTime(932.33, now + 0.12)

      // Harmonics / sparkle tone: C#6 (1108.73 Hz)
      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(1108.73, now)
      osc2.frequency.exponentialRampToValueAtTime(1479.98, now + 0.15)

      // Smooth decay envelope
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.18, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.45)
      osc2.stop(now + 0.45)
    } catch {
      // Audio autoplay policy or device restrictions
    }
  }
}

export const soundService = new SoundNotificationService()
