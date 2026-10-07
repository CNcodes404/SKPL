import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface MascotPlayerProps {
  webmUrl: string
  safariUrl?: string | null
  posterUrl?: string | null
  alt: string
  muted?: boolean
  /** Show the poster instead of playing (reduced motion). */
  still?: boolean
  /** Called when the browser refuses to start playback with sound. */
  onSoundBlocked?: () => void
  className?: string
}

/**
 * Plays a transparent, looping mascot clip.
 *
 * WebKit (desktop Safari and every iOS browser) plays WebM but drops its alpha
 * channel, so there we play the "stacked" MP4 instead — colour picture on top,
 * alpha mask below — and recombine the two halves with a tiny WebGL shader.
 */
export function MascotPlayer({ webmUrl, safariUrl, posterUrl, alt, muted = true, still, onSoundBlocked, className }: MascotPlayerProps) {
  const [stacked] = useState(() => Boolean(safariUrl) && isWebKit())
  const [failed, setFailed] = useState(false)

  if ((still || failed) && posterUrl) {
    return <img src={posterUrl} alt={alt} className={cn('h-full w-full object-contain', className)} />
  }
  if (stacked && safariUrl) {
    return (
      <StackedAlphaVideo
        src={safariUrl}
        poster={posterUrl}
        alt={alt}
        muted={muted}
        onSoundBlocked={onSoundBlocked}
        onUnsupported={() => setFailed(true)}
        className={className}
      />
    )
  }
  return <AlphaVideo src={webmUrl} poster={posterUrl} alt={alt} muted={muted} onSoundBlocked={onSoundBlocked} className={className} />
}

function isWebKit(): boolean {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const safari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(ua)
  return iOS || safari
}

// Lets effects call the latest callback without re-running when a parent
// passes a new inline function each render.
function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

// React sets `muted` as a property only on mount, so keep it in sync by hand
// and (re)start playback whenever it changes.
function usePlayback(ref: React.RefObject<HTMLVideoElement>, muted: boolean, onSoundBlocked?: () => void) {
  const soundBlocked = useLatest(onSoundBlocked)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = muted
    video.play().catch(() => {
      if (!muted) soundBlocked.current?.()
    })
  }, [ref, muted, soundBlocked])
}

function AlphaVideo({
  src,
  poster,
  alt,
  muted,
  onSoundBlocked,
  className,
}: {
  src: string
  poster?: string | null
  alt: string
  muted: boolean
  onSoundBlocked?: () => void
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  usePlayback(ref, muted, onSoundBlocked)
  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      aria-label={alt}
      autoPlay
      loop
      muted={muted}
      playsInline
      className={cn('h-full w-full object-contain', className)}
    />
  )
}

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2((position.x + 1.0) / 2.0, (1.0 - position.y) / 2.0);
  gl_Position = vec4(position, 0.0, 1.0);
}`

// Top half of the frame is the picture, bottom half its alpha mask.
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D frame;
varying vec2 uv;
void main() {
  vec3 color = texture2D(frame, vec2(uv.x, uv.y * 0.5)).rgb;
  float alpha = texture2D(frame, vec2(uv.x, 0.5 + uv.y * 0.5)).r;
  gl_FragColor = vec4(color * alpha, alpha);
}`

function StackedAlphaVideo({
  src,
  poster,
  alt,
  muted,
  onSoundBlocked,
  onUnsupported,
  className,
}: {
  src: string
  poster?: string | null
  alt: string
  muted: boolean
  onSoundBlocked?: () => void
  onUnsupported: () => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const unsupported = useLatest(onUnsupported)
  const [drawn, setDrawn] = useState(false)
  usePlayback(videoRef, muted, onSoundBlocked)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl', { premultipliedAlpha: true })
    if (!video || !canvas || !gl) {
      unsupported.current()
      return
    }

    const program = gl.createProgram()!
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX_SHADER],
      [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
    ] as const) {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    gl.useProgram(program)

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    // A plain animation-frame loop rather than requestVideoFrameCallback: the
    // source video is invisible, and browsers may not "present" its frames.
    let handle = 0
    let lastTime = -1
    const draw = () => {
      handle = requestAnimationFrame(draw)
      if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth && video.currentTime !== lastTime) {
        lastTime = video.currentTime
        const width = video.videoWidth
        const height = video.videoHeight / 2
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
          gl.viewport(0, 0, width, height)
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        setDrawn(true)
      }
    }
    draw()

    return () => cancelAnimationFrame(handle)
  }, [unsupported])

  return (
    <>
      {/* Full size at 1% opacity rather than hidden: browsers pause muted
          autoplay videos they consider invisible, which would freeze the canvas. */}
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        muted={muted}
        playsInline
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.01]"
      />
      {poster && !drawn ? (
        <img src={poster} alt="" className={cn('absolute inset-0 h-full w-full object-contain', className)} />
      ) : null}
      <canvas ref={canvasRef} role="img" aria-label={alt} className={cn('h-full w-full object-contain', className)} />
    </>
  )
}
