import { CHROMA_KEY } from '@/components/feed/overlayConfig'

// ---------------------------------------------------------------------------
// Chroma-key engine for Layer 3 video memes (green screen removal).
//
// Two renderers share one math model so preview === export:
//   - WebGL (`createChromaRenderer`) — real-time GPU keying for the feed.
//   - Canvas 2D (`keyImageData`) — per-frame CPU keying for baked exports.
//
// Key color + thresholds come from CHROMA_KEY (overlayConfig) — fixed
// defaults, no user UI.
// // ponytail: fixed green defaults cover the current R2 memes; if shades
// diverge, promote to per-meme params before adding any picker UI.
// ---------------------------------------------------------------------------

export type ChromaKeyParams = {
  key: [number, number, number]
  similarity: number
  smoothness: number
  spill: number
}

export const DEFAULT_CHROMA_PARAMS: ChromaKeyParams = {
  key: [...CHROMA_KEY.key],
  similarity: CHROMA_KEY.similarity,
  smoothness: CHROMA_KEY.smoothness,
  spill: CHROMA_KEY.spill,
}

/** CPU keying — mutates ImageData in place (export path). Same model as the shader. */
export function keyImageData(data: ImageData, params: ChromaKeyParams = DEFAULT_CHROMA_PARAMS): void {
  const px = data.data
  const [kr, kg, kb] = params.key
  const { similarity, smoothness, spill } = params
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255
    const g = px[i + 1] / 255
    const b = px[i + 2] / 255
    const dist = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2)
    // smoothstep(similarity, similarity + smoothness, dist)
    const t = Math.min(1, Math.max(0, (dist - similarity) / (smoothness || 1e-6)))
    const alpha = t * t * (3 - 2 * t)
    // Spill suppression fades in with kept pixels so edges don't glow green.
    const cap = Math.max(r, b) + spill
    px[i + 1] = Math.round((Math.min(g, cap + (g - cap) * alpha)) * 255)
    px[i + 3] = Math.round(alpha * 255)
  }
}

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  vUV = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
}
`

const FRAG_SRC = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uKey;
uniform float uSimilarity;
uniform float uSmoothness;
uniform float uSpill;
varying vec2 vUV;
void main() {
  vec3 rgb = texture2D(uTex, vUV).rgb;
  float dist = distance(rgb, uKey);
  float alpha = smoothstep(uSimilarity, uSimilarity + uSmoothness, dist);
  float cap = max(rgb.r, rgb.b) + uSpill;
  float g = min(rgb.g, cap + (rgb.g - cap) * alpha);
  gl_FragColor = vec4(rgb.r, g, rgb.b, alpha);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export type ChromaRenderer = {
  /** Draw the current video frame keyed. Returns false when there is no frame yet. */
  draw: (video: HTMLVideoElement) => boolean
  dispose: () => void
}

/** GPU renderer for a canvas. Returns null when WebGL is unavailable (caller falls back). */
export function createChromaRenderer(
  canvas: HTMLCanvasElement,
  params: ChromaKeyParams = DEFAULT_CHROMA_PARAMS,
): ChromaRenderer | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })
  if (!gl) return null
  const lose = gl.getExtension('WEBGL_lose_context')
  // Becomes true once setup() runs against a live context; reset by
  // dispose(). After a context loss ALL gl state is wiped, so setup() must
  // fully re-run (recompile, re-create buffers/textures, re-set uniforms).
  let ready = false

  const setup = (): boolean => {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
    if (!vs || !fs) return false
    const prog = gl.createProgram()
    if (!prog) return false
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    // No UNPACK_FLIP_Y: the vertex UV already maps NDC to texture space
    // (bottom-left vertex samples the last uploaded row = video bottom).
    // Flipping here too double-flips and renders the meme upside down.

    gl.uniform3f(gl.getUniformLocation(prog, 'uKey'), params.key[0], params.key[1], params.key[2])
    gl.uniform1f(gl.getUniformLocation(prog, 'uSimilarity'), params.similarity)
    gl.uniform1f(gl.getUniformLocation(prog, 'uSmoothness'), params.smoothness)
    gl.uniform1f(gl.getUniformLocation(prog, 'uSpill'), params.spill)
    gl.clearColor(0, 0, 0, 0)
    ready = true
    return true
  }

  const onRestored = () => {
    canvas.removeEventListener('webglcontextrestored', onRestored)
    ready = false
    setup()
  }

  if (gl.isContextLost()) {
    // The canvas hands back the same dead context after dispose()
    // (scroll-away unload, src change, or a StrictMode remount) — restore it
    // first; setup() runs on the restored event. draw() reports false until
    // then so the caller keeps its rAF loop alive instead of giving up.
    canvas.addEventListener('webglcontextrestored', onRestored)
    try {
      lose?.restoreContext()
    } catch {
      // No restore path — draw() stays false and the caller falls back.
    }
  } else if (!setup()) {
    return null
  }

  return {
    draw(video) {
      if (!ready || gl.isContextLost()) return false
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return false
      const scale = Math.min(1, CHROMA_KEY.maxPreviewEdge / Math.max(video.videoWidth, video.videoHeight))
      const w = Math.max(2, Math.round(video.videoWidth * scale))
      const h = Math.max(2, Math.round(video.videoHeight * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.clear(gl.COLOR_BUFFER_BIT)
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
      } catch {
        return false
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      return true
    },
    dispose() {
      canvas.removeEventListener('webglcontextrestored', onRestored)
      ready = false
      try {
        lose?.loseContext()
      } catch {
        // Already gone.
      }
    },
  }
}
