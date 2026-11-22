import { useState } from 'react';
import { Button } from '../../components/ui';
import { nativeRequest } from '../../native/bridge';

export const componentTypes = [
  ['joystick', '按键摇杆'],
  ['button', '按键'],
  ['radialmenu', '轮盘'],
  ['dpad', '方向键'],
  ['touchpad', '触控板'],
  ['mousewheel', '滚轮'],
  ['text', '文本'],
] as const;

export type ControlData = Record<string, unknown> & {
  type: string;
  name?: string;
  width?: number;
  height?: number;
};
type Sector = { keycode: string; label: string; iconPath: string };
type TextureLayer = { path?: string; enabled?: boolean; scaleMode?: string; opacity?: number };
const textureSlots: Record<string, readonly (readonly [string, string])[]> = {
  button: [
    ['normal', '普通'],
    ['pressed', '按下'],
    ['toggled', '切换开启'],
    ['disabled', '禁用'],
  ],
  joystick: [
    ['background', '底座'],
    ['knob', '摇杆帽'],
    ['backgroundPressed', '按下时的底座'],
    ['knobPressed', '按下时的摇杆帽'],
  ],
  radialmenu: [
    ['centerBackground', '中心'],
    ['expandedBackground', '展开背景'],
    ['sector', '扇区'],
    ['sectorSelected', '选中扇区'],
  ],
  touchpad: [
    ['background', '背景'],
    ['touchIndicator', '触点'],
  ],
  mousewheel: [
    ['background', '背景'],
    ['wheelIndicator', '滚动指示'],
  ],
  text: [['background', '背景']],
};
export function texturePreview(data: ControlData, assets: Record<string, string> | undefined) {
  const slot = textureSlots[data.type]?.[0]?.[0];
  const layer = slot && (data.texture as Record<string, TextureLayer> | undefined)?.[slot];
  const hash = layer && layer.enabled && assets?.[layer.path ?? ''];
  return hash && /^[a-f0-9]{64}$/.test(hash) ? `/controls-textures/${hash}.png` : undefined;
}

export function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="controls-field">
      <span>
        {label} <output>{Number(value.toFixed(2))}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </label>
  );
}

export function ExtendedControlFields({
  data,
  assets,
  edit,
  actions,
}: {
  data: ControlData;
  assets?: Record<string, string>;
  edit: (changes: Partial<ControlData>, assets?: Record<string, string>) => void;
  actions: readonly (readonly [string, string])[];
}) {
  const { type } = data;
  const [textureError, setTextureError] = useState('');
  const [pickingTexture, setPickingTexture] = useState(false);
  const textures = (data.texture as Record<string, TextureLayer> | undefined) ?? {};
  const setTexture = (slot: string, changes: Partial<TextureLayer>, nextAssets = assets) =>
    edit({ texture: { ...textures, [slot]: { ...textures[slot], ...changes } } }, nextAssets);
  const pickTexture = async (slot: string) => {
    setPickingTexture(true);
    setTextureError('');
    try {
      const result = await nativeRequest<{ hash: string } | null>('controls.texture.pick');
      if (result?.hash) {
        const path = result.hash + '.png';
        setTexture(slot, { path, enabled: true }, { ...assets, [path]: result.hash });
      }
    } catch (error) {
      setTextureError(error instanceof Error ? error.message : '无法选择控件贴图');
    } finally {
      setPickingTexture(false);
    }
  };
  const toggle = (key: string, label: string, fallback = false) => (
    <label className="controls-check">
      <input
        type="checkbox"
        checked={(data[key] as boolean | undefined) ?? fallback}
        onChange={(event) => edit({ [key]: event.target.checked })}
      />
      {label}
    </label>
  );
  const range = (
    key: string,
    label: string,
    fallback: number,
    min: number,
    max: number,
    step: number,
  ) => (
    <Range
      label={label}
      value={Number(data[key] ?? fallback)}
      min={min}
      max={max}
      step={step}
      onChange={(value) => edit({ [key]: value })}
    />
  );
  const select = (key: string, label: string, options: readonly (readonly [string, string])[]) => (
    <label className="controls-field">
      {label}
      <select
        value={String(data[key] ?? options[0][0])}
        onChange={(event) => edit({ [key]: event.target.value })}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const binding = (label: string, value: string, update: (key: string) => void) => (
    <label className="controls-field" key={label}>
      {label}
      <select value={value} onChange={(event) => update(event.target.value)}>
        {!actions.some(([key]) => key === value) && <option value={value}>{value}</option>}
        {actions.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const size = (key: 'width' | 'height', label: string) => (
    <Range
      label={label}
      value={Number(data[key] ?? 0.16)}
      min={0.02}
      max={1}
      step={0.005}
      onChange={(value) => {
        if (data.isSizeRatioLocked === false) edit({ [key]: value });
        else {
          const other = key === 'width' ? 'height' : 'width';
          const ratio = Number(data[other] ?? 0.16) / Number(data[key] ?? 0.16);
          edit({ [key]: value, [other]: Math.min(3, Math.max(0.005, value * ratio)) });
        }
      }}
    />
  );
  const color = (key: string, label: string, fallback: number) => (
    <label className="controls-color">
      {label}
      <input
        type="color"
        value={'#' + (Number(data[key] ?? fallback) >>> 0).toString(16).padStart(8, '0').slice(-6)}
        onChange={(event) =>
          edit({
            [key]:
              (Number(data[key] ?? fallback) & 0xff000000) |
              parseInt(event.target.value.slice(1), 16),
          })
        }
      />
    </label>
  );
  const directions = [
    ['upKeycode', '上', 'KEYBOARD_W'],
    ['rightKeycode', '右', 'KEYBOARD_D'],
    ['downKeycode', '下', 'KEYBOARD_S'],
    ['leftKeycode', '左', 'KEYBOARD_A'],
  ] as const;
  const joystickKeys =
    (data.joystickKeys as string[] | undefined) ?? directions.map((entry) => entry[2]);
  const sectors = Array.from(
    { length: Number(data.sectorCount ?? 8) },
    (_, i) =>
      (data.sectors as Sector[] | undefined)?.[i] ?? {
        keycode: 'KEYBOARD_' + (i + 1),
        label: String(i + 1),
        iconPath: '',
      },
  );
  const changeSector = (index: number, changes: Partial<Sector>) =>
    edit({ sectors: sectors.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)) });
  const points = (data.polygonPoints as { x: number; y: number }[] | undefined) ?? [];
  return (
    <>
      <label className="controls-field">
        控件名称
        <input
          value={data.name ?? ''}
          maxLength={64}
          onChange={(event) => edit({ name: event.target.value })}
        />
      </label>
      {size('width', '宽度')}
      {size('height', '高度')}
      {toggle('isSizeRatioLocked', '锁定宽高比', true)}
      {range('rotation', '旋转', 0, -180, 180, 1)}
      {range('opacity', '背景不透明度', 0.35, 0, 1, 0.01)}
      {range('borderOpacity', '边框不透明度', 0.5, 0, 1, 0.01)}
      {range('textOpacity', '文字不透明度', 0.9, 0, 1, 0.01)}
      {range('strokeWidth', '边框宽度', 1.5, 0, 12, 0.5)}
      {range('cornerRadius', '圆角', 8, 0, 80, 1)}
      {color('bgColor', '背景颜色', 0xff2a2a2a)}
      {color('strokeColor', '边框颜色', 0xffaaaaaa)}
      {color('textColor', '文字颜色', 0xffffffff)}
      {toggle('isVisible', '游戏中可见', true)}
      {toggle('isPassThrough', '触摸穿透')}
      {(type === 'button' || type === 'text') &&
        select(
          'shape',
          '形状',
          type === 'button'
            ? [
                ['RECTANGLE', '矩形'],
                ['CIRCLE', '圆形'],
                ['POLYGON', '多边形'],
              ]
            : [
                ['RECTANGLE', '矩形'],
                ['CIRCLE', '圆形'],
              ],
        )}
      {type === 'button' && (
        <>
          {binding('按键绑定', String(data.keycode ?? 'UNKNOWN'), (keycode) => edit({ keycode }))}
          {toggle('isToggle', '点按切换按下状态')}
          {data.shape === 'POLYGON' && (
            <details className="controls-details">
              <summary>多边形顶点</summary>
              {points.map((point, index) => (
                <div className="controls-point" key={index}>
                  {(['x', 'y'] as const).map((axis) => (
                    <label key={axis}>
                      {axis.toUpperCase()}
                      <input
                        aria-label={`顶点 ${index + 1} ${axis}`}
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={point[axis]}
                        onChange={(event) => {
                          const value = event.target.valueAsNumber;
                          if (Number.isFinite(value))
                            edit({
                              polygonPoints: points.map((item, i) =>
                                i === index
                                  ? { ...item, [axis]: Math.max(0, Math.min(1, value)) }
                                  : item,
                              ),
                            });
                        }}
                      />
                    </label>
                  ))}
                  <Button
                    aria-label={`删除顶点 ${index + 1}`}
                    onClick={() => edit({ polygonPoints: points.filter((_, i) => i !== index) })}
                  >
                    删除
                  </Button>
                </div>
              ))}
              <Button
                disabled={points.length >= 64}
                onClick={() =>
                  edit({
                    polygonPoints: points.length
                      ? [...points, { x: 0.5, y: 0.5 }]
                      : [
                          { x: 0.5, y: 0.05 },
                          { x: 0.95, y: 0.95 },
                          { x: 0.05, y: 0.95 },
                        ],
                  })
                }
              >
                添加顶点
              </Button>
            </details>
          )}
        </>
      )}
      {type === 'joystick' && (
        <>
          {select('mode', '摇杆模式', [
            ['KEYBOARD', '四向按键'],
            ['MOUSE', '鼠标移动'],
          ])}
          {range('stickKnobSize', '摇杆帽大小', 0.4, 0.05, 1, 0.05)}
          {range('stickOpacity', '摇杆帽不透明度', 0.7, 0, 1, 0.05)}
          {data.mode !== 'MOUSE' &&
            directions.map(([, label, key], i) =>
              binding(label, joystickKeys[i] ?? key, (value) =>
                edit({
                  joystickKeys: directions.map((entry, j) =>
                    i === j ? value : (joystickKeys[j] ?? entry[2]),
                  ),
                }),
              ),
            )}
        </>
      )}
      {type === 'dpad' && (
        <>
          {select('style', '方向键样式', [
            ['CROSS', '十字'],
            ['ROUND', '圆形'],
            ['SQUARE', '方形'],
          ])}
          {directions.map(([field, label, key]) =>
            binding(label, String(data[field] ?? key), (value) => edit({ [field]: value })),
          )}
          {toggle('allowDiagonal', '允许斜向', true)}
          {toggle('showLabels', '显示方向标签')}
          {range('deadZone', '方向键死区', 0.2, 0, 0.95, 0.05)}
          {range('buttonSize', '方向键大小', 0.35, 0.05, 0.5, 0.01)}
          {range('buttonSpacing', '方向键间距', 0.05, 0, 0.5, 0.01)}
          {color('activeColor', '按下颜色', 0xccffffff)}
        </>
      )}
      {type === 'radialmenu' && (
        <details className="controls-details">
          <summary>轮盘扇区</summary>
          {range('sectorCount', '扇区数量', 8, 4, 12, 1)}
          {range('expandedScale', '展开倍率', 2.5, 1, 8, 0.1)}
          {range('expandDuration', '展开时长（毫秒）', 150, 0, 3000, 25)}
          {range('deadZoneRatio', '轮盘死区', 0.3, 0, 1, 0.05)}
          {toggle('showDividers', '显示分隔线', true)}
          {color('dividerColor', '分隔线颜色', 0x66ffffff)}
          {color('selectedColor', '选中颜色', 0x99ffffff)}
          {sectors.map((sector, index) => (
            <div className="controls-point" key={index}>
              <label className="controls-field">
                {`扇区 ${index + 1} 标签`}
                <input
                  value={sector.label}
                  maxLength={32}
                  onChange={(event) => changeSector(index, { label: event.target.value })}
                />
              </label>
              {binding(`扇区 ${index + 1} 绑定`, sector.keycode, (keycode) =>
                changeSector(index, { keycode }),
              )}
            </div>
          ))}
        </details>
      )}
      {type === 'touchpad' && toggle('isDoubleClickSimulateJoystick', '双击启用摇杆', true)}
      {type === 'mousewheel' && (
        <>
          {select('orientation', '滚动方向', [
            ['VERTICAL', '纵向'],
            ['HORIZONTAL', '横向'],
          ])}
          {toggle('reverseDirection', '反向滚动')}
          {range('scrollSensitivity', '滚动灵敏度', 40, 1, 200, 1)}
          {range('scrollRatio', '滚动倍率', 1, 0.1, 5, 0.1)}
        </>
      )}
      {type === 'text' && (
        <label className="controls-field">
          显示文字
          <input
            value={String(data.displayText ?? 'Text')}
            maxLength={120}
            onChange={(event) => edit({ displayText: event.target.value })}
          />
        </label>
      )}
      {!!textureSlots[type]?.length && (
        <details className="controls-details">
          <summary>控件贴图</summary>
          <fieldset disabled={pickingTexture}>
            {textureSlots[type].map(([slot, label]) => (
              <div className="controls-texture" key={slot}>
                <span>{label}</span>
                <Button onClick={() => void pickTexture(slot)}>
                  {textures[slot]?.path ? '更换 PNG' : '选择 PNG'}
                </Button>
                {textures[slot]?.path && (
                  <>
                    <Button onClick={() => setTexture(slot, { path: '', enabled: false })}>
                      清除
                    </Button>
                    <label className="controls-field">
                      贴图缩放
                      <select
                        value={textures[slot].scaleMode ?? 'FIT'}
                        onChange={(event) => setTexture(slot, { scaleMode: event.target.value })}
                      >
                        {[
                          ['FIT', '适应'],
                          ['FILL', '填充'],
                          ['STRETCH', '拉伸'],
                          ['CENTER', '居中'],
                          ['TILE', '平铺'],
                        ].map(([value, name]) => (
                          <option key={value} value={value}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Range
                      label="贴图不透明度"
                      min={0}
                      max={1}
                      step={0.05}
                      value={textures[slot].opacity ?? 1}
                      onChange={(opacity) => setTexture(slot, { opacity })}
                    />
                  </>
                )}
              </div>
            ))}
            {textureError && <p role="alert">{textureError}</p>}
          </fieldset>
        </details>
      )}
    </>
  );
}
