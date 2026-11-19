import { hexToRgb } from '../../domain/background-tint';

export type GlassBackdropSource =
  | { kind: 'none' }
  | { kind: 'tint'; color: string }
  | { kind: 'image'; url: string };

const lightOverlay = 'rgba(245, 246, 243, 0.35)';
const darkOverlay = 'rgba(21, 28, 25, 0.45)';

let source: GlassBackdropSource = { kind: 'none' };
let revision = 0;
let surface: HTMLCanvasElement | null = null;
let paintedRevision = -1;
let image: HTMLImageElement | null = null;
let imageUrl = '';
const listeners = new Set<() => void>();
let watching = false;

function notify() {
  for (const listener of [...listeners]) listener();
}

function sameSource(a: GlassBackdropSource, b: GlassBackdropSource) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'tint') return b.kind === 'tint' && a.color === b.color;
  if (a.kind === 'image') return b.kind === 'image' && a.url === b.url;
  return true;
}

/** 与 body 的壁纸声明保持同一套参数，供 WebGL 透镜按视口坐标采样。 */
export function setGlassBackdropSource(next: GlassBackdropSource) {
  if (sameSource(next, source)) return;
  source = next;
  revision += 1;
  notify();
}

export function subscribeGlassBackdrop(listener: () => void) {
  listeners.add(listener);
  if (!watching) {
    watching = true;
    window.addEventListener('resize', () => {
      revision += 1;
      notify();
    });
    new MutationObserver(() => {
      revision += 1;
      notify();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** 惰性绘制整屏背景；版本号变化时才重新取色，透镜据此决定是否重传纹理。 */
export function getGlassBackdrop() {
  if (!surface) surface = document.createElement('canvas');
  if (paintedRevision !== revision) {
    paint(surface);
    paintedRevision = revision;
  }
  return { canvas: surface, revision };
}

function loadImage(url: string) {
  imageUrl = url;
  image = null;
  const next = new Image();
  next.onload = () => {
    if (imageUrl !== url) return;
    image = next;
    revision += 1;
    notify();
  };
  next.src = url;
}

function paint(target: HTMLCanvasElement) {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (target.width !== pixelWidth) target.width = pixelWidth;
  if (target.height !== pixelHeight) target.height = pixelHeight;
  const context = target.getContext('2d');
  if (!context) return;
  context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(document.body).backgroundColor || '#000';
  context.fillRect(0, 0, width, height);
  if (source.kind === 'image') {
    if (imageUrl !== source.url) loadImage(source.url);
    if (image && image.complete && image.naturalWidth > 0) {
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      context.drawImage(
        image,
        (width - drawWidth) / 2,
        (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
    }
  } else if (source.kind === 'tint') {
    const [red, green, blue] = hexToRgb(source.color);
    const lift = (channel: number) => Math.round(channel + (255 - channel) * 0.55);
    // 与 tintGradient 的 130deg 线性渐变一致：CSS 角度从“向上”开始顺时针旋转。
    const angle = (130 * Math.PI) / 180;
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    const length = Math.abs(width * dx) + Math.abs(height * dy);
    const gradient = context.createLinearGradient(
      width / 2 - (dx * length) / 2,
      height / 2 - (dy * length) / 2,
      width / 2 + (dx * length) / 2,
      height / 2 + (dy * length) / 2,
    );
    gradient.addColorStop(0, `rgb(${lift(red)}, ${lift(green)}, ${lift(blue)})`);
    gradient.addColorStop(1, `rgb(${red}, ${green}, ${blue})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  context.fillStyle =
    document.documentElement.dataset.theme === 'dark' ? darkOverlay : lightOverlay;
  context.fillRect(0, 0, width, height);
}
