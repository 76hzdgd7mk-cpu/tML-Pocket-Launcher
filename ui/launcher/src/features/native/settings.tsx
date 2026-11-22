import { useState } from 'react';
import { Badge, Button, SettingRow, Switch } from '../../components/ui';
import { Select } from '../../components/form-controls';
import { useGameActions } from '../game-actions';
import { nativeRequest } from '../../native/bridge';
import { ControlsEditor } from './controls-editor';

export function NativeRuntimeSettings() {
  const { showInfo, nativeState, notify } = useGameActions();
  const rendererOptions = nativeState?.renderers?.length
    ? nativeState.renderers
    : [
        {
          identity: 'native',
          packageName: '',
          packageVersion: '',
          rendererId: 'native',
          displayName: '系统原生 OpenGL ES 3',
          description: '',
          backend: 'native',
        },
        {
          identity: 'vulkan',
          packageName: '',
          packageVersion: '',
          rendererId: 'vulkan',
          displayName: 'SDL GPU · Vulkan',
          description: 'SDL2-compat + SDL3 GPU',
          backend: 'vulkan',
        },
      ];
  const selectedRenderer = nativeState?.preferences.rendererPlugin ?? 'native';
  const rendererSelection = rendererOptions.some(
    (renderer) => renderer.identity === selectedRenderer,
  )
    ? selectedRenderer
    : 'native';
  return (
    <section className="settings-section">
      <h2>游戏与运行</h2>
      <div className="panel">
        <SettingRow title="启动前校验" description="检查实际资源、模组依赖和补丁目标版本。">
          <Badge tone="green">始终启用</Badge>
        </SettingRow>
        <SettingRow title="渲染模式" description="选择 SDL2/FNA3D 图形后端。">
          <Select
            label="渲染器"
            value={rendererSelection}
            options={rendererOptions.map((renderer) => [
              renderer.identity,
              renderer.identity === 'native'
                ? renderer.displayName
                : `${renderer.displayName} · ${renderer.packageName}${renderer.packageVersion ? ` ${renderer.packageVersion}` : ''}`,
            ])}
            onChange={(rendererPlugin) =>
              void nativeRequest('settings.save', { preferences: { rendererPlugin } }).catch(
                (error: Error) => notify(error.message),
              )
            }
          />
        </SettingRow>
        <SettingRow
          title="分辨率比例"
          description="降低渲染负担，触摸坐标随画面同步；下次启动生效。"
        >
          <Select
            label="分辨率比例"
            value={String(nativeState?.preferences.renderScale ?? 100)}
            options={[
              ['50', '50%'],
              ['75', '75%'],
              ['100', '100%'],
            ]}
            onChange={(value) =>
              void nativeRequest('settings.save', {
                preferences: { renderScale: Number(value) },
              }).catch((error: Error) => notify(error.message))
            }
          />
        </SettingRow>
        <SettingRow title="启动参数" description="每行一个参数，在下一次启动生效。">
          <Button variant="ghost" onClick={() => showInfo('launch-args')}>
            编辑参数
          </Button>
        </SettingRow>
      </div>
    </section>
  );
}
export function NativeControlsSettings() {
  return (
    <section className="settings-section">
      <h2>触控与输入</h2>
      <div className="panel">
        <SettingRow
          title="MobileJoystick"
          description="随启动器加载的游戏补丁，提供双摇杆、触屏背包、菜单与地图。"
        >
          <Badge tone="green">内置触控系统</Badge>
        </SettingRow>
        <SettingRow title="文本输入" description="游戏内使用 Android 系统键盘。">
          <Badge>系统键盘</Badge>
        </SettingRow>
      </div>
    </section>
  );
}

export function NativeLayoutManagement() {
  const [editing, setEditing] = useState(false);
  return (
    <section className="settings-section">
      <h2>控制管理</h2>
      <div className="panel">
        <SettingRow title="游戏布局">
          <Button onClick={() => setEditing(true)}>编辑游戏布局</Button>
        </SettingRow>
      </div>
      {editing && <ControlsEditor onClose={() => setEditing(false)} />}
    </section>
  );
}
export function NativeStorageSettings() {
  const { nativeState, notify, showInfo, tasks } = useGameActions();
  return (
    <section className="settings-section">
      <h2>存储与下载</h2>
      <div className="panel">
        <SettingRow title="游戏与用户数据" description="资源、存档与模组分开保存。">
          <Button variant="ghost" onClick={() => showInfo('storage-paths')}>
            查看目录
          </Button>
        </SettingRow>
        <SettingRow title="仅在 Wi-Fi 下下载" description="启用后阻止使用计费网络下载。">
          <Switch
            label="仅在 Wi-Fi 下下载"
            checked={nativeState?.preferences.wifiOnly === true}
            onChange={(wifiOnly) =>
              void nativeRequest('settings.save', { preferences: { wifiOnly } }).catch(
                (error: Error) => notify(error.message),
              )
            }
          />
        </SettingRow>
        <SettingRow title="下载任务" description="实际进度、取消与重试。">
          <Button variant="ghost" onClick={tasks}>
            查看任务
          </Button>
        </SettingRow>
        <SettingRow title="缓存管理" description="仅清理启动器下载临时文件。">
          <Button variant="ghost" onClick={() => showInfo('cache')}>
            管理缓存
          </Button>
        </SettingRow>
      </div>
    </section>
  );
}
