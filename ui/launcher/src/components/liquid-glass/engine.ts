export interface Uv {
  x: number;
  y: number;
}

export type Fragment = (uv: Uv, mouse: Uv) => Uv;

export interface LiquidGlassShaderOptions {
  width?: number;
  height?: number;
  fragment?: Fragment;
}

function smoothStep(a: number, b: number, t: number) {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function length(x: number, y: number) {
  return Math.sqrt(x * x + y * y);
}

function roundedRectSDF(x: number, y: number, width: number, height: number, radius: number) {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;
  return Math.min(Math.max(qx, qy), 0) + length(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

function texture(x: number, y: number): Uv {
  return { x, y };
}

function generateId() {
  return 'liquid-glass-' + Math.random().toString(36).substring(2, 11);
}

const defaultFragment: Fragment = (uv) => texture(uv.x, uv.y);

export const liquidGlassFragment: Fragment = (uv) => {
  const ix = uv.x - 0.5;
  const iy = uv.y - 0.5;
  const distanceToEdge = roundedRectSDF(ix, iy, 0.3, 0.2, 0.6);
  const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15);
  const scaled = smoothStep(0, 1, displacement);
  return texture(ix * scaled + 0.5, iy * scaled + 0.5);
};

export class LiquidGlassShader {
  readonly width: number;
  readonly height: number;
  readonly canvasDPI = 1;
  readonly id: string;
  readonly offset = 10;

  mouse: Uv = { x: 0, y: 0 };
  mouseUsed = false;

  private readonly fragment: Fragment;
  private readonly listeners = new AbortController();

  private container!: HTMLDivElement;
  private svg!: SVGSVGElement;
  private feImage!: SVGFEImageElement;
  private feDisplacementMap!: SVGFEDisplacementMapElement;
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;

  constructor(options: LiquidGlassShaderOptions = {}) {
    this.width = options.width || 100;
    this.height = options.height || 100;
    this.fragment = options.fragment || defaultFragment;
    this.id = generateId();

    this.createElement();
    this.setupEventListeners();
    this.updateShader();
  }

  private createElement() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: ${this.width}px;
      height: ${this.height}px;
      overflow: hidden;
      border-radius: 150px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.25), 0 -10px 25px inset rgba(0, 0, 0, 0.15);
      cursor: grab;
      backdrop-filter: url(#${this.id}_filter) blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1);
      z-index: 9999;
      pointer-events: auto;
    `;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    this.svg.setAttribute('width', '0');
    this.svg.setAttribute('height', '0');
    this.svg.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 9998;
    `;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', `${this.id}_filter`);
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('colorInterpolationFilters', 'sRGB');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', this.width.toString());
    filter.setAttribute('height', this.height.toString());

    this.feImage = document.createElementNS('http://www.w3.org/2000/svg', 'feImage');
    this.feImage.setAttribute('id', `${this.id}_map`);
    this.feImage.setAttribute('width', this.width.toString());
    this.feImage.setAttribute('height', this.height.toString());

    this.feDisplacementMap = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'feDisplacementMap',
    );
    this.feDisplacementMap.setAttribute('in', 'SourceGraphic');
    this.feDisplacementMap.setAttribute('in2', `${this.id}_map`);
    this.feDisplacementMap.setAttribute('xChannelSelector', 'R');
    this.feDisplacementMap.setAttribute('yChannelSelector', 'G');

    filter.appendChild(this.feImage);
    filter.appendChild(this.feDisplacementMap);
    defs.appendChild(filter);
    this.svg.appendChild(defs);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width * this.canvasDPI;
    this.canvas.height = this.height * this.canvasDPI;
    this.canvas.style.display = 'none';

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('液态玻璃：无法创建 2D 画布。');
    this.context = context;
  }

  private constrainPosition(x: number, y: number) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const minX = this.offset;
    const maxX = viewportWidth - this.width - this.offset;
    const minY = this.offset;
    const maxY = viewportHeight - this.height - this.offset;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }

  private setupEventListeners() {
    const { signal } = this.listeners;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    this.container.addEventListener(
      'mousedown',
      (event) => {
        isDragging = true;
        this.container.style.cursor = 'grabbing';
        startX = event.clientX;
        startY = event.clientY;
        const rect = this.container.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        event.preventDefault();
      },
      { signal },
    );

    document.addEventListener(
      'mousemove',
      (event) => {
        if (isDragging) {
          const deltaX = event.clientX - startX;
          const deltaY = event.clientY - startY;
          const constrained = this.constrainPosition(initialX + deltaX, initialY + deltaY);
          this.container.style.left = constrained.x + 'px';
          this.container.style.top = constrained.y + 'px';
          this.container.style.transform = 'none';
        }

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = (event.clientX - rect.left) / rect.width;
        this.mouse.y = (event.clientY - rect.top) / rect.height;

        if (this.mouseUsed) this.updateShader();
      },
      { signal },
    );

    document.addEventListener(
      'mouseup',
      () => {
        isDragging = false;
        this.container.style.cursor = 'grab';
      },
      { signal },
    );

    window.addEventListener(
      'resize',
      () => {
        const rect = this.container.getBoundingClientRect();
        const constrained = this.constrainPosition(rect.left, rect.top);
        if (rect.left !== constrained.x || rect.top !== constrained.y) {
          this.container.style.left = constrained.x + 'px';
          this.container.style.top = constrained.y + 'px';
          this.container.style.transform = 'none';
        }
      },
      { signal },
    );
  }

  updateShader() {
    const mouseProxy = new Proxy(this.mouse, {
      get: (target, property) => {
        this.mouseUsed = true;
        return target[property as keyof Uv];
      },
    });

    this.mouseUsed = false;

    const w = this.width * this.canvasDPI;
    const h = this.height * this.canvasDPI;
    const data = new Uint8ClampedArray(w * h * 4);
    let maxScale = 0;
    const rawValues: number[] = [];

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % w;
      const y = Math.floor(i / 4 / w);
      const position = this.fragment({ x: x / w, y: y / h }, mouseProxy);
      const dx = position.x * w - x;
      const dy = position.y * h - y;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      rawValues.push(dx, dy);
    }

    maxScale *= 0.5;

    let index = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = rawValues[index++] / maxScale + 0.5;
      const g = rawValues[index++] / maxScale + 0.5;
      data[i] = r * 255;
      data[i + 1] = g * 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }

    this.context.putImageData(new ImageData(data, w, h), 0, 0);
    this.feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', this.canvas.toDataURL());
    this.feDisplacementMap.setAttribute('scale', (maxScale / this.canvasDPI).toString());
  }

  appendTo(parent: Element) {
    parent.appendChild(this.svg);
    parent.appendChild(this.container);
  }

  destroy() {
    this.listeners.abort();
    this.svg.remove();
    this.container.remove();
    this.canvas.remove();
  }
}

export function createLiquidGlass(options: LiquidGlassShaderOptions = {}) {
  return new LiquidGlassShader({
    width: 300,
    height: 200,
    fragment: liquidGlassFragment,
    ...options,
  });
}
