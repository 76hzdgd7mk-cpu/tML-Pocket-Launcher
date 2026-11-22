import { useRef, useState } from 'react';
import {
  Badge,
  Button,
  ContextNote,
  Icon,
  SettingRow,
  Switch,
  WorkspaceTabs,
} from '../components/ui';
import type { TabItem } from '../components/ui';
import { Select, Slider } from '../components/form-controls';
import { DemoControl } from '../components/demo-control';
import { useWorkspaceActions } from './home';
import type { SettingsTab } from '../domain/types';
import { prepareBackground } from '../native/background';
import { nativeRequest } from '../native/bridge';
import { hexToRgb, rgbToHex, tintGradient, tintInk, type TintRGB } from '../domain/background-tint';
import { useNativeFileBrowser } from './native/files';
import {
  NativeRuntimeSettings,
  NativeControlsSettings,
  NativeLayoutManagement,
  NativeStorageSettings,
} from './native/settings';

const settingsTabs: TabItem<SettingsTab>[] = [
  {
    value: 'appearance',
    label: '外观',
    id: 'settings-tab-appearance',
    content: <Appearance />,
  },
  {
    value: 'runtime',
    label: '游戏与运行',
    id: 'settings-tab-runtime',
    content: <Runtime />,
  },
  {
    value: 'controls',
    label: '触控与输入',
    id: 'settings-tab-controls',
    content: <Controls />,
  },
  {
    value: 'storage',
    label: '存储与下载',
    id: 'settings-tab-storage',
    content: <Storage />,
  },
  {
    value: 'about',
    label: '关于',
    id: 'settings-tab-about',
    content: <About />,
  },
];

export function SettingsPage() {
  const { state, update, nativeMode } = useWorkspaceActions();
  const items: TabItem<SettingsTab>[] = nativeMode
    ? [
        ...settingsTabs.slice(0, 3),
        {
          value: 'control-management',
          label: '控制管理',
          id: 'settings-tab-control-management',
          content: <NativeLayoutManagement />,
        },
        ...settingsTabs.slice(3),
      ]
    : settingsTabs;
  return (
    <WorkspaceTabs
      value={state.settingsTab}
      onChange={(settingsTab) => update((current) => ({ ...current, settingsTab }))}
      label="设置分类"
      items={items}
    />
  );
}
function Appearance() {
  const {
    state,
    setPreferences,
    customize,
    activity,
    notify,
    nativeMode,
    openDialog,
    closeDialog,
  } = useWorkspaceActions();
  const prefs = state.preferences;
  const file = useRef<HTMLInputElement>(null);
  const { browse } = useNativeFileBrowser();
  const selectImage = () => {
    if (!nativeMode) {
      file.current?.click();
      return;
    }
    browse({
      kind: 'image',
      choose: async (files) => {
        const image = await nativeRequest<{ data: string }>('files.image', files[0]);
        return prepareBackground(image.data);
      },
      complete: (image) => {
        setPreferences({ background: 'custom', customImage: image as string });
        notify('背景已保存。');
      },
    });
  };
  const openTint = () =>
    openDialog({
      title: '自定义色调',
      description: '调整红、绿、蓝通道，确认后应用到启动器背景。',
      body: (
        <TintPalette
          value={prefs.backgroundTint}
          onCancel={closeDialog}
          onApply={(tint) => {
            setPreferences({ background: 'diy', backgroundTint: tint });
            closeDialog();
          }}
        />
      ),
    });
  return (
    <>
      <section className="settings-section">
        <h2>界面外观</h2>
        <div className="panel">
          <SettingRow title="主题模式" description="选择浅色、深色或跟随系统。">
            <div className="theme-options">
              {(
                [
                  ['light', '浅色', 'sun'],
                  ['dark', '深色', 'moon'],
                  ['system', '跟随系统', 'settings'],
                ] as const
              ).map(([theme, label, symbol]) => (
                <Button
                  key={theme}
                  className={`theme-choice ${prefs.theme === theme ? 'active' : ''}`}
                  aria-pressed={prefs.theme === theme}
                  data-theme-choice={theme}
                  onClick={() => setPreferences({ theme })}
                >
                  <Icon name={symbol} />
                  {label}
                </Button>
              ))}
            </div>
          </SettingRow>
          <SettingRow title="主题样式" description="选择启动器使用的主题视觉样式。">
            <Select
              label="主题样式"
              action="frontend-style"
              options={[
                ['default', '默认'],
                ['tml', '泰拉风'],
              ]}
              value={prefs.themeStyle}
              onChange={(themeStyle) => {
                if (themeStyle === 'default' || themeStyle === 'tml')
                  setPreferences({ themeStyle });
              }}
            />
          </SettingRow>
          <SettingRow title="启动器方向" description="默认横屏，切换后保留当前页面。">
            <Select
              label="启动器方向"
              options={[
                ['landscape', '横屏'],
                ['portrait', '竖屏'],
              ]}
              value={prefs.orientation}
              onChange={(orientation) => {
                if (orientation === 'landscape' || orientation === 'portrait')
                  setPreferences({ orientation });
              }}
            />
          </SettingRow>
          <SettingRow title="界面动效" description="减少动态效果，保留操作反馈。">
            <Switch
              label="启用界面动效"
              action="motion"
              checked={prefs.motion}
              onChange={(motion) => setPreferences({ motion })}
            />
          </SettingRow>
        </div>
      </section>
      <section className="settings-section">
        <h2>自定义背景</h2>
        <div className="panel">
          <SettingRow title="背景样式" description="纯色、自定义色调或本地图片。">
            {prefs.background === 'custom' ? (
              <Button
                variant="ghost"
                data-action="remove-background"
                onClick={() => setPreferences({ background: 'none', customImage: undefined })}
              >
                移除图片
              </Button>
            ) : (
              <Badge>可选设置</Badge>
            )}
          </SettingRow>
          <div className="background-options">
            {(
              [
                ['none', '纯色'],
                ['diy', '自定色'],
              ] as const
            ).map(([background, label]) => (
              <Button
                key={background}
                className={`background-option ${background === 'diy' ? 'diy-bg' : ''} ${prefs.background === background ? 'active' : ''}`}
                data-background={background}
                style={
                  background === 'diy'
                    ? {
                        background: tintGradient(prefs.backgroundTint),
                        color: tintInk(prefs.backgroundTint),
                      }
                    : undefined
                }
                onClick={() => (background === 'diy' ? openTint() : setPreferences({ background }))}
              >
                {label}
                {prefs.background === background && (
                  <span className="chosen-dot">
                    <Icon name="check" />
                  </span>
                )}
              </Button>
            ))}
            <Button
              className={`background-option ${prefs.background === 'custom' ? 'active' : ''}`}
              data-action="upload-background"
              onClick={selectImage}
              style={
                prefs.background === 'custom' && prefs.customImage
                  ? {
                      backgroundImage: `linear-gradient(#0000 45%, #000000a6), url(${prefs.customImage})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      color: '#fff',
                    }
                  : undefined
              }
            >
              {!(prefs.background === 'custom' && prefs.customImage) && (
                <Icon name="plus" className="background-add" />
              )}
              图片背景
            </Button>
          </div>
          <p className="setting-caption">
            可选像素场景、游戏截图或本地图片。背景仅用于启动器界面。
          </p>
        </div>
      </section>
      <section className="settings-section">
        <h2>工作空间</h2>
        <div className="panel">
          <SettingRow title="首页快捷入口" description="固定四项常用操作，按你的习惯选择。">
            <Button
              variant="ghost"
              symbol="sliders"
              data-action="extra-shortcuts"
              onClick={customize}
            >
              自定义
            </Button>
          </SettingRow>
          <SettingRow title="操作记录" description="查看本次预览的配置、任务与管理操作。">
            <Button variant="ghost" symbol="file" data-action="extra-activity" onClick={activity}>
              查看记录
            </Button>
          </SettingRow>
        </div>
        <p className="setting-caption">
          主题、屏幕方向、动效和快捷入口偏好保存在此浏览器；操作记录仅保留在本次会话。
        </p>
      </section>
      {!nativeMode && (
        <input
          type="file"
          id="background-file"
          ref={file}
          accept="image/*"
          hidden
          onChange={(event) => {
            const image = event.target.files?.[0];
            event.target.value = '';
            if (!image) return;
            if (!image.type.startsWith('image/')) return notify('请选择图片文件。');
            if (image.size > 10 * 1024 * 1024) return notify('请选择 10 MB 以内的图片。');
            const reader = new FileReader();
            reader.onerror = () => notify('无法读取图片，请重新选择。');
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                if (nativeMode) {
                  void prepareBackground(reader.result)
                    .then((customImage) => {
                      setPreferences({ background: 'custom', customImage });
                      notify('背景已保存。');
                    })
                    .catch((error: Error) => notify(error.message));
                } else {
                  setPreferences({ background: 'custom', customImage: reader.result });
                  notify('背景已用于本次原型预览。');
                }
              }
            };
            reader.readAsDataURL(image);
          }}
        />
      )}
    </>
  );
}
function TintPalette({
  value,
  onApply,
  onCancel,
}: {
  value: string;
  onApply: (tint: string) => void;
  onCancel: () => void;
}) {
  const [rgb, setRgb] = useState<TintRGB>(() => hexToRgb(value));
  const tint = rgbToHex(rgb);
  return (
    <div className="tint-palette">
      <div className="tint-preview" style={{ background: tintGradient(tint) }} />
      <div className="tint-value">{tint.toUpperCase()}</div>
      {(['R', 'G', 'B'] as const).map((channel, index) => (
        <div className="tint-channel" key={channel}>
          <span>{channel}</span>
          <Slider
            id={`tint-${channel.toLowerCase()}`}
            label={`${channel} 通道`}
            value={rgb[index]}
            min={0}
            max={255}
            unit=""
            onChange={(next) =>
              setRgb(
                (current) =>
                  current.map((component, position) =>
                    position === index ? next : component,
                  ) as TintRGB,
              )
            }
          />
        </div>
      ))}
      <div className="dialog-actions">
        <Button variant="ghost" data-action="cancel-tint" onClick={onCancel}>
          取消
        </Button>
        <Button data-action="apply-tint" onClick={() => onApply(tint)}>
          确定
        </Button>
      </div>
    </div>
  );
}
function LocalSwitch({
  title,
  description,
  label,
  action,
}: {
  title: string;
  description: string;
  label: string;
  action: string;
}) {
  const [checked, setChecked] = useState(true);
  const { notify } = useWorkspaceActions();
  return (
    <SettingRow title={title} description={description}>
      <Switch
        checked={checked}
        label={label}
        action={action}
        onChange={(value) => {
          setChecked(value);
          notify('已更新原型中的设置状态。');
        }}
      />
    </SettingRow>
  );
}
function Runtime() {
  const { showInfo, nativeMode } = useWorkspaceActions();
  if (nativeMode) return <NativeRuntimeSettings />;
  return (
    <section className="settings-section">
      <h2>游戏与运行</h2>
      <div className="panel">
        <LocalSwitch
          title="启动前校验"
          description="检查资源、模组依赖与补丁兼容状态。"
          label="启动前校验"
          action="setting-validation"
        />
        <SettingRow title="渲染模式" description="只展示当前设备可用的渲染选项。">
          <Select
            label="渲染模式"
            defaultValue="auto"
            options={[
              ['auto', '自动选择'],
              ['gles', 'OpenGL ES'],
            ]}
          />
        </SettingRow>
        <SettingRow title="分辨率比例" description="降低比例可减轻渲染负担。">
          <Select
            label="分辨率比例"
            defaultValue="100"
            options={[
              ['100', '100%'],
              ['75', '75%'],
              ['50', '50%'],
            ]}
          />
        </SettingRow>
        <SettingRow title="启动参数" description="高级选项，启动时应用。">
          <Button variant="ghost" symbol="chevron" onClick={() => showInfo('launch-args')}>
            编辑参数
          </Button>
        </SettingRow>
      </div>
      <ContextNote>设置项在正式接入运行时后生效；不提供无效的内存上限滑块。</ContextNote>
    </section>
  );
}
function Controls() {
  const { showInfo, nativeMode } = useWorkspaceActions();
  const [opacity, setOpacity] = useState(80);
  if (nativeMode) return <NativeControlsSettings />;
  return (
    <section className="settings-section">
      <h2>触控与输入</h2>
      <div className="panel">
        <LocalSwitch
          title="屏幕虚拟按键"
          description="显示游戏内的虚拟控制布局。"
          label="显示屏幕虚拟按键"
          action="setting-touch"
        />
        <SettingRow title="按键布局" description="布局编辑与预设单独管理。">
          <Button variant="ghost" symbol="chevron" onClick={() => showInfo('controls-layout')}>
            编辑布局
          </Button>
        </SettingRow>
        <SettingRow title="按键不透明度" description="在游戏内使用。">
          <Slider label="按键不透明度" min={20} max={100} value={opacity} onChange={setOpacity} />
        </SettingRow>
        <SettingRow title="文本输入" description="使用系统键盘进行游戏内文本输入。">
          <Badge>系统键盘</Badge>
        </SettingRow>
      </div>
    </section>
  );
}
function Storage() {
  const { showInfo, tasks, nativeMode } = useWorkspaceActions();
  if (nativeMode) return <NativeStorageSettings />;
  return (
    <section className="settings-section">
      <h2>存储与下载</h2>
      <div className="panel">
        <SettingRow title="游戏与用户数据" description="资源、存档与模组分开保存。">
          <Button variant="ghost" symbol="folder" onClick={() => showInfo('storage-paths')}>
            查看目录
          </Button>
        </SettingRow>
        <LocalSwitch
          title="仅在 Wi-Fi 下下载"
          description="移动网络下载时再次确认。"
          label="仅在 Wi-Fi 下下载"
          action="setting-wifi"
        />
        <SettingRow title="下载任务" description="查看进度、暂停、重试与安装校验。">
          <Button variant="ghost" symbol="chevron" data-action="tasks" onClick={tasks}>
            查看任务
          </Button>
        </SettingRow>
        <SettingRow title="缓存管理" description="只清理临时下载和可重建缓存。">
          <Button variant="ghost" symbol="chevron" onClick={() => showInfo('cache')}>
            管理缓存
          </Button>
        </SettingRow>
      </div>
    </section>
  );
}
function About() {
  const { showInfo, nativeMode, nativeState } = useWorkspaceActions();
  return (
    <section className="settings-section">
      <h2>关于启动器</h2>
      <div className="panel">
        <div className="resource-row">
          <span className="resource-icon">
            <img src="/pocket-launcher.png" alt="" />
          </span>
          <div className="resource-copy">
            <h3>tML Pocket Launcher</h3>
            <p>Android 上的 tModLoader 启动与管理工具。</p>
            <Badge>
              {nativeMode ? `Android · ${nativeState?.appVersion || ''}` : '界面框架设计稿'}
            </Badge>
          </div>
        </div>
        <SettingRow title="诊断日志" description="启动失败时查看并导出日志。">
          <Button variant="ghost" symbol="chevron" onClick={() => showInfo('logs')}>
            查看日志
          </Button>
        </SettingRow>
        <SettingRow title="开源与许可" description="依赖、项目来源及授权信息。">
          <Button variant="ghost" symbol="chevron" onClick={() => showInfo('licenses')}>
            查看说明
          </Button>
        </SettingRow>
        <div className="about-preview">
          <DemoControl />
        </div>
      </div>
    </section>
  );
}
