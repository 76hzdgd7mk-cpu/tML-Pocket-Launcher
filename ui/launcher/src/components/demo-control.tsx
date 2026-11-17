import { Button } from './ui';
import { useLauncher } from '../state/launcher';

export function DemoControl() {
  const { state, update, notify, nativeMode } = useLauncher();
  if (nativeMode) return null;
  return (
    <div className="demo-controls">
      <p>当前为界面交互预览，账号登录、下载与游戏启动仅演示流程。</p>
      <Button
        id="demo-toggle"
        variant="soft"
        aria-pressed={state.demo}
        onClick={() => {
          update((current) => ({ ...current, demo: !current.demo }));
          notify(state.demo ? '已恢复首次使用状态。' : '已显示示例数据，非真实安装状态。');
        }}
      >
        {state.demo ? '恢复首次使用状态' : '查看示例数据'}
      </Button>
    </div>
  );
}
