import { Badge, Button, ContextNote, Icon, WorkspaceTabs } from '../components/ui';
import { useGameActions } from './game-actions';
import { profileTitle } from '../state/launcher';

export function AccountRows({ detailed = false }: { detailed?: boolean }) {
  const { accounts } = useGameActions();
  return (
    <>
      {(['steam', 'gog'] as const).map((platform) => (
        <div className="account-row" key={platform}>
          <span className={`brand-word ${platform}`}>
            {platform === 'steam' ? 'STEAM' : 'gog.com'}
          </span>
          <div className="account-copy">
            <strong>
              尚未连接
              {detailed ? ` ${platform === 'steam' ? 'Steam' : 'GOG'} 账户` : ''}
            </strong>
            <small>
              {detailed ? '登录后验证已购 Terraria，并选择资源下载版本' : '验证购买后下载资源'}
            </small>
          </div>
          <Button data-action={`account-${platform}`} onClick={() => accounts(platform)}>
            连接账户 <Icon name="chevron" />
          </Button>
        </div>
      ))}
    </>
  );
}
function Sources() {
  const { accounts, importInfo, versions } = useGameActions();
  return (
    <>
      <div className="source-options">
        {(
          [
            {
              id: 'steam',
              title: '从 Steam 获取',
              detail: '登录、验证游戏所有权，下载 Terraria 资源。',
            },
            {
              id: 'gog',
              title: '从 GOG 获取',
              detail: '授权后选择已购游戏，下载并提取安装资源。',
            },
            {
              id: 'local',
              title: '导入本地资源',
              detail: '选择 Terraria 资源 ZIP，自动识别并校验。',
            },
          ] as const
        ).map((source) => (
          <Button
            key={source.id}
            className="source-card"
            data-action={source.id === 'local' ? 'import-terraria' : `account-${source.id}`}
            onClick={() => (source.id === 'local' ? importInfo('terraria') : accounts(source.id))}
          >
            {source.id === 'local' ? (
              <Icon name="folder" />
            ) : (
              <span className={`brand-word ${source.id}`}>
                {source.id === 'steam' ? 'STEAM' : 'gog.com'}
              </span>
            )}
            <h2>{source.title}</h2>
            <p>{source.detail}</p>
            <small>
              {source.id === 'local' ? '选择文件' : '连接账户'} <Icon name="arrow" />
            </small>
          </Button>
        ))}
      </div>
      <div className="section-title">
        <h2>tModLoader 发行包</h2>
      </div>
      <section className="panel">
        <div className="resource-row">
          <span className="resource-icon">
            <img src="/tmodloader.png" alt="" />
          </span>
          <div className="resource-copy">
            <h3>官方版本与本地导入</h3>
            <p>浏览稳定版与预览版，或导入已下载的发行 ZIP。</p>
          </div>
          <div className="resource-actions">
            <Button variant="soft" data-action="versions" onClick={versions}>
              选择版本
            </Button>
            <Button onClick={() => importInfo('tml')}>导入 ZIP</Button>
          </div>
        </div>
      </section>
    </>
  );
}
function Installed() {
  const { state, getTerraria, instances, versions, importInfo } = useGameActions();
  return (
    <>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <h2>游戏资源</h2>
            <Badge tone={state.demo ? 'green' : ''}>{state.demo ? '已就绪' : '等待准备'}</Badge>
          </div>
          {['terraria', 'tml'].map((kind) => (
            <div className="resource-row" key={kind}>
              <span className="resource-icon">
                {kind === 'tml' ? <img src="/tmodloader.png" alt="" /> : <Icon name="game" />}
              </span>
              <div className="resource-copy">
                <h3>{kind === 'tml' ? 'tModLoader' : 'Terraria'}</h3>
                <p>
                  {state.demo
                    ? kind === 'tml'
                      ? profileTitle(state.profile) + ' · GitHub Releases'
                      : '示例资源包 · 本地导入'
                    : kind === 'tml'
                      ? '选择适合模组的官方版本'
                      : '运行游戏所需的原版资源'}
                </p>
                <Badge tone={state.demo ? 'green' : ''}>
                  {state.demo ? (kind === 'tml' ? '已安装' : '已校验') : '尚未安装'}
                </Badge>
              </div>
              <div className="resource-actions">
                {kind === 'tml' ? (
                  <>
                    <Button variant="soft" data-action="instances" onClick={instances}>
                      选择版本
                    </Button>
                    <Button data-action="versions" onClick={versions}>
                      下载版本
                    </Button>
                    <Button onClick={() => importInfo('tml')}>导入</Button>
                  </>
                ) : (
                  <Button variant="soft" data-action="get-terraria" onClick={getTerraria}>
                    {state.demo ? '管理资源' : '获取资源'}
                  </Button>
                )}
              </div>
            </div>
          ))}
          <div className="panel-note">
            <Icon name="info" />
            安装完成后验证资源完整性，失败时保留上一个可用版本。
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>关联账户</h2>
          </div>
          <AccountRows />
          <div className="panel-note">本地导入无需登录账户。</div>
        </section>
      </div>
      <ContextNote>游戏版本与资源统一管理；下载任务可在任意页面打开。</ContextNote>
    </>
  );
}
export function GamesPage() {
  const { state, update } = useGameActions();
  return (
    <WorkspaceTabs
      value={state.gameTab}
      onChange={(gameTab) => update((current) => ({ ...current, gameTab }))}
      label="游戏资源分类"
      items={[
        {
          value: 'installed',
          label: '已安装',
          data: { 'data-game-tab': 'installed' },
          content: <Installed />,
        },
        {
          value: 'sources',
          label: '获取资源',
          data: { 'data-game-tab': 'sources' },
          content: <Sources />,
        },
        {
          value: 'accounts',
          label: '账户',
          data: { 'data-game-tab': 'accounts' },
          content: (
            <>
              <div className="panel account-detail">
                <AccountRows detailed />
                <div className="panel-note">
                  <Icon name="lock" />
                  登录、验证与下载分别展示状态；退出账户时可选择清除已保存的会话。
                </div>
              </div>
              <ContextNote>Steam 支持验证与 Steam Guard 流程；GOG 使用网页授权流程。</ContextNote>
            </>
          ),
        },
      ]}
    />
  );
}
