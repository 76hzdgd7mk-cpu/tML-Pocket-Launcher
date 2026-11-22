import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, Switch } from '../../components/ui';
import { nativeRequest } from '../../native/bridge';
import { useLauncher } from '../../state/launcher';
import {
  componentTypes,
  ExtendedControlFields,
  Range,
  texturePreview,
  type ControlData,
} from './controls-properties';

type Category = 'controls' | 'interface';
type Viewport = { width: number; height: number };
type Position = { CenterX: number; CenterY: number; Scale: number };
type Control = {
  Id: string;
  Kind: number | string;
  JoystickRole?: number | string;
  Action?: number | string;
  TextureName?: string;
  X: number;
  Y: number;
  Size: number;
  Multitouch?: boolean;
  KeyboardKey?: string;
  ModKeybind?: string;
  RadialActions?: (number | string)[];
  RadialKeyboardKeys?: string[];
  RadialModKeybinds?: string[];
  Launcher?: { Data: ControlData; Assets?: Record<string, string> } | null;
};
type Preset = { Name: string; Controls: Control[] };
type Profile = {
  ControlLayout?: number | string;
  ActiveCustomPresetIndex?: number;
  CustomPresets?: (Preset | null)[];
  ControlScale?: number;
  Opacity?: number;
  JoystickDeadzone?: number;
  JoystickUpJumps?: boolean;
  EnablePinchZoom?: boolean;
  ShowTopButtons?: boolean;
  LeftStickOffsetX?: number;
  LeftStickOffsetY?: number;
  RightStickOffsetX?: number;
  RightStickOffsetY?: number;
  UIFontScale?: number;
  EdgePadding?: number;
  HotbarOrientation?: number | string;
  InterfaceLayout?: { FormatVersion: number; Regions: Record<string, Position> };
  EnableTouchInput?: boolean;
  HideGameControls?: boolean;
};
type PreviewScene = 'world' | 'hotbar' | 'inventory' | 'crafting';
type CanvasGesture = {
  id: string;
  pointer: number;
  mode: 'move' | 'resize';
  offsetX: number;
  offsetY: number;
  startWidth: number;
  startHeight: number;
  clientX: number;
  clientY: number;
  moved: boolean;
};

const layoutKeys = [
  'ControlLayout',
  'ActiveCustomPresetIndex',
  'CustomPresets',
  'ControlScale',
  'LeftStickOffsetX',
  'LeftStickOffsetY',
  'RightStickOffsetX',
  'RightStickOffsetY',
  'Opacity',
  'JoystickDeadzone',
  'JoystickUpJumps',
  'EnablePinchZoom',
  'ShowTopButtons',
  'EnableTouchInput',
  'HideGameControls',
  'UIFontScale',
  'HotbarOrientation',
  'InterfaceLayout',
  'EdgePadding',
] as const satisfies readonly (keyof Profile)[];

const defaultControlMode = 1;
const defaultControlScale = 1.8;
const gameControlScale = (profile: Profile, { width, height }: Viewport) =>
  (profile.ControlScale ?? defaultControlScale) * Math.min(width / 1920, height / 1080);

function hotbarGeometry(profile: Profile, viewport: Viewport) {
  const scale = gameControlScale(profile, viewport);
  const inset = Math.max(4, Math.trunc((profile.EdgePadding ?? 18) * scale * 0.5));
  const top = Math.max(4, Math.trunc(6 * scale));
  const side = Math.max(16, Math.trunc(38 * scale));
  const slot = Math.max(16, Math.trunc(50 * scale));
  const gap = Math.max(2, Math.trunc(3 * scale));
  const horizontal = profile.HotbarOrientation === 1 || profile.HotbarOrientation === 'Horizontal';
  const settingsY = top + (slot + gap) * (horizontal ? 1 : 4);
  return {
    inset,
    left: Math.max(inset, Math.trunc(viewport.width * 0.056)),
    top,
    side,
    slot,
    gap,
    horizontal,
    settingsY,
    width: side + (horizontal ? 10 : 2) * (slot + gap),
    height: horizontal ? settingsY - top + side : 5 * slot + 4 * gap,
  };
}

function interfaceRegions(
  profile: Profile,
  { width, height }: Viewport,
  hotbar: ReturnType<typeof hotbarGeometry>,
) {
  const padding = profile.EdgePadding ?? 18;
  const screenScale = Math.min(width / 1280, height / 576);
  const inset = Math.ceil(Math.max(18, padding) * screenScale);
  const topInset = Math.max(2, Math.trunc(4 * screenScale));
  const usable = width - inset * 2;
  const scale = Math.min(usable / 1280, (height - 2 * topInset) / 576);
  const region = (
    id: string,
    label: string,
    x: number,
    y: number,
    regionWidth: number,
    regionHeight: number,
  ) => ({
    id,
    label,
    x: (x + regionWidth / 2) / width,
    y: (y + regionHeight / 2) / height,
    width: regionWidth / width,
    height: regionHeight / height,
  });
  return [
    {
      ...region('Hotbar', '快捷栏', hotbar.left, hotbar.top, hotbar.width, hotbar.height),
      insetX: hotbar.inset / width,
      insetY: 4 / height,
    },
    ...[
      region(
        'InventoryItems',
        '背包格子',
        inset + 54 * scale,
        topInset + 4 * scale,
        498 * scale,
        248 * scale,
      ),
      region(
        'CoinAmmo',
        '钱币与弹药',
        inset + 572 * scale,
        topInset + 60 * scale,
        94 * scale,
        194 * scale,
      ),
      region('InventoryActions', '背包操作', inset, topInset, usable, 355 * scale),
      region(
        'Equipment',
        '装备区',
        width - inset - 460 * scale,
        topInset,
        460 * scale,
        355 * scale,
      ),
      region('Crafting', '制作区', width - inset - 460 * scale, topInset, 460 * scale, 400 * scale),
      region(
        'CalamityDifficulty',
        '灾厄难度按钮',
        width - inset - 260 * scale,
        topInset + 260 * scale,
        80 * scale,
        80 * scale,
      ),
    ].map((entry) => ({ ...entry, insetX: inset / width, insetY: topInset / height })),
  ];
}
const ACTIONS = [
  'Jump',
  'Grapple',
  'Heal',
  'Mana',
  'Buff',
  'Mount',
  'SmartInteract',
  'SmartCursor',
  'AimModeToggle',
  'TargetLockToggle',
  'Interact',
  'UseItem',
  'Inventory',
  'Map',
  'MapStyle',
  'Settings',
  'Chat',
  'ZoomIn',
  'ZoomOut',
  'QuickPotions',
  'Zoom',
  'RadialMenu',
  'Unbound',
  'SwapUseInteract',
  'CycleUseProfile',
  'QuickMount',
  'AutoSelect',
  'Loadout1',
  'Loadout2',
  'Loadout3',
  'SwitchLoadout',
  'ModKeybind',
  'LauncherControl',
  'KeyboardKey',
];
const ACTION_LABELS = [
  '跳跃',
  '钩爪',
  '治疗',
  '魔力',
  '增益',
  '坐骑',
  '智能互动',
  '智能光标',
  '瞄准模式',
  '锁定',
  '互动',
  '使用物品',
  '背包',
  '地图',
  '地图样式',
  '设置',
  '聊天',
  '放大',
  '缩小',
  '药水',
  '缩放',
  '轮盘',
  '无绑定',
  '使用／互动',
  '切换使用模式',
  '快速坐骑',
  '自动选择',
  '装备配置 1',
  '装备配置 2',
  '装备配置 3',
  '切换装备配置',
  '模组按键',
  '扩展控件',
  '键盘按键',
];
const clamp = (value: number, lower = 0, upper = 1) => Math.min(upper, Math.max(lower, value));
const enumIndex = (value: number | string | undefined, names: readonly string[]) => {
  const index = typeof value === 'number' ? value : names.indexOf(value ?? '');
  return index >= 0 && index < names.length ? index : 0;
};
const isStick = (control: Control) => control.Kind === 0 || control.Kind === 'Joystick';
const controlLabel = (control: Control) =>
  control.Launcher?.Data?.name ||
  (isStick(control)
    ? ['移动', '瞄准', '钩爪摇杆', '未绑定摇杆'][
        enumIndex(control.JoystickRole, ['Move', 'Aim', 'Grapple', 'Unbound'])
      ]
    : control.Kind === 2 || control.Kind === 'RadialMenu'
      ? '轮盘'
      : ACTION_LABELS[enumIndex(control.Action, ACTIONS)]);

const actionGlyphs = [
  '↑',
  '⌁',
  '+',
  '✦',
  '✚',
  '◈',
  '↗',
  '⌖',
  '⊕',
  '◎',
  '↗',
  '◆',
  '▤',
  '▱',
  '⌖',
  '☰',
  '···',
  '+',
  '−',
  '✚',
  '⌕',
  '◉',
];

function InterfaceArtwork({
  id,
  hotbar,
  showHotbarButtons = true,
}: {
  id: string;
  hotbar: ReturnType<typeof hotbarGeometry>;
  showHotbarButtons?: boolean;
}) {
  if (id === 'Hotbar')
    return (
      <div className="controls-art-hotbar">
        {showHotbarButtons && (
          <span
            className="controls-art-side"
            style={{
              width: `${(hotbar.side / hotbar.width) * 100}%`,
              height: `${(hotbar.side / hotbar.height) * 100}%`,
            }}
          >
            ▤
          </span>
        )}
        <div
          className="controls-art-hotbar-slots"
          style={{
            left: `${((hotbar.side + hotbar.gap) / hotbar.width) * 100}%`,
            width: `${((hotbar.width - hotbar.side - hotbar.gap) / hotbar.width) * 100}%`,
            height: `${((hotbar.horizontal ? hotbar.slot : hotbar.height) / hotbar.height) * 100}%`,
            rowGap: `${(hotbar.gap * 100) / (hotbar.horizontal ? hotbar.slot : hotbar.height)}%`,
            columnGap: `${(hotbar.gap * 100) / (hotbar.width - hotbar.side - hotbar.gap)}%`,
            gridTemplateColumns: `repeat(${hotbar.horizontal ? 10 : 2}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${hotbar.horizontal ? 1 : 5}, minmax(0, 1fr))`,
            gridAutoFlow: 'column',
          }}
        >
          {Array.from({ length: 10 }, (_, index) => (
            <i key={index}>{index === 0 ? '◆' : ''}</i>
          ))}
        </div>
        {showHotbarButtons && (
          <span
            className="controls-art-side"
            style={{
              top: `${((hotbar.settingsY - hotbar.top) / hotbar.height) * 100}%`,
              width: `${(hotbar.side / hotbar.width) * 100}%`,
              height: `${(hotbar.side / hotbar.height) * 100}%`,
            }}
          >
            ☰
          </span>
        )}
      </div>
    );
  if (id === 'InventoryItems')
    return (
      <div className="controls-art-slots inventory">
        {Array.from({ length: 50 }, (_, index) => (
          <i key={index}>{index === 0 ? '◆' : ''}</i>
        ))}
      </div>
    );
  if (id === 'CoinAmmo')
    return (
      <div className="controls-art-slots coin-ammo">
        {Array.from({ length: 8 }, (_, index) => (
          <i key={index}>{index % 4 === 0 ? ['●', '◆'][Math.floor(index / 4)] : ''}</i>
        ))}
      </div>
    );
  if (id === 'Equipment')
    return (
      <div className="controls-art-equipment">
        {Array.from({ length: 16 }, (_, index) => (
          <i key={index}>{index % 3 === 0 ? ['♙', '◇', '◈'][index % 3] : ''}</i>
        ))}
      </div>
    );
  if (id === 'Crafting')
    return (
      <div className="controls-art-crafting">
        <div className="controls-art-categories">
          {Array.from({ length: 6 }, (_, index) => (
            <i key={index}>{['⌂', '◆', '◈', '✦', '⚒', '…'][index]}</i>
          ))}
        </div>
        <div className="controls-art-slots recipes">
          {Array.from({ length: 15 }, (_, index) => (
            <i key={index}>{index % 5 === 0 ? '◆' : ''}</i>
          ))}
        </div>
        <span className="controls-art-craft-button">⚒</span>
      </div>
    );
  if (id === 'InventoryActions')
    return (
      <div className="controls-art-actions">
        <span>↩</span>
        <span>⇧</span>
        <span>⇄</span>
        <span>⌕</span>
        <span>⚙</span>
      </div>
    );
  if (id === 'CalamityDifficulty') return <div className="controls-art-difficulty">☠</div>;
  return null;
}

function ControlArtwork({
  control,
  mode,
  data,
}: {
  control: Control;
  mode: string;
  data?: ControlData;
}) {
  if (isStick(control))
    return (
      <>
        <span className="controls-art-stick-ring" />
        <span className="controls-art-stick-knob">
          {control.JoystickRole === 0 || control.JoystickRole === 'Move' ? '✥' : '⌖'}
        </span>
      </>
    );
  if (data?.type === 'dpad')
    return (
      <span className="controls-art-dpad">
        <i>↑</i>
        <i>←</i>
        <i>●</i>
        <i>→</i>
        <i>↓</i>
      </span>
    );
  if (data?.type === 'radialmenu' || control.Kind === 2 || control.Kind === 'RadialMenu')
    return (
      <span className="controls-art-radial">
        <i>↑</i>
        <i>→</i>
        <i>↓</i>
        <i>←</i>
      </span>
    );
  const action = enumIndex(control.Action, ACTIONS);
  const symbol =
    data?.type === 'text'
      ? String(data.displayText ?? data.name ?? 'Text')
      : data?.type === 'mousewheel'
        ? '↕'
        : data?.type === 'touchpad'
          ? '⌖'
          : data?.type === 'button'
            ? (data.name ?? 'A').slice(0, 2)
            : mode === 'Advanced' && action === 20
              ? '⌕'
              : (actionGlyphs[action] ?? '●');
  return <span className="controls-art-button">{symbol}</span>;
}

function defaultControls(
  profile: Profile,
  mode: number,
  viewport: Viewport,
  hotbar: ReturnType<typeof hotbarGeometry>,
  hotbarPosition: Position | undefined,
): Control[] {
  const { width, height } = viewport;
  const scale = gameControlScale(profile, viewport);
  const edge = (profile.EdgePadding ?? 18) * scale * 0.5;
  const stickY = height - 104 * scale - edge;
  const left = Math.max(width * 0.203125, 166 * scale + edge) + (profile.LeftStickOffsetX ?? 0);
  const right =
    width - Math.max(width * 0.15, 166 * scale + edge) + (profile.RightStickOffsetX ?? 0);
  const leftY = stickY + (profile.LeftStickOffsetY ?? 0);
  const rightY = stickY + (profile.RightStickOffsetY ?? 0);
  const button = (action: number, x: number, y: number, size = 1): Control => ({
    Id: `button-${ACTIONS[action]}`,
    Kind: 1,
    Action: action,
    X: x / width,
    Y: y / height,
    Size: size,
  });
  const near = (action: number, hand: 'left' | 'right', x: number, y: number, size?: number) =>
    button(
      action,
      (hand === 'left' ? left : right) + x * scale,
      (hand === 'left' ? leftY : rightY) + y * scale,
      size,
    );
  const hotbarButton = (action: number, y: number) => {
    const size = hotbarPosition?.Scale ?? 1;
    const halfSide = Math.floor(Math.max(1, Math.round(hotbar.side * size)) / 2);
    const x = hotbarPosition
      ? Math.round(hotbarPosition.CenterX * width - Math.floor(hotbar.width / 2) * size)
      : hotbar.left;
    const top = hotbarPosition
      ? Math.round(
          hotbarPosition.CenterY * height + (y - hotbar.top - Math.floor(hotbar.height / 2)) * size,
        )
      : y;
    return button(action, x + halfSide, top + halfSide, (hotbar.side * size) / (48 * scale));
  };
  const controls: Control[] = [
    { Id: 'joystick-move', Kind: 0, JoystickRole: 0, X: left / width, Y: leftY / height, Size: 1 },
    { Id: 'joystick-aim', Kind: 0, JoystickRole: 1, X: right / width, Y: rightY / height, Size: 1 },
    near(1, 'right', -106, -84, 32 / 24),
    near(0, 'right', 122, -84, 32 / 24),
    near(5, 'right', 126, 7),
    near(9, 'right', -104, 80),
    near(7, 'right', 104, 80),
    near(10, 'left', -106, -84, 32 / 24),
    near(8, 'left', -96, 80),
    near(11, 'right', -126, 7, 25 / 24),
    hotbarButton(12, hotbar.top),
    hotbarButton(15, hotbar.settingsY),
  ];
  if (mode === 1) {
    controls.push(near(19, 'left', 110, -84, 32 / 24), near(20, 'left', 104, 80));
  } else {
    controls.push(
      near(2, 'left', 110, -84, 32 / 24),
      near(3, 'left', 128, 7),
      near(4, 'left', 106, 80),
      near(18, 'left', 176, 80, 16 / 24),
      near(17, 'right', -176, 80, 16 / 24),
    );
  }
  if (profile.ShowTopButtons !== false) {
    const size = Math.trunc(40 * scale);
    [16, 14, 13].forEach((action, index) =>
      controls.push(
        button(
          action,
          width - hotbar.inset - size * (3 - index) + Math.floor(size / 2),
          hotbar.top + Math.floor(size / 2),
          size / (48 * scale),
        ),
      ),
    );
  }
  return controls;
}

const STICK_ROLES = ['Move', 'Aim', 'Grapple', 'Unbound'];
const STICK_LABELS = ['移动', '瞄准', '钩爪', '无绑定'];
const KEYBOARD_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ...[
    'SPACE',
    'RETURN',
    'ESCAPE',
    'TAB',
    'UP',
    'DOWN',
    'LEFT',
    'RIGHT',
    'LSHIFT',
    'LCTRL',
    'LALT',
    'BACKSPACE',
  ],
  ...Array.from({ length: 12 }, (_, index) => 'F' + (index + 1)),
];
const KEY_BINDINGS: [string, string][] = [
  ['UNKNOWN', '无绑定'],
  ...ACTIONS.flatMap((action, index): [string, string][] =>
    [19, 20, 21, 22, 31, 32, 33].includes(index)
      ? []
      : [[`ACTION_${action}`, ACTION_LABELS[index]]],
  ),
  ['MOUSE_LEFT', '鼠标左键'],
  ['MOUSE_RIGHT', '鼠标右键'],
  ['MOUSE_MIDDLE', '鼠标中键'],
  ['MOUSE_WHEEL_UP', '向上滚动'],
  ['MOUSE_WHEEL_DOWN', '向下滚动'],
  ...KEYBOARD_KEYS.map((key): [string, string] => ['KEYBOARD_' + key, key]),
];

function controlBounds(entry: Control, profile: Profile, customMode: boolean, viewport: Viewport) {
  const data = entry.Launcher?.Data;
  const action = enumIndex(entry.Action, ACTIONS);
  const size =
    customMode && !isStick(entry) && action === 12 ? Math.max(1, entry.Size) : entry.Size;
  const radius = (isStick(entry) ? 66 : 24) * gameControlScale(profile, viewport) * size;
  const width =
    (data ? (data.width ?? 0.16) * size * viewport.height : radius * 2) / viewport.width;
  const height = data ? (data.height ?? 0.16) * size : (radius * 2) / viewport.height;
  const x = data
    ? entry.X + width / 2
    : customMode
      ? clamp(entry.X, Math.min(0.5, width / 2), Math.max(0.5, 1 - width / 2))
      : entry.X;
  const y = data
    ? entry.Y + height / 2
    : customMode
      ? clamp(entry.Y, Math.min(0.5, height / 2), Math.max(0.5, 1 - height / 2))
      : entry.Y;
  return { x, y, width, height };
}

export function ControlsEditor({ onClose }: { onClose: () => void }) {
  const { notify } = useLauncher();
  const [category, setCategory] = useState<Category>('controls');
  const [profile, setProfile] = useState<Profile>();
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState('');
  const [scene, setScene] = useState<PreviewScene>('world');
  const [viewport, setViewport] = useState<Viewport>();
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'palette' | 'inspector' | 'selection'>();
  const [selectionPanelRight, setSelectionPanelRight] = useState(false);
  const [dock, setDock] = useState({ x: 1, y: 0.5 });
  const [confirmExit, setConfirmExit] = useState(false);
  const saved = useRef<Profile | undefined>(undefined);
  const history = useRef<{ past: Profile[]; future: Profile[] }>({ past: [], future: [] });
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const drag = useRef<CanvasGesture | null>(null);
  const suppressControlClick = useRef(false);
  const dockDrag = useRef<{ id: number; x: number; y: number; moved: boolean }>(null);
  const suppressDockClick = useRef(false);
  const requestClose = () => {
    if (pending) return;
    if (profile && layoutKeys.some((key) => saved.current?.[key] !== profile[key]))
      setConfirmExit(true);
    else onClose();
  };
  const changeCategory = (next: Category) => {
    if (next === category) return;
    setCategory(next);
    setScene(next === 'controls' ? 'world' : 'hotbar');
    setSelected(next === 'controls' ? '' : 'Hotbar');
    setPanel(undefined);
  };
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement;
    element.showModal();
    const measure = () => {
      const ratio = window.devicePixelRatio;
      setViewport({
        width: Math.round(element.clientWidth * ratio),
        height: Math.round(element.clientHeight * ratio),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void nativeRequest('controls.editor', { active: true }).catch(() => {});
    return () => {
      observer.disconnect();
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
      void nativeRequest('controls.editor', { active: false }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void nativeRequest<Profile>('controls.read').then(
      (value) => {
        if (!mounted) return;
        saved.current = value;
        setProfile(value);
      },
      (error: Error) => {
        if (mounted) setFailure(error.message);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  const controlEditor = category === 'controls';
  const edit = (changes: Partial<Profile>, checkpoint = true) => {
    if (!profile) return;
    if (checkpoint) {
      history.current.past = [...history.current.past.slice(-39), profile];
      history.current.future = [];
    }
    setProfile({ ...profile, ...changes });
  };
  const traverse = (forward: boolean) => {
    if (!profile) return;
    const { past, future } = history.current;
    const next = (forward ? future : past).pop();
    if (!next) return;
    (forward ? past : future).push(profile);
    setProfile(next);
  };

  const save = async () => {
    if (!profile || pending) return;
    setPending(true);
    setFailure('');
    try {
      await nativeRequest('controls.save', {
        category: 'layout',
        settings: Object.fromEntries(
          layoutKeys
            .filter((key) => profile[key] !== saved.current?.[key])
            .map((key) => [key, profile[key]]),
        ),
      });
      saved.current = profile;
      onClose();
      notify('布局已保存，下次启动游戏时生效。');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '布局保存失败');
    } finally {
      setPending(false);
    }
  };

  const dragProps = (
    id: string,
    x: number,
    y: number,
    move: (x: number, y: number, checkpoint: boolean) => void,
    size: { width: number; height: number },
    resize: (width: number, height: number, checkpoint: boolean) => void,
  ) => {
    const position = (event: PointerEvent<HTMLButtonElement>) => {
      const bounds = preview.current?.getBoundingClientRect();
      return (
        bounds && {
          x: (event.clientX - bounds.left) / bounds.width,
          y: (event.clientY - bounds.top) / bounds.height,
        }
      );
    };
    return {
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        if (event.detail && suppressControlClick.current) return;
        const control = event.currentTarget.getBoundingClientRect();
        const screen = dialog.current?.getBoundingClientRect();
        setSelectionPanelRight(
          !!screen && control.left + control.width / 2 < screen.left + screen.width / 2,
        );
        setSelected(id);
        setPanel('selection');
      },
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || drag.current || pending) return;
        const point = position(event);
        if (!point) return;
        const resizing =
          event.target instanceof Element && !!event.target.closest('.controls-resize-handle');
        suppressControlClick.current = resizing;
        drag.current = {
          id,
          pointer: event.pointerId,
          mode: resizing ? 'resize' : 'move',
          offsetX: resizing ? point.x : point.x - x,
          offsetY: resizing ? point.y : point.y - y,
          startWidth: size.width,
          startHeight: size.height,
          clientX: event.clientX,
          clientY: event.clientY,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelected(id);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const active = drag.current;
        const point = position(event);
        if (!point || active?.id !== id || active.pointer !== event.pointerId) return;
        if (
          !active.moved &&
          Math.hypot(event.clientX - active.clientX, event.clientY - active.clientY) < 4
        )
          return;
        suppressControlClick.current = true;
        if (active.mode === 'resize') {
          const dx = point.x - active.offsetX;
          const dy = point.y - active.offsetY;
          const checkpoint = !active.moved;
          active.moved = true;
          resize(
            Math.max(0.012, active.startWidth + dx),
            Math.max(0.018, active.startHeight + dy),
            checkpoint,
          );
          return;
        }
        const rawX = clamp(point.x - active.offsetX);
        const rawY = clamp(point.y - active.offsetY);
        const snapValue = (value: number) => {
          if (!snap) return value;
          const nearest = Math.round(value * 10) / 10;
          return Math.abs(value - nearest) <= 0.015 ? nearest : value;
        };
        const nextX = snapValue(rawX);
        const nextY = snapValue(rawY);
        if (Math.abs(nextX - x) < 0.00001 && Math.abs(nextY - y) < 0.00001) return;
        const checkpoint = !active.moved;
        active.moved = true;
        move(nextX, nextY, checkpoint);
      },
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => {
        if (drag.current?.pointer === event.pointerId) drag.current = null;
      },
    };
  };

  const renderEditor = (profile: Profile, viewport: Viewport) => {
    const mode = enumIndex(profile.ControlLayout ?? defaultControlMode, [
      'Simple',
      'Advanced',
      'Custom',
    ]);
    const presetIndex = clamp(profile.ActiveCustomPresetIndex ?? 0, 0, 3);
    const preset = profile.CustomPresets?.[presetIndex];
    const customControls = mode === 2 ? preset?.Controls : undefined;
    const builtInMode = mode === 2 ? defaultControlMode : mode;
    const hotbar = hotbarGeometry(profile, viewport);
    const regions = interfaceRegions(profile, viewport, hotbar);
    const region = regions.find((entry) => entry.id === selected) ?? regions[0];
    const positions =
      profile.InterfaceLayout?.FormatVersion === 1 ? profile.InterfaceLayout.Regions : {};
    const maxScale = (entry: typeof region) =>
      clamp(
        Math.min((1 - 2 * entry.insetX) / entry.width, (1 - 2 * entry.insetY) / entry.height),
        0.5,
        2,
      );
    const locateRegion = (entry: typeof region) => {
      const position = positions?.[entry.id];
      if (!position) return { CenterX: entry.x, CenterY: entry.y, Scale: 1 };
      const scale = clamp(position.Scale, 0.5, maxScale(entry));
      const insetX = entry.insetX + (entry.width * scale) / 2;
      const insetY = entry.insetY + (entry.height * scale) / 2;
      return {
        CenterX: clamp(position.CenterX, Math.min(0.5, insetX), Math.max(0.5, 1 - insetX)),
        CenterY: clamp(position.CenterY, Math.min(0.5, insetY), Math.max(0.5, 1 - insetY)),
        Scale: scale,
      };
    };
    const controls =
      customControls ??
      defaultControls(
        profile,
        builtInMode,
        viewport,
        hotbar,
        positions?.Hotbar ? locateRegion(regions[0]) : undefined,
      );
    const control = controls.find((entry) => entry.Id === selected);
    const selectionOnly = panel === 'selection';
    const editRegion = (id: string, position?: Position, checkpoint = true) => {
      const next = { ...positions };
      if (position) next[id] = position;
      else delete next[id];
      edit({ InterfaceLayout: { FormatVersion: 1, Regions: next } }, checkpoint);
    };
    const editPreset = (next: Control[] | null, checkpoint = true, name = preset?.Name) => {
      const presets = Array.from(
        { length: 4 },
        (_, index) => profile.CustomPresets?.[index] ?? null,
      );
      presets[presetIndex] = next
        ? { Name: name ?? `预设 ${presetIndex + 1}`, Controls: next }
        : null;
      edit(
        { CustomPresets: presets, ActiveCustomPresetIndex: presetIndex, ControlLayout: 2 },
        checkpoint,
      );
    };
    const editControl = (id: string, changes: Partial<Control>, checkpoint = true) =>
      editPreset(
        controls.map((entry) => (entry.Id === id ? { ...entry, ...changes } : entry)),
        checkpoint,
      );
    const newControl = (kind: number, data?: ControlData) => {
      const Id = globalThis.crypto.randomUUID();
      editPreset([
        ...controls,
        {
          Id,
          Kind: kind,
          Action: data ? 32 : 0,
          JoystickRole: data ? 3 : 0,
          X: 0.5,
          Y: 0.5,
          Size: 1,
          ...(data && { Launcher: { Data: data, Assets: {} } }),
        },
      ]);
      setSelected(Id);
      setPanel(undefined);
    };
    const duplicate = () => {
      if (!control) return;
      const Id = globalThis.crypto.randomUUID();
      editPreset([
        ...controls,
        { ...control, Id, X: clamp(control.X + 0.025), Y: clamp(control.Y + 0.025) },
      ]);
      setSelected(Id);
    };
    const regionPosition = locateRegion(region);
    const controlData = control?.Launcher?.Data;

    const sceneRegions = regions.filter(({ id }) => {
      if (scene === 'world' || scene === 'hotbar') return id === 'Hotbar';
      return id !== 'Hotbar' && id !== (scene === 'crafting' ? 'Equipment' : 'Crafting');
    });
    const sceneSelection: Record<PreviewScene, string> = {
      world: '',
      hotbar: 'Hotbar',
      inventory: 'InventoryItems',
      crafting: 'Crafting',
    };
    const selectScene = (next: PreviewScene) => {
      setScene(next);
      if (category === 'interface') setSelected(sceneSelection[next] || 'Hotbar');
    };
    const renderRegionArt = (entry: (typeof regions)[number], interactive: boolean) => {
      const current = locateRegion(entry);
      const move = (x: number, y: number, checkpoint: boolean) =>
        editRegion(entry.id, { ...current, CenterX: x, CenterY: y }, checkpoint);
      const resize = (width: number, height: number, checkpoint: boolean) => {
        const ratio = Math.max(
          width / (entry.width * current.Scale),
          height / (entry.height * current.Scale),
        );
        const Scale = clamp(current.Scale * ratio, 0.5, maxScale(entry));
        editRegion(entry.id, { ...current, Scale }, checkpoint);
      };
      return interactive ? (
        <button
          key={entry.id}
          type="button"
          aria-label={entry.label}
          aria-pressed={!previewOnly && entry.id === region.id}
          disabled={previewOnly || pending}
          className={`controls-preview-node controls-preview-region controls-region-${entry.id}`}
          style={{
            left: `${current.CenterX * 100}%`,
            top: `${current.CenterY * 100}%`,
            width: `${entry.width * current.Scale * 100}%`,
            height: `${entry.height * current.Scale * 100}%`,
          }}
          {...dragProps(
            entry.id,
            current.CenterX,
            current.CenterY,
            move,
            { width: entry.width * current.Scale, height: entry.height * current.Scale },
            resize,
          )}
        >
          <InterfaceArtwork id={entry.id} hotbar={hotbar} />
          <span className="controls-region-label">{entry.label}</span>
          <span className="controls-resize-handle" aria-hidden="true" />
        </button>
      ) : (
        <div
          key={entry.id}
          aria-hidden="true"
          className={`controls-preview-region controls-region-art controls-region-${entry.id}`}
          style={{
            left: `${current.CenterX * 100}%`,
            top: `${current.CenterY * 100}%`,
            width: `${entry.width * current.Scale * 100}%`,
            height: `${entry.height * current.Scale * 100}%`,
          }}
        >
          <InterfaceArtwork id={entry.id} hotbar={hotbar} showHotbarButtons={!!customControls} />
        </div>
      );
    };

    return (
      <div
        className="controls-editor-workspace"
        data-preview-only={previewOnly}
        data-dock-left={dock.x < 0.5}
        data-dock-top={dock.y < 0.5}
      >
        <div className="controls-canvas-scroll">
          <div className="controls-canvas-scale" style={{ width: `${zoom}%`, height: `${zoom}%` }}>
            <div
              className="controls-preview"
              ref={preview}
              aria-label={
                scene === 'world'
                  ? '游戏场景预览'
                  : scene === 'hotbar'
                    ? '快捷栏预览'
                    : scene === 'crafting'
                      ? '制作界面预览'
                      : '背包界面预览'
              }
              data-grid={grid && !previewOnly}
              data-scene={scene}
            >
              {controlEditor && sceneRegions.map((entry) => renderRegionArt(entry, false))}
              {controlEditor
                ? controls.map((entry) => {
                    const { x, y, width, height } = controlBounds(
                      entry,
                      profile,
                      !!customControls,
                      viewport,
                    );
                    const data = entry.Launcher?.Data;
                    const image = data && texturePreview(data, entry.Launcher?.Assets);
                    const label = controlLabel(entry);
                    const circle =
                      !data ||
                      data.shape === 'CIRCLE' ||
                      data.type === 'joystick' ||
                      data.type === 'radialmenu';
                    const color = (value: unknown, fallback: number) =>
                      '#' +
                      (Number(value ?? fallback) >>> 0).toString(16).padStart(8, '0').slice(-6);
                    if (previewOnly && (data?.isVisible === false || profile.HideGameControls))
                      return null;
                    return (
                      <button
                        key={entry.Id}
                        type="button"
                        aria-label={label}
                        aria-pressed={!previewOnly && entry.Id === selected}
                        disabled={previewOnly || pending}
                        className={`controls-preview-node controls-preview-control${isStick(entry) ? ' is-stick' : ''}`}
                        data-control-type={data?.type ?? (isStick(entry) ? 'joystick' : 'button')}
                        data-native-control={!data}
                        style={{
                          left: `${x * 100}%`,
                          top: `${y * 100}%`,
                          width: `${width * 100}%`,
                          height: `${height * 100}%`,
                          opacity: data?.isVisible === false ? 0.28 : (profile.Opacity ?? 0.78),
                          rotate: data ? `${Number(data.rotation ?? 0)}deg` : undefined,
                          borderRadius: circle ? '50%' : Number(data?.cornerRadius ?? 4),
                          ...(data && {
                            background: `color-mix(in srgb, ${color(data.bgColor, 0xff2a2a2a)} ${Number(data.opacity ?? 0.35) * 100}%, transparent)`,
                            borderColor: `color-mix(in srgb, ${color(data.strokeColor, 0xffaaaaaa)} ${Number(data.borderOpacity ?? 0.5) * 100}%, transparent)`,
                            color: `color-mix(in srgb, ${color(data.textColor, 0xffffffff)} ${Number(data.textOpacity ?? 0.9) * 100}%, transparent)`,
                          }),
                          ...(image && {
                            backgroundImage: `url("${image}")`,
                            backgroundSize: 'contain',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                          }),
                        }}
                        {...dragProps(
                          entry.Id,
                          x,
                          y,
                          (nextX, nextY, checkpoint) => {
                            editControl(
                              entry.Id,
                              {
                                X: clamp(
                                  nextX - (data ? width / 2 : 0),
                                  0,
                                  data ? Math.max(0, 1 - width) : 1,
                                ),
                                Y: clamp(
                                  nextY - (data ? height / 2 : 0),
                                  0,
                                  data ? Math.max(0, 1 - height) : 1,
                                ),
                              },
                              checkpoint,
                            );
                          },
                          { width, height },
                          (nextWidth, nextHeight, checkpoint) => {
                            if (data) {
                              const factor = Math.max(nextWidth / width, nextHeight / height);
                              const widthValue =
                                data.isSizeRatioLocked === false
                                  ? (nextWidth * viewport.width) / (entry.Size * viewport.height)
                                  : (data.width ?? 0.16) * factor;
                              const heightValue =
                                data.isSizeRatioLocked === false
                                  ? nextHeight / entry.Size
                                  : (data.height ?? 0.16) * factor;
                              editControl(
                                entry.Id,
                                {
                                  Launcher: {
                                    ...entry.Launcher,
                                    Data: {
                                      ...data,
                                      width: clamp(widthValue, 0.005, 3),
                                      height: clamp(heightValue, 0.005, 3),
                                    },
                                  },
                                },
                                checkpoint,
                              );
                            } else {
                              const factor = Math.max(nextWidth / width, nextHeight / height);
                              editControl(
                                entry.Id,
                                { Size: clamp(entry.Size * factor, 0.35, 2) },
                                checkpoint,
                              );
                            }
                          },
                        )}
                      >
                        {!image && (
                          <ControlArtwork
                            control={entry}
                            mode={builtInMode === 1 ? 'Advanced' : 'Simple'}
                            data={data}
                          />
                        )}
                        <span className="controls-resize-handle" aria-hidden="true" />
                      </button>
                    );
                  })
                : sceneRegions.map((entry) => renderRegionArt(entry, true))}
            </div>
          </div>
        </div>
        {panel === 'palette' && !previewOnly && (
          <section className="controls-float-panel" aria-label="控件组件">
            <Button onClick={() => setPanel('menu')}>返回菜单</Button>
            <div className="controls-editor-actions">
              <Button onClick={() => newControl(0)}>游戏摇杆</Button>
              <Button onClick={() => newControl(1)}>游戏按键</Button>
              {componentTypes.map(([type, label], kind) => (
                <Button
                  key={type}
                  onClick={() =>
                    newControl(kind, {
                      type,
                      name: label,
                      width: 0.16,
                      height: 0.16,
                      ...(type === 'text' && { displayText: label }),
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </section>
        )}
        {(panel === 'inspector' || selectionOnly) && !previewOnly && (
          <aside
            key={selectionOnly ? selected : 'inspector'}
            className="controls-float-panel controls-inspector"
            data-selection-side={
              selectionOnly ? (selectionPanelRight ? 'right' : 'left') : undefined
            }
            aria-label="属性"
          >
            <div className="controls-inspector-header">
              <h3>
                {controlEditor ? (control ? controlLabel(control) : '控件属性') : region.label}
              </h3>
              <Button
                aria-label="关闭属性"
                title="关闭属性"
                symbol="close"
                onClick={() => setPanel(undefined)}
              />
            </div>
            <fieldset disabled={pending}>
              {controlEditor ? (
                <>
                  {!selectionOnly && (
                    <>
                      <label className="controls-field">
                        布局模式
                        <select
                          value={mode}
                          onChange={(event) => edit({ ControlLayout: Number(event.target.value) })}
                        >
                          <option value={0}>简单</option>
                          <option value={1}>高级</option>
                          <option value={2}>自定义</option>
                        </select>
                      </label>
                      <label className="controls-field">
                        控制预设
                        <select
                          value={mode === 2 ? presetIndex : ''}
                          onChange={(event) => {
                            setSelected('');
                            edit({
                              ActiveCustomPresetIndex: Number(event.target.value),
                              ControlLayout: 2,
                            });
                          }}
                        >
                          <option value="" disabled>
                            选择预设
                          </option>
                          {[0, 1, 2, 3].map((index) => (
                            <option key={index} value={index}>
                              {profile.CustomPresets?.[index]?.Name || `预设 ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      {mode === 2 && (
                        <label className="controls-field">
                          预设名称
                          <input
                            value={preset?.Name ?? `预设 ${presetIndex + 1}`}
                            maxLength={64}
                            onChange={(event) => editPreset(controls, true, event.target.value)}
                          />
                        </label>
                      )}
                      <label className="controls-field">
                        选中控件
                        <select
                          value={control?.Id ?? ''}
                          onChange={(event) => setSelected(event.target.value)}
                        >
                          <option value="">选择控件</option>
                          {controls.map((entry) => (
                            <option key={entry.Id} value={entry.Id}>
                              {controlLabel(entry)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {control && (
                    <>
                      <div className="controls-editor-actions">
                        <Button disabled={controls.length >= 256} onClick={duplicate}>
                          复制控件
                        </Button>
                        <Button
                          onClick={() => {
                            editPreset(controls.filter((entry) => entry.Id !== selected));
                            setSelected('');
                            if (selectionOnly) setPanel(undefined);
                          }}
                        >
                          删除控件
                        </Button>
                      </div>
                      <Range
                        label="单个控件大小"
                        value={control.Size}
                        min={0.35}
                        max={2}
                        step={0.05}
                        onChange={(Size) => editControl(control.Id, { Size })}
                      />
                      <Range
                        label="控件横向位置"
                        value={control.X}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(X) => editControl(control.Id, { X })}
                      />
                      <Range
                        label="控件纵向位置"
                        value={control.Y}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(Y) => editControl(control.Id, { Y })}
                      />
                      <label className="controls-check">
                        <input
                          type="checkbox"
                          checked={control.Multitouch ?? true}
                          onChange={(event) =>
                            editControl(control.Id, { Multitouch: event.target.checked })
                          }
                        />
                        允许多点触控
                      </label>
                      {controlData && (
                        <ExtendedControlFields
                          key={control.Id}
                          data={controlData}
                          assets={control.Launcher?.Assets}
                          actions={KEY_BINDINGS}
                          edit={(changes, assets = control.Launcher?.Assets) =>
                            editControl(control.Id, {
                              Launcher: { Assets: assets, Data: { ...controlData, ...changes } },
                            })
                          }
                        />
                      )}
                      {!controlData && isStick(control) && (
                        <label className="controls-field">
                          摇杆用途
                          <select
                            value={enumIndex(control.JoystickRole, STICK_ROLES)}
                            onChange={(event) =>
                              editControl(control.Id, {
                                JoystickRole: Number(event.target.value),
                                TextureName: '',
                              })
                            }
                          >
                            {STICK_LABELS.map((label, index) => (
                              <option key={label} value={index}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!controlData &&
                        !isStick(control) &&
                        (control.Kind === 2 || control.Kind === 'RadialMenu' ? (
                          Array.from({ length: 4 }, (_, slot) => (
                            <label className="controls-field" key={slot}>
                              轮盘动作 {slot + 1}
                              <select
                                value={enumIndex(control.RadialActions?.[slot] ?? 22, ACTIONS)}
                                onChange={(event) =>
                                  editControl(control.Id, {
                                    RadialActions: Array.from({ length: 4 }, (_, i) =>
                                      i === slot
                                        ? Number(event.target.value)
                                        : (control.RadialActions?.[i] ?? 22),
                                    ),
                                  })
                                }
                              >
                                {ACTION_LABELS.map((label, index) => (
                                  <option
                                    key={label}
                                    value={index}
                                    disabled={[19, 20, 21, 32].includes(index)}
                                  >
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))
                        ) : (
                          <label className="controls-field">
                            按键动作
                            <select
                              value={enumIndex(control.Action ?? 22, ACTIONS)}
                              onChange={(event) =>
                                editControl(control.Id, {
                                  Action: Number(event.target.value),
                                  TextureName: '',
                                })
                              }
                            >
                              {ACTION_LABELS.map((label, index) => (
                                <option
                                  key={label}
                                  value={index}
                                  disabled={[21, 32].includes(index)}
                                >
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      {!controlData && enumIndex(control.Action, ACTIONS) === 31 && (
                        <label className="controls-field">
                          模组按键标识
                          <input
                            value={control.ModKeybind ?? ''}
                            onChange={(event) =>
                              editControl(control.Id, { ModKeybind: event.target.value })
                            }
                          />
                        </label>
                      )}
                      {!controlData && enumIndex(control.Action, ACTIONS) === 33 && (
                        <label className="controls-field">
                          键盘按键
                          <input
                            value={control.KeyboardKey ?? ''}
                            onChange={(event) =>
                              editControl(control.Id, { KeyboardKey: event.target.value })
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                  {!selectionOnly && (
                    <details className="controls-details" open={!control}>
                      <summary>全局触控设置</summary>
                      <Range
                        label="控件大小"
                        value={profile.ControlScale ?? defaultControlScale}
                        min={0.6}
                        max={1.8}
                        step={0.05}
                        onChange={(ControlScale) => edit({ ControlScale })}
                      />
                      <Range
                        label="控件透明度"
                        value={profile.Opacity ?? 0.78}
                        min={0.35}
                        max={1}
                        step={0.01}
                        onChange={(Opacity) => edit({ Opacity })}
                      />
                      <Range
                        label="摇杆死区"
                        value={profile.JoystickDeadzone ?? 0.25}
                        min={0.05}
                        max={0.55}
                        step={0.05}
                        onChange={(JoystickDeadzone) => edit({ JoystickDeadzone })}
                      />
                      {(
                        [
                          ['JoystickUpJumps', '上推跳跃', true],
                          ['EnablePinchZoom', '双指缩放', true],
                          ['ShowTopButtons', '显示顶部按钮', true],
                          ['EnableTouchInput', '启用触摸输入', true],
                          ['HideGameControls', '隐藏游戏控件', false],
                        ] as const
                      ).map(([key, label, defaultValue]) => (
                        <label className="controls-toggle" key={key}>
                          {label}
                          <Switch
                            label={label}
                            checked={profile[key] ?? defaultValue}
                            onChange={(value) => edit({ [key]: value })}
                          />
                        </label>
                      ))}
                    </details>
                  )}
                  {!selectionOnly && mode === 2 && (
                    <Button
                      onClick={() => {
                        editPreset(null);
                        setSelected('');
                      }}
                    >
                      恢复预设
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <label className="controls-field">
                    界面区域
                    <select
                      value={region.id}
                      onChange={(event) => {
                        const id = event.target.value;
                        setSelected(id);
                        if (id === 'Hotbar') setScene('hotbar');
                        else if (id === 'Crafting') setScene('crafting');
                        else if (id === 'Equipment' || scene === 'hotbar') setScene('inventory');
                      }}
                    >
                      {regions.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="controls-field">
                    快捷栏方向
                    <select
                      value={enumIndex(profile.HotbarOrientation, ['Vertical', 'Horizontal'])}
                      onChange={(event) => edit({ HotbarOrientation: Number(event.target.value) })}
                    >
                      <option value={0}>纵向</option>
                      <option value={1}>横向</option>
                    </select>
                  </label>
                  <Range
                    label="区域大小"
                    value={regionPosition.Scale}
                    min={0.5}
                    max={maxScale(region)}
                    step={0.01}
                    onChange={(Scale) => editRegion(region.id, { ...regionPosition, Scale })}
                  />
                  <Range
                    label="区域横向位置"
                    value={regionPosition.CenterX}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(CenterX) => editRegion(region.id, { ...regionPosition, CenterX })}
                  />
                  <Range
                    label="区域纵向位置"
                    value={regionPosition.CenterY}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(CenterY) => editRegion(region.id, { ...regionPosition, CenterY })}
                  />
                  <Range
                    label="游戏字体大小"
                    value={profile.UIFontScale ?? 1.18}
                    min={0.9}
                    max={1.4}
                    step={0.02}
                    onChange={(UIFontScale) => edit({ UIFontScale })}
                  />
                  <Range
                    label="屏幕边距"
                    value={profile.EdgePadding ?? 18}
                    min={0}
                    max={96}
                    step={1}
                    onChange={(EdgePadding) => edit({ EdgePadding })}
                  />
                  <div className="controls-editor-actions">
                    <Button onClick={() => editRegion(region.id)}>重置区域</Button>
                    <Button
                      onClick={() =>
                        edit({
                          HotbarOrientation: 0,
                          InterfaceLayout: { FormatVersion: 1, Regions: {} },
                          EdgePadding: 18,
                          UIFontScale: 1.18,
                        })
                      }
                    >
                      重置界面
                    </Button>
                  </div>
                </>
              )}
            </fieldset>
          </aside>
        )}
        {panel === 'menu' && (
          <section className="controls-float-panel" aria-label="编辑菜单">
            <div className="controls-menu-group" role="group" aria-label="编辑模式">
              <Button aria-pressed={controlEditor} onClick={() => changeCategory('controls')}>
                游戏控制
              </Button>
              <Button aria-pressed={!controlEditor} onClick={() => changeCategory('interface')}>
                游戏界面
              </Button>
            </div>
            <div className="controls-menu-group" role="group" aria-label="预览场景">
              {(
                [
                  ['world', '游戏'],
                  ['hotbar', '快捷栏'],
                  ['inventory', '背包'],
                  ['crafting', '制作'],
                ] as const
              ).map(
                ([id, label]) =>
                  (controlEditor || id !== 'world') && (
                    <Button key={id} aria-pressed={scene === id} onClick={() => selectScene(id)}>
                      {label}
                    </Button>
                  ),
              )}
            </div>
            <div className="controls-menu-group" role="group" aria-label="编辑工具">
              {controlEditor && (
                <Button
                  disabled={pending || previewOnly || controls.length >= 256}
                  onClick={() => setPanel('palette')}
                >
                  添加控件
                </Button>
              )}
              <Button disabled={previewOnly} onClick={() => setPanel('inspector')}>
                属性
              </Button>
              <Button aria-pressed={grid} disabled={previewOnly} onClick={() => setGrid(!grid)}>
                网格
              </Button>
              <Button aria-pressed={snap} disabled={previewOnly} onClick={() => setSnap(!snap)}>
                网格吸附
              </Button>
              <Button
                aria-pressed={previewOnly}
                onClick={() => {
                  setPanel(undefined);
                  setPreviewOnly(!previewOnly);
                }}
              >
                纯预览
              </Button>
              <Button
                aria-label="缩小画布"
                title="缩小画布"
                symbol="minus"
                disabled={zoom === 100}
                onClick={() => setZoom(zoom - 25)}
              />
              <Button
                aria-label="放大画布"
                title="放大画布"
                symbol="plus"
                disabled={zoom === 200}
                onClick={() => setZoom(zoom + 25)}
              />
              <Button
                aria-label="撤销"
                title="撤销"
                symbol="reset"
                disabled={pending || !history.current.past.length || previewOnly}
                onClick={() => traverse(false)}
              />
              <Button
                aria-label="重做"
                title="重做"
                disabled={pending || !history.current.future.length || previewOnly}
                onClick={() => traverse(true)}
              >
                <Icon name="reset" className="controls-redo-icon" />
              </Button>
            </div>
            <div className="controls-menu-group">
              {controlEditor && (
                <Button
                  disabled={pending || previewOnly}
                  onClick={() => {
                    edit({
                      ControlLayout: defaultControlMode,
                      ControlScale: defaultControlScale,
                      LeftStickOffsetX: 0,
                      LeftStickOffsetY: 0,
                      RightStickOffsetX: 0,
                      RightStickOffsetY: 0,
                    });
                    setSelected('');
                    setPanel(undefined);
                  }}
                >
                  使用默认控件
                </Button>
              )}
              <Button disabled={pending} onClick={requestClose}>
                退出编辑
              </Button>
              <Button variant="primary" disabled={pending} onClick={() => void save()}>
                保存布局
              </Button>
            </div>
          </section>
        )}
      </div>
    );
  };

  return createPortal(
    <dialog
      id="game-layout-editor"
      className="controls-editor-screen"
      ref={dialog}
      aria-label="游戏布局编辑"
      onCancel={(event) => {
        event.preventDefault();
        if (confirmExit) setConfirmExit(false);
        else if (panel && !pending) setPanel(undefined);
        else requestClose();
      }}
    >
      {profile && viewport?.width && viewport.height
        ? renderEditor(profile, viewport)
        : !failure && <p role="status">正在读取布局…</p>}
      <div className="controls-dock-track">
        <button
          type="button"
          className="controls-dock"
          aria-label="悬浮菜单"
          aria-expanded={!!panel}
          style={{ left: `${dock.x * 100}%`, top: `${dock.y * 100}%` }}
          onPointerDown={(event) => {
            if (event.button !== 0 || dockDrag.current) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            dockDrag.current = {
              id: event.pointerId,
              x: event.clientX - bounds.left - bounds.width / 2,
              y: event.clientY - bounds.top - bounds.height / 2,
              moved: false,
            };
            suppressDockClick.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = dockDrag.current;
            const track = event.currentTarget.parentElement?.getBoundingClientRect();
            if (active?.id !== event.pointerId || !track?.width || !track.height) return;
            const x = event.clientX - active.x - track.left;
            const y = event.clientY - active.y - track.top;
            if (
              !active.moved &&
              Math.hypot(x - dock.x * track.width, y - dock.y * track.height) < 6
            )
              return;
            active.moved = true;
            setDock({ x: clamp(x / track.width), y: clamp(y / track.height) });
          }}
          onLostPointerCapture={() => {
            suppressDockClick.current = dockDrag.current?.moved ?? false;
            dockDrag.current = null;
          }}
          onClick={(event) => {
            if (event.detail && suppressDockClick.current) return;
            if (!profile) requestClose();
            else setPanel(panel ? undefined : 'menu');
          }}
        >
          <Icon name="home" />
        </button>
      </div>
      {failure && (
        <p className="controls-editor-error" role="alert">
          {failure}
        </p>
      )}
      {confirmExit && (
        <div className="controls-exit">
          <section aria-label="退出编辑">
            <h3>布局有未保存的修改</h3>
            <div className="controls-editor-actions">
              <Button onClick={() => setConfirmExit(false)}>继续编辑</Button>
              <Button onClick={onClose}>放弃修改</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmExit(false);
                  void save();
                }}
              >
                保存并退出
              </Button>
            </div>
          </section>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
