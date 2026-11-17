import { Badge, EmptyState, Icon, IconButton, Switch, WorkspaceTabs } from '../components/ui';
import { useGameActions } from './game-actions';

export function PatchesPage() {
  const { state, update, notice, record } = useGameActions();
  const builtins = [
    ['sliders', '触控与输入适配', '将屏幕触控、文本输入映射到游戏。'],
    ['game', '显示与全屏适配', '处理横屏、显示尺寸与沉浸式全屏。'],
    ['folder', '资源与平台兼容', '加载导入资源，并适配 Android 运行环境。'],
  ];
  return (
    <WorkspaceTabs
      value={state.patchTab}
      onChange={(patchTab) => update((current) => ({ ...current, patchTab }))}
      label="补丁分类"
      items={[
        {
          value: 'builtin',
          label: '内置适配',
          count: 3,
          id: 'patch-tab-builtin',
          data: { 'data-patch-tab': 'builtin' },
          content: (
            <>
              <section
                className="panel patch-list"
                id={state.patchTab === 'builtin' ? 'patch-panel' : undefined}
              >
                {builtins.map(([symbol, title, description], index) => (
                  <div className="patch-row" key={title}>
                    <span className="patch-icon">
                      <Icon name={symbol} />
                    </span>
                    <div className="row-main">
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                    <span className="lock-badge">
                      <Icon name="lock" /> 必需
                    </span>
                    <IconButton
                      symbol="chevron"
                      label={'查看' + title + '详情'}
                      data-action={`builtin-${index}`}
                      onClick={() =>
                        notice(
                          '内置兼容补丁',
                          '由启动器维护的 Android 运行适配，随启动器更新。',
                          <div className="info-strip dialog-spaced">
                            内置必要适配仅展示状态、用途和版本，不提供会破坏启动的关闭按钮。
                          </div>,
                        )
                      }
                    />
                  </div>
                ))}
              </section>
              <p className="list-caption">
                <Icon name="lock" />
                随启动器更新 · 必需的运行适配
              </p>
            </>
          ),
        },
        {
          value: 'optional',
          label: '可选补丁',
          count: state.demo ? 1 : 0,
          id: 'patch-tab-optional',
          data: { 'data-patch-tab': 'optional' },
          content: (
            <section
              className="panel patch-list"
              id={state.patchTab === 'optional' ? 'patch-panel' : undefined}
            >
              {state.demo ? (
                <div className="patch-row">
                  <span className="patch-icon">
                    <Icon name="game" />
                  </span>
                  <div className="row-main">
                    <h3>
                      示例帧率显示 <Badge>示例补丁</Badge>
                    </h3>
                    <p>在游戏界面显示帧率 · 与示例版本兼容</p>
                  </div>
                  <Switch
                    checked={state.patchEnabled}
                    label="启用示例帧率显示补丁"
                    action="optional-patch"
                    onChange={(patchEnabled) => {
                      update((current) => ({ ...current, patchEnabled }));
                      record(
                        patchEnabled ? '已启用示例帧率显示补丁' : '已停用示例帧率显示补丁',
                        '配置',
                      );
                    }}
                  />
                  <IconButton
                    label="查看示例补丁详情"
                    symbol="chevron"
                    data-action="patch-details"
                    onClick={() =>
                      notice(
                        '示例帧率显示',
                        '可选补丁详情 · 示例数据',
                        <dl className="detail-list">
                          <dt>来源</dt>
                          <dd>本地导入的示例包</dd>
                          <dt>目标版本</dt>
                          <dd>示例 tML 稳定版本</dd>
                          <dt>依赖</dt>
                          <dd>内置运行兼容层</dd>
                          <dt>变更</dt>
                          <dd>增加游戏内帧率显示</dd>
                          <dt>卸载恢复</dt>
                          <dd>移除扩展文件并还原补丁配置</dd>
                        </dl>,
                      )
                    }
                  />
                </div>
              ) : (
                <EmptyState
                  symbol="patch"
                  title="还没有可选补丁"
                  description="需要额外适配时，使用右上角「导入补丁」添加兼容包。"
                />
              )}
            </section>
          ),
        },
      ]}
    />
  );
}
