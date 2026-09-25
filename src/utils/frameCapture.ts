// Browser-side frame handling for the scorekeeper tracker: crop the shared
// Smash Karts tab to the scoreboard panel, detect whether its text changed,
// and encode it for the extract-scoreboard function.

/** Crop area as fractions (0–1) of the shared video frame. */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

/** Roughly the centre scoreboard panel at 1920×1080 with the browser maximised. */
export const DEFAULT_CROP: CropRect = { x: 0.3, y: 0.2, w: 0.42, h: 0.62 }

const CROP_STORAGE_KEY = 'skpl.scorekeeper.crop'

export function loadCrop(): CropRect {
  try {
    const raw = localStorage.getItem(CROP_STORAGE_KEY)
    if (raw) {
      const c = JSON.parse(raw) as CropRect
      if ([c.x, c.y, c.w, c.h].every((n) => typeof n === 'number' && n >= 0 && n <= 1) && c.w > 0.05 && c.h > 0.05) {
        return c
      }
    }
  } catch {
    // Storage unavailable or corrupt: fall back to the default.
  }
  return DEFAULT_CROP
}

export function saveCrop(crop: CropRect) {
  try {
    localStorage.setItem(CROP_STORAGE_KEY, JSON.stringify(crop))
  } catch {
    // Not critical — the crop just won't be remembered.
  }
}

export interface Frame {
  image: CanvasImageSource
  width: number
  height: number
  close?: () => void
}

interface ImageCaptureLike {
  grabFrame(): Promise<ImageBitmap>
}

/**
 * Returns a function that grabs the latest frame of the shared tab.
 *
 * Uses ImageCapture on the video track where available (Chrome/Edge): it
 * keeps delivering frames even when the SKPL tab is in the background and its
 * <video> element isn't being painted. Falls back to the <video> element.
 */
export function createFrameGrabber(track: MediaStreamTrack, video: HTMLVideoElement): () => Promise<Frame | null> {
  const Ctor = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture
  const capture = Ctor ? new Ctor(track) : null

  return async () => {
    if (capture && track.readyState === 'live') {
      try {
        const bitmap = await capture.grabFrame()
        return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
      } catch {
        // Fall through to the video element.
      }
    }
    if (!video.videoWidth || !video.videoHeight) return null
    return { image: video, width: video.videoWidth, height: video.videoHeight }
  }
}

/** Draws the whole frame, scaled down to at most maxWidth pixels wide. */
export function drawFullFrame(frame: Frame, maxWidth = 1280): HTMLCanvasElement {
  const scale = Math.min(1, maxWidth / frame.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(frame.width * scale)
  canvas.height = Math.round(frame.height * scale)
  canvas.getContext('2d')?.drawImage(frame.image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Draws the cropped scoreboard area, scaled down to at most maxWidth pixels wide. */
export function drawCroppedFrame(frame: Frame, crop: CropRect, maxWidth = 1000): HTMLCanvasElement {
  const sx = Math.round(crop.x * frame.width)
  const sy = Math.round(crop.y * frame.height)
  const sw = Math.max(1, Math.round(crop.w * frame.width))
  const sh = Math.max(1, Math.round(crop.h * frame.height))
  const scale = Math.min(1, maxWidth / sw)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  canvas.getContext('2d')?.drawImage(frame.image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * A steady tick that keeps firing while the SKPL tab is in the background.
 * Browsers throttle main-thread timers in hidden tabs, but messages from a
 * worker are still delivered promptly.
 */
export function startWorkerTicker(intervalMs: number, onTick: () => void): () => void {
  const source = `let id; onmessage = (e) => { clearInterval(id); if (e.data > 0) id = setInterval(() => postMessage(0), e.data) }`
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  const worker = new Worker(url)
  worker.onmessage = onTick
  worker.postMessage(intervalMs)
  return () => {
    worker.postMessage(0)
    worker.terminate()
    URL.revokeObjectURL(url)
  }
}

const CELL = 4

/**
 * A coarse map of where the bright text (white/yellow names and numbers) is.
 * The panel is see-through, so the moving game world behind it changes every
 * frame; keeping only very bright pixels isolates the text on top.
 */
export function textMask(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const cols = Math.ceil(canvas.width / CELL)
  const rows = Math.ceil(canvas.height / CELL)
  const mask = new Uint8Array(cols * rows)
  if (!ctx) return mask
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y += CELL) {
    for (let x = 0; x < canvas.width; x += CELL) {
      const i = (y * canvas.width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const white = r > 215 && g > 215 && b > 215
      const yellow = r > 215 && g > 190 && b < 130
      if (white || yellow) mask[(y / CELL) * cols + x / CELL] = 1
    }
  }
  return mask
}

/** Number of cells whose brightness differs between two masks of the same size. */
export function maskDifference(a: Uint8Array | null, b: Uint8Array): number {
  if (!a || a.length !== b.length) return Number.POSITIVE_INFINITY
  let diff = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++
  return diff
}

/** A changed digit is ~30+ cells; below this is capture noise. */
export const CHANGE_THRESHOLD = 12

export async function canvasToBase64(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  if (!blob) throw new Error('Could not encode the captured frame.')
  return blobToBase64(blob)
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
