import type { Phase } from "../../shared/clock"
import type { Scene } from "../../shared/sky"

const clamp = (x: number) => Math.min(1, Math.max(0, x))
const seeded = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const oceanSynth = () => {
  const ctx = new AudioContext(), rate = ctx.sampleRate, rng = seeded(1987)
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -12
  limiter.knee.value = 8
  limiter.ratio.value = 12
  limiter.attack.value = 0.005
  limiter.release.value = 0.3
  limiter.connect(ctx.destination)
  const master = ctx.createGain()
  master.connect(limiter)
  const hush = ctx.createBiquadFilter()
  hush.type = "lowpass"
  hush.frequency.value = 16000
  hush.connect(master)
  const echo = ctx.createDelay(1), feed = ctx.createGain(), tone = ctx.createBiquadFilter()
  echo.delayTime.value = 0.43
  feed.gain.value = 0.4
  tone.type = "lowpass"
  tone.frequency.value = 2200
  echo.connect(tone).connect(feed).connect(echo)
  tone.connect(hush)

  // brown noise in stereo, its loop seam crossfaded so it never ticks; white noise
  const brown = ctx.createBuffer(2, rate * 8, rate)
  for (let c = 0; c < 2; c++) {
    const out = brown.getChannelData(c), fade = rate, raw = new Float32Array(out.length + fade)
    let last = 0
    for (let i = 0; i < raw.length; i++) raw[i] = last = (last + 0.02 * (rng() * 2 - 1)) / 1.02
    for (let i = 0; i < out.length; i++) {
      const k = i < fade ? i / fade : 1
      out[i] = i < fade ? raw[i]! * Math.sin((k * Math.PI) / 2) + raw[out.length + i]! * Math.cos((k * Math.PI) / 2) : raw[i]!
    }
    const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    for (let i = 0; i < out.length; i++) out[i]! /= peak * 2
  }
  const white = ctx.createBuffer(1, rate * 3, rate)
  for (let i = 0, d = white.getChannelData(0); i < d.length; i++) d[i] = rng() * 2 - 1
  const loop = (buffer: AudioBuffer, ...chain: AudioNode[]) => {
    const src = ctx.createBufferSource(), level = ctx.createGain()
    src.buffer = buffer
    src.loop = true
    level.gain.value = 0
    let end: AudioNode = src
    for (const node of chain) end = end.connect(node)
    end.connect(level).connect(hush)
    src.start(0, rng() * 2)
    return level.gain
  }
  const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
  }
  const lfo = (hz: number, depth: number, target: AudioParam) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = hz
    g.gain.value = depth
    o.connect(g).connect(target)
    o.start()
  }

  const seaLow = filter("lowpass", 400), seaPan = ctx.createStereoPanner()
  lfo(0.04, 0.35, seaPan.pan)
  const seaGain = loop(brown, seaLow, seaPan)
  const bodyBand = filter("bandpass", 900, 0.4), body = loop(white, bodyBand)
  // rain is a steady hush with its top rolled off, never a crackle of single drops
  const rainFloor = filter("highpass", 400), rainTop = filter("lowpass", 2200), rainGain = loop(white, rainFloor, rainTop)
  const windBand = filter("bandpass", 500, 1.1), windGain = loop(brown, windBand)
  lfo(0.06, 160, windBand.frequency)
  lfo(0.13, 90, windBand.frequency)

  const guide = ctx.createOscillator(), guideGain = ctx.createGain(), airBand = filter("bandpass", 900, 1.5)
  guide.frequency.value = 196
  guideGain.gain.value = 0
  guide.connect(guideGain).connect(hush)
  guide.start()
  const air = loop(white, airBand)

  const ping = (freq: number, gain: number, attack: number, decay: number, at: number, pan = 0, send = 0.5) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner(), wet = ctx.createGain()
    o.frequency.value = freq
    p.pan.value = pan
    wet.gain.value = send
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + attack)
    g.gain.exponentialRampToValueAtTime(1e-4, at + attack + decay)
    o.connect(g).connect(p)
    p.connect(hush)
    p.connect(wet).connect(echo)
    o.start(at)
    o.stop(at + attack + decay + 0.1)
  }
  const bell = (freq: number, at: number) => {
    for (const [ratio, gain, decay] of [[1, 0.07, 3.2], [2, 0.014, 1.6], [3, 0.004, 0.8]] as const) ping(freq * ratio, gain, 0.03, decay, at, 0, 0.6)
  }

  let swell = -1, smoothedAt = 0, nextClink = 4, nextTick = 0, muted = false, loud = 0.2
  const set = (p: AudioParam, v: number, tc: number) => p.setTargetAtTime(v, ctx.currentTime, tc)
  return {
    wake: () => (ctx.state === "suspended" ? ctx.resume() : Promise.resolve()),
    hold: () => (ctx.state === "running" ? ctx.suspend() : Promise.resolve()),
    mute: (on: boolean) => {
      muted = on
      set(master.gain, on ? 0 : loud, 0.05)
    },
    level: (volume: number) => {
      loud = 0.5 * volume
      if (!muted) set(master.gain, loud, 0.1)
    },
    follow: (target: number, scene?: Scene) => {
      const s = { wind: 0.25, rain: 0, snow: 0, storm: 0, gust: 0, showers: 0, ...scene }
      const now = ctx.currentTime, dt = Math.min(1, now - smoothedAt)
      smoothedAt = now
      swell = swell < 0 ? target : swell + (target - swell) * (1 - Math.exp(-dt / (target > swell ? 0.7 : 1.9)))
      const calm = 0.55 + 0.45 * s.wind, rough = clamp(s.storm + 0.6 * s.gust)
      set(seaGain, (0.2 + 0.5 * swell) * calm + 0.25 * rough, 0.3)
      set(seaLow.frequency, (220 + 800 * swell) * (0.8 + 0.4 * s.wind) + 500 * rough, 0.3)
      set(windGain, 0.015 + 0.1 * s.wind ** 1.3 + 0.1 * s.gust + 0.08 * s.storm, 1.2)
      set(windBand.frequency, 380 + 420 * s.wind + 300 * s.gust, 1.5)
      const near = clamp((1 - s.showers) * 0.5 + s.showers * 0.05 + s.storm * 0.5), rain = s.rain * near
      set(rainGain, 0.03 * rain ** 0.8, 0.8)
      set(rainTop.frequency, 1500 + 1300 * near, 0.8)
      set(body, 0.05 * rain ** 2, 0.8)
      set(hush.frequency, 16000 - 13500 * s.snow, 1.2)
      if (muted) return
      if (now > nextClink) {
        nextClink = now + (14 + 30 * rng()) / (0.4 + 1.6 * s.wind)
        const f = 1900 + 1400 * rng()
        for (const [r, g] of [[1, 0.012], [1.51, 0.006]] as const) ping(f * r, g * (0.5 + 0.5 * s.wind), 0.002, 0.35, now, rng() * 0.6 + 0.2, 0.9)
      }
      const icy = s.storm >= 1 ? 1 : s.rain * s.snow > 0.1 ? s.rain * s.snow : 0
      if (now > nextTick) {
        nextTick = now + (0.12 + 1.4 * rng()) / Math.max(0.2, icy)
        if (icy > 0) ping(4200 + 3000 * rng(), (0.008 + 0.012 * rng()) * (1 - 0.7 * s.showers), 0.001, 0.03, now, rng() * 1.6 - 0.8, 0.4)
      }
    },
    breath: (phase?: Phase) => {
      if (!phase) {
        set(guideGain.gain, 0, 0.35)
        set(air, 0, 0.35)
        return
      }
      set(guide.frequency, 196 * 2 ** ((phase.level * 9) / 12), 0.08)
      set(guideGain.gain, 0.006 + 0.008 * phase.level, 0.15)
      set(airBand.frequency, 500 + 1500 * phase.level, 0.15)
      set(air, 0.01 + 0.02 * phase.level, 0.2)
    },
    plop: () => {
      const now = ctx.currentTime + 0.01, src = ctx.createBufferSource(), low = filter("lowpass", 1500, 0.5), g = ctx.createGain()
      src.buffer = white
      low.frequency.setValueAtTime(1500, now)
      low.frequency.exponentialRampToValueAtTime(500, now + 0.45)
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(0.022, now + 0.03)
      g.gain.exponentialRampToValueAtTime(1e-4, now + 0.6)
      src.connect(low).connect(g).connect(hush)
      src.start(now, rng() * 2)
      src.stop(now + 0.65)
    },
    chime: (kind: "turn" | "end" = "end") => {
      const now = ctx.currentTime + 0.02
      bell(392, now)
      if (kind === "end") bell(523.25, now + 0.55)
    },
    thunder: (near: number) => {
      const now = ctx.currentTime, tail = 9 + 3 * near
      const src = ctx.createBufferSource(), low = filter("lowpass", 0, 0.5), level = ctx.createGain(), pan = ctx.createStereoPanner()
      src.buffer = brown
      pan.pan.value = rng() * 1.2 - 0.6
      low.frequency.setValueAtTime(120 + 480 * near, now)
      low.frequency.exponentialRampToValueAtTime(55, now + tail)
      const peak = 0.3 + 0.6 * near
      level.gain.setValueAtTime(0, now)
      level.gain.linearRampToValueAtTime(peak, now + 0.06 + 0.5 * (1 - near))
      for (let i = 1; i < 5; i++) level.gain.linearRampToValueAtTime((peak * (0.9 - 0.15 * i)) * (0.6 + 0.4 * rng()), now + 0.8 * i + rng() * 0.8)
      level.gain.exponentialRampToValueAtTime(1e-4, now + tail)
      src.connect(low).connect(level).connect(pan).connect(hush)
      src.start(now, rng() * 6)
      src.stop(now + tail + 0.1)
      src.onended = () => pan.disconnect()
      if (near > 0.5) {
        const crack = ctx.createBufferSource(), edge = filter("bandpass", 700 + 500 * near, 0.7), c = ctx.createGain()
        crack.buffer = white
        c.gain.setValueAtTime(0, now)
        c.gain.linearRampToValueAtTime(0.12 * (near - 0.4), now + 0.02)
        c.gain.exponentialRampToValueAtTime(1e-4, now + 0.5)
        crack.connect(edge).connect(c).connect(hush)
        crack.start(now, rng() * 2)
        crack.stop(now + 0.6)
      }
    },
    fadeOut: () => set(master.gain, 0, 0.25),
    close: () => void (ctx.state === "closed" || ctx.close()),
  }
}
export type OceanSynth = ReturnType<typeof oceanSynth>
