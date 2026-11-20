import { useEffect, useRef, useState } from 'react';
import { useLauncher } from '../state/launcher';
import { liquidGlassEnabled } from '../state/preferences';
import { getGlassBackdrop, setGlassBackdropSource, subscribeGlassBackdrop } from './glass/backdrop';

// 液态玻璃透镜：用 WebGL 重建壁纸、按高度场折射，取代原先的 SVG 位移贴图。
// 折射/色散/高光算法参考 html-liquid-glass-effect-webgl 的 shader 思路重新实现。

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_backdrop;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform vec2 u_size;
uniform float u_radius;
uniform vec4 u_tint;
uniform vec4 u_dock;
uniform float u_ior;
uniform float u_thickness;
uniform float u_normal;
uniform float u_displacement;
uniform float u_transition;
uniform float u_blur;
uniform float u_dispersion;
uniform float u_highlight;
uniform float u_overlay;

varying vec2 v_uv;

float roundedBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - radius;
}

float heightAt(vec2 point) {
  vec2 halfSize = u_size * 0.5;
  float radius = min(u_radius, min(halfSize.x, halfSize.y));
  float distance = roundedBox(point - halfSize, halfSize, radius);
  float band = max(u_transition, 0.001);
  return clamp(1.0 - 1.0 / (1.0 + exp(-(distance / band) * 6.0)), 0.0, 1.0);
}

vec3 backdropAt(vec2 uv) {
  return texture2D(u_backdrop, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
}

void main() {
  vec2 point = v_uv * u_size;
  vec2 halfSize = u_size * 0.5;
  float radius = min(u_radius, min(halfSize.x, halfSize.y));
  float distance = roundedBox(point - halfSize, halfSize, radius);
  if (distance > 0.0) discard;

  // 两点中心差分求高度场梯度，得到玻璃表面的法线。
  float dx1 = heightAt(point + vec2(1.0, 0.0)) - heightAt(point - vec2(1.0, 0.0));
  float dy1 = heightAt(point + vec2(0.0, 1.0)) - heightAt(point - vec2(0.0, 1.0));
  float dx2 = heightAt(point + vec2(2.0, 0.0)) - heightAt(point - vec2(2.0, 0.0));
  float dy2 = heightAt(point + vec2(0.0, 2.0)) - heightAt(point - vec2(0.0, 2.0));
  float gradientX = mix(dx1 * 0.5, dx2 * 0.25, 0.5);
  float gradientY = mix(dy1 * 0.5, dy2 * 0.25, 0.5);
  vec3 normal = normalize(vec3(-gradientX * u_normal, -gradientY * u_normal, 1.0));

  // 垂直入射 -> 进入玻璃 -> 离开玻璃，两次折射后的横向偏移即采样位移。
  vec3 inside = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / u_ior);
  vec3 outside = refract(inside, -normal, u_ior);
  vec2 offset = outside.xy * u_thickness * u_displacement;
  vec2 uv = (u_origin + point + offset) / u_view;

  // 三通道使用略有差异的位移，让边缘出现极细的色散。
  vec2 spread = offset / u_view * u_dispersion;
  vec3 color = vec3(0.0);
  vec2 texel = vec2(u_blur) / u_view;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 tap = vec2(float(x), float(y)) * texel;
      color.r += backdropAt(uv + tap + spread).r;
      color.g += backdropAt(uv + tap).g;
      color.b += backdropAt(uv + tap - spread).b;
    }
  }
  color /= 9.0;

  // 壁纸之上还有游戏坞与胶囊自身的半透明底色，按顺序合成。
  color = mix(color, u_dock.rgb, u_dock.a);
  color = mix(color, u_tint.rgb, u_tint.a);
  color = mix(color, vec3(1.0), heightAt(point) * u_overlay);

  float highlight = 1.0 - smoothstep(0.0, max(u_highlight, 0.001), abs(distance));
  float direction = clamp((normal.x * normal.y + 1.0) * 0.5, 0.0, 1.0);
  color = mix(color, vec3(1.0), highlight * direction * 0.85);

  gl_FragColor = vec4(color, 1.0);
}`;

const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

const lens = {
  ior: 1.12,
  thickness: 22,
  normal: 5.5,
  displacement: 1,
  transition: 6,
  blur: 6,
  dispersion: 0.07,
  highlight: 2.5,
  overlay: 0.07,
  dockAttenuation: 0.55,
};

function compile(gl: WebGLRenderingContext, type: number, text: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, text);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(gl: WebGLRenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function LiquidGlassSurface({ tone = 'glass' }: { tone?: 'glass' | 'launch' | 'panel' }) {
  const { state } = useLauncher();
  const enabled = liquidGlassEnabled(state.preferences);
  const preferences = state.preferences;
  const host = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const redraw = useRef<() => void>(() => {});
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    setGlassBackdropSource(
      preferences.background === 'diy'
        ? { kind: 'tint', color: preferences.backgroundTint }
        : preferences.background === 'custom' && preferences.customImage
          ? { kind: 'image', url: preferences.customImage }
          : { kind: 'none' },
    );
  }, [preferences.background, preferences.backgroundTint, preferences.customImage]);

  // 主题、面板透明度等令牌变化只重绘，不重建 WebGL 上下文。
  useEffect(() => {
    redraw.current();
  }, [preferences.glass, preferences.theme]);

  useEffect(() => {
    if (!enabled) return;
    const hostElement = host.current;
    const canvasElement = canvas.current;
    if (!hostElement || !canvasElement) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvasElement.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
      });
    } catch {
      gl = null;
    }
    if (!gl) {
      setWebgl(false);
      return;
    }
    const context = gl;

    const program = buildProgram(context);
    if (!program) {
      setWebgl(false);
      return;
    }

    // 1×1 探针把任意 CSS 颜色（含 color-mix / 8 位 hex）解析成 RGBA。
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const probeContext = probe.getContext('2d', { willReadFrequently: true });
    const readColor = (value: string, fallback: [number, number, number, number]) => {
      if (!probeContext || !value || !CSS.supports('color', value)) return fallback;
      probeContext.clearRect(0, 0, 1, 1);
      probeContext.fillStyle = value;
      probeContext.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = probeContext.getImageData(0, 0, 1, 1).data;
      return [red / 255, green / 255, blue / 255, alpha / 255];
    };

    const parent = hostElement.parentElement;
    parent?.classList.add('glass-host');
    setWebgl(true);

    const buffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(context.ARRAY_BUFFER, quad, context.STATIC_DRAW);
    const position = context.getAttribLocation(program, 'a_position');
    context.enableVertexAttribArray(position);
    context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);

    const texture = context.createTexture();
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.RGBA,
      1,
      1,
      0,
      context.RGBA,
      context.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );

    const uniform = (name: string) => context.getUniformLocation(program, name);
    const u = {
      backdrop: uniform('u_backdrop'),
      view: uniform('u_view'),
      origin: uniform('u_origin'),
      size: uniform('u_size'),
      radius: uniform('u_radius'),
      tint: uniform('u_tint'),
      dock: uniform('u_dock'),
      ior: uniform('u_ior'),
      thickness: uniform('u_thickness'),
      normal: uniform('u_normal'),
      displacement: uniform('u_displacement'),
      transition: uniform('u_transition'),
      blur: uniform('u_blur'),
      dispersion: uniform('u_dispersion'),
      highlight: uniform('u_highlight'),
      overlay: uniform('u_overlay'),
    };

    let uploaded = -1;
    let frame = 0;
    let disposed = false;

    const draw = () => {
      if (disposed || !hostElement.isConnected) return;
      const bounds = hostElement.getBoundingClientRect();
      if (bounds.width < 4 || bounds.height < 4) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(bounds.width * dpr));
      const pixelHeight = Math.max(1, Math.round(bounds.height * dpr));
      if (canvasElement.width !== pixelWidth || canvasElement.height !== pixelHeight) {
        canvasElement.width = pixelWidth;
        canvasElement.height = pixelHeight;
      }

      const backdrop = getGlassBackdrop();
      context.viewport(0, 0, pixelWidth, pixelHeight);
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);
      context.useProgram(program);
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, texture);
      if (uploaded !== backdrop.revision) {
        context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false);
        context.texImage2D(
          context.TEXTURE_2D,
          0,
          context.RGBA,
          context.RGBA,
          context.UNSIGNED_BYTE,
          backdrop.canvas,
        );
        uploaded = backdrop.revision;
      }

      const rootStyle = getComputedStyle(document.documentElement);
      // 面板透镜跟随「面板透明度」滑块：surface 颜色 + --glass 百分比。
      const tint =
        tone === 'panel'
          ? (() => {
              const surface = readColor(
                rootStyle.getPropertyValue('--surface').trim(),
                [1, 1, 1, 1],
              );
              const alpha = parseFloat(rootStyle.getPropertyValue('--glass')) || 85;
              return [surface[0], surface[1], surface[2], alpha / 100];
            })()
          : readColor(
              rootStyle
                .getPropertyValue(tone === 'launch' ? '--launch-fill' : '--glass-fill')
                .trim(),
              [1, 1, 1, 0],
            );
      // 游戏坞在壁纸之上还有一层底色；只取一部分，保留透镜的通透感。
      const dockElement = parent?.closest('.game-dock');
      const dock = readColor(
        dockElement ? getComputedStyle(dockElement).backgroundColor : '',
        [0, 0, 0, 0],
      );
      const radius =
        parseFloat(parent ? getComputedStyle(parent).borderTopLeftRadius : '') || bounds.height / 2;

      context.uniform1i(u.backdrop, 0);
      context.uniform2f(u.view, window.innerWidth, window.innerHeight);
      context.uniform2f(u.origin, bounds.left, bounds.top);
      context.uniform2f(u.size, bounds.width, bounds.height);
      context.uniform1f(u.radius, radius);
      context.uniform4f(u.tint, tint[0], tint[1], tint[2], tint[3]);
      context.uniform4f(u.dock, dock[0], dock[1], dock[2], dock[3] * lens.dockAttenuation);
      context.uniform1f(u.ior, lens.ior);
      context.uniform1f(u.thickness, lens.thickness);
      context.uniform1f(u.normal, lens.normal);
      context.uniform1f(u.displacement, lens.displacement);
      context.uniform1f(u.transition, lens.transition);
      context.uniform1f(u.blur, lens.blur);
      context.uniform1f(u.dispersion, lens.dispersion);
      context.uniform1f(u.highlight, lens.highlight);
      context.uniform1f(u.overlay, lens.overlay);
      context.drawArrays(context.TRIANGLES, 0, 6);
    };

    const schedule = () => {
      if (frame || disposed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    };
    redraw.current = schedule;

    const observer = new ResizeObserver(schedule);
    observer.observe(hostElement);
    const unsubscribe = subscribeGlassBackdrop(schedule);
    window.addEventListener('resize', schedule);
    // 面板会随页面滚动，壁纸固定在视口上，因此滚动时也要重绘。
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    schedule();

    return () => {
      disposed = true;
      redraw.current = () => {};
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, { capture: true });
      parent?.classList.remove('glass-host');
      context.deleteTexture(texture);
      context.deleteBuffer(buffer);
      context.deleteProgram(program);
      context.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [enabled, tone]);

  if (!enabled) return null;
  return (
    <span
      ref={host}
      className="glass-lens"
      aria-hidden="true"
      data-glass-canvas={webgl ? 'on' : 'off'}
    >
      <canvas ref={canvas} className="glass-canvas" />
    </span>
  );
}
