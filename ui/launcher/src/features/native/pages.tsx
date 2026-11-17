import { Badge, Button, EmptyState, Icon, Switch, WorkspaceTabs } from '../../components/ui';
import { useGameActions } from '../game-actions';
import { useWorkspaceActions, tools } from '../home';
import { nativeRequest } from '../../native/bridge';
import { useLauncher } from '../../state/launcher';

export function NativeHomePage() {
  const {
    state,
    nativeState: status,
    navigate,
    versions,
    getTerraria,
    environment,
    customize,
    openTool,
    tasks,
  } = useWorkspaceActions();
  const setup = [
    {
      title: 'Terraria',
      detail: status?.terraria
        ? `${status.terraria} · ${status.terrariaSource === 'gog' ? 'GOG' : 'Steam'}`
        : '导入 Steam ZIP 或 GOG .sh',
      ready: !!status?.terraria,
      symbol: 'folder',
      action: getTerraria,
    },
    {
      title: 'tModLoader',
      detail: status?.tml || '下载官方版本，或导入发行 ZIP',
      ready: !!status?.tml,
      symbol: 'game',
      action: versions,
    },
    {
      title: '运行环境',
      detail: status?.runtime ? 'Android 运行时与兼容层已打包' : '正在检查运行时…',
      ready: !!status?.runtime,
      symbol: 'patch',
      action: environment,
    },
  ];
  return (
    <>
      <div className="home-workspace">
        <section className="panel game-overview setup-panel" aria-label="tModLoader 游戏状态">
          <div className="workspace-section">
            <h2>游戏准备</h2>
            <span>{setup.filter((item) => item.ready).length} / 3 已就绪</span>
          </div>
          {setup.map((item) => (
            <Button className="setup-row" key={item.title} onClick={item.action}>
              <span className="setup-icon">
                <Icon name={item.symbol} />
              </span>
              <span className="setup-copy">
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <span className={`setup-state ${item.ready ? 'complete' : ''}`}>
                <Icon name={item.ready ? 'check' : 'chevron'} />
              </span>
            </Button>
          ))}
        </section>
        <section className="home-tools">
          <div className="workspace-section tools-heading">
            <h2>常用工具</h2>
            <Button className="quiet-action" onClick={customize}>
              自定义 <Icon name="sliders" />
            </Button>
          </div>
          <div className="workspace-tools">
            {state.preferences.quickTools.map((id) => {
              const tool = tools.find((item) => item.id === id)!;
              return (
                <Button key={id} onClick={() => openTool(id)}>
                  <Icon name={tool.symbol} />
                  <span>
                    <strong>{tool.title}</strong>
                    <small>{tool.detail}</small>
                  </span>
                  <Icon name="chevron" />
                </Button>
              );
            })}
          </div>
        </section>
      </div>
      <section className="panel workspace-overview">
        <div className="workspace-section">
          <div>
            <h2>配置概览</h2>
            <p>{status?.tml || '尚未安装游戏版本'}</p>
          </div>
          <Button className="quiet-action" onClick={() => navigate('games')}>
            管理 <Icon name="chevron" />
          </Button>
        </div>
        <div className="overview-stats">
          <Button onClick={() => navigate('mods')}>
            <strong>
              {status?.mods.filter((mod) => mod.enabled).length || 0}
              <small> / {status?.mods.length || 0}</small>
            </strong>
            <span>启用模组</span>
          </Button>
          <Button onClick={() => navigate('patches')}>
            <strong>{status?.patches.filter((patch) => patch.enabled).length || 0}</strong>
            <span>可选补丁</span>
          </Button>
          <Button onClick={tasks}>
            <strong>{status?.busy ? 1 : 0}</strong>
            <span>当前任务</span>
          </Button>
        </div>
      </section>
      {status?.error && (
        <div className="info-strip">
          <Icon name="info" />
          <span>{status.error}</span>
          <Button onClick={tasks}>查看任务</Button>
        </div>
      )}
    </>
  );
}

export function NativeGamesPage() {
  const { state, update, nativeState, versions, instances, importInfo, accounts } =
    useGameActions();
  const resources = (
    <section className="panel">
      <div className="panel-header">
        <h2>游戏资源</h2>
        <Badge tone={nativeState?.ready ? 'green' : ''}>
          {nativeState?.ready ? '已就绪' : '等待准备'}
        </Badge>
      </div>
      {(['terraria', 'tml'] as const).map((kind) => (
        <div className="resource-row" key={kind}>
          <span className="resource-icon">
            <Icon name={kind === 'tml' ? 'mod' : 'game'} />
          </span>
          <div className="resource-copy">
            <h3>{kind === 'tml' ? 'tModLoader' : 'Terraria'}</h3>
            <p>{nativeState?.[kind] || '尚未安装'}</p>
            {kind === 'terraria' && nativeState?.terraria && (
              <p>
                {nativeState.terrariaSource === 'gog'
                  ? 'GOG · 无需登录验证'
                  : 'Steam · 启动前在线验证游戏所有权'}
              </p>
            )}
            <Badge tone={nativeState?.[kind] ? 'green' : ''}>
              {nativeState?.[kind] ? '已校验' : '等待导入'}
            </Badge>
          </div>
          <div className="resource-actions">
            {kind === 'tml' && <Button onClick={versions}>下载版本</Button>}
            <Button onClick={() => importInfo(kind)}>
              {kind === 'terraria' ? '导入资源' : '导入 ZIP'}
            </Button>
          </div>
        </div>
      ))}
      <div className="panel-note">使用预编译发行包；模组与存档单独保存。</div>
    </section>
  );
  const stores = (
    <section className="panel">
      {(['steam', 'gog'] as const).map((store) => (
        <div className="account-row" key={store}>
          <span className={`brand-word ${store}`}>{store === 'steam' ? 'STEAM' : 'gog.com'}</span>
          <div className="account-copy">
            <strong>官方游戏库</strong>
            <small>
              {store === 'steam'
                ? 'SteamKit 登录 · Steam Guard · 已购资源下载'
                : '官方网页授权 · 已购 Linux 资源下载'}
            </small>
          </div>
          <Button onClick={() => accounts(store)}>
            登录与下载 <Icon name="chevron" />
          </Button>
        </div>
      ))}
    </section>
  );
  return (
    <WorkspaceTabs
      value={state.gameTab}
      onChange={(gameTab) => update((current) => ({ ...current, gameTab }))}
      label="游戏资源分类"
      items={[
        {
          value: 'installed',
          label: '已安装',
          content: (
            <>
              {resources}
              <div className="section-title">
                <h2>当前版本</h2>
                <Button onClick={instances}>管理版本</Button>
              </div>
            </>
          ),
        },
        {
          value: 'sources',
          label: '获取资源',
          content: (
            <>
              {resources}
              <div className="section-title">
                <h2>正版资源来源</h2>
              </div>
              {stores}
            </>
          ),
        },
        { value: 'accounts', label: '账户', content: stores },
      ]}
    />
  );
}

export function NativePatchesPage() {
  const { state, update, nativeState, notify, openDialog, closeDialog } = useLauncher();
  const run = (method: string, params: object) =>
    void nativeRequest(method, params).catch((error: Error) => notify(error.message));
  const patches = nativeState?.patches || [];
  const required = patches.filter((patch) => patch.required);
  const optional = patches.filter((patch) => !patch.required);
  const list = (items: typeof patches) => (
    <section className="panel patch-list">
      {items.map((patch) => (
        <div className="patch-row" key={patch.id}>
          <span className="patch-icon">
            <Icon name="patch" />
          </span>
          <div className="row-main">
            <h3>
              {patch.name} {patch.version && <Badge>{patch.version}</Badge>}
            </h3>
            <p>{patch.description || `目标版本：${patch.targetVersion || '全部'}`}</p>
            {patch.targetVersion && <p>适配 tML {patch.targetVersion}</p>}
          </div>
          {patch.required ? (
            <span className="lock-badge">
              <Icon name="lock" /> 必需
            </span>
          ) : (
            <Switch
              label={`启用${patch.name}`}
              checked={patch.enabled}
              disabled={nativeState?.busy}
              onChange={(enabled) => run('patches.toggle', { id: patch.id, enabled })}
            />
          )}
          {!patch.builtin && (
            <Button
              onClick={() =>
                openDialog({
                  title: `移除 ${patch.name}`,
                  description: '删除此补丁的启动参数清单；游戏文件与存档保留。',
                  actions: (
                    <>
                      <Button onClick={() => closeDialog()}>取消</Button>
                      <Button
                        onClick={() => {
                          closeDialog();
                          run('patches.delete', { id: patch.id });
                        }}
                      >
                        移除
                      </Button>
                    </>
                  ),
                })
              }
            >
              移除
            </Button>
          )}
        </div>
      ))}
      {!items.length && (
        <EmptyState symbol="patch" title="正在读取补丁" description="内置适配随启动器更新。" />
      )}
    </section>
  );
  return (
    <WorkspaceTabs
      value={state.patchTab}
      onChange={(patchTab) => update((current) => ({ ...current, patchTab }))}
      label="补丁分类"
      items={[
        {
          value: 'builtin',
          label: '必要适配',
          count: required.length,
          content: (
            <>
              {list(required)}
              <p className="list-caption">触摸、显示与平台兼容 · 随启动器维护</p>
            </>
          ),
        },
        {
          value: 'optional',
          label: '可选补丁',
          count: optional.length,
          content: (
            <>
              {list(optional)}
              <p className="list-caption">更改在下次启动生效 · 联机托管仅支持已适配的版本</p>
            </>
          ),
        },
      ]}
    />
  );
}
