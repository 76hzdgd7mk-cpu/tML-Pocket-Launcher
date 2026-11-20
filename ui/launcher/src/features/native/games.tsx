import { Badge, WorkspaceTabs } from '../../components/ui';
import { useGameActions } from '../game-actions';
import { NativeVersionManager } from './versions';
import { NativeAcquireAction } from './controls';

export function NativeGamesPage() {
  const { state, update, nativeState, versions, importInfo, accounts } = useGameActions();
  const tab = state.gameTab === 'accounts' ? 'sources' : state.gameTab;
  return (
    <div className="native-games-workspace">
      <WorkspaceTabs
        value={tab}
        onChange={(gameTab) => update((current) => ({ ...current, gameTab }))}
        label="游戏资源分类"
        items={[
          {
            value: 'installed',
            label: '已安装',
            content: (
              <div className="native-game-library">
                <section className="native-resource-status" aria-label="Terraria 资源状态">
                  <img src="/terraria.png" alt="" />
                  <div>
                    <h2>Terraria 资源</h2>
                    <p>
                      {nativeState?.terraria
                        ? `${nativeState.terraria} · ${nativeState.terrariaSource === 'gog' ? 'GOG · 离线可用' : 'Steam · 启动前验证所有权'}`
                        : '尚未导入，前往「添加游戏」准备原版资源。'}
                    </p>
                  </div>
                  <Badge tone={nativeState?.terraria ? 'green' : ''}>
                    {nativeState?.terraria ? '已校验' : '待准备'}
                  </Badge>
                </section>
                <section
                  className="panel native-version-panel"
                  aria-labelledby="installed-versions-title"
                >
                  <div className="panel-header">
                    <h2 id="installed-versions-title">tModLoader 版本</h2>
                  </div>
                  <NativeVersionManager compact />
                </section>
              </div>
            ),
          },
          {
            value: 'sources',
            label: '添加游戏',
            content: (
              <div className="native-game-sources">
                <section className="panel native-source-section" aria-label="添加 tModLoader">
                  <div className="native-section-heading">
                    <img src="/tmodloader.png" alt="" />
                    <div>
                      <h2>tModLoader</h2>
                      <p>各版本独立安装，模组与存档共用。</p>
                    </div>
                  </div>
                  <div className="native-acquire-options">
                    <NativeAcquireAction
                      title="下载版本"
                      description="浏览官方稳定版与预览版"
                      symbol="download"
                      action="versions"
                      onClick={versions}
                    />
                    <NativeAcquireAction
                      title="导入 ZIP"
                      description="安装本地预编译发行包"
                      symbol="folder"
                      onClick={() => importInfo('tml')}
                    />
                  </div>
                </section>
                <section className="panel native-source-section" aria-label="获取 Terraria 资源">
                  <div className="native-section-heading">
                    <img src="/terraria.png" alt="" />
                    <div>
                      <h2>Terraria 原版资源</h2>
                      <p>从已购游戏获取，或导入本地安装包。</p>
                    </div>
                  </div>
                  <div className="native-acquire-options">
                    <NativeAcquireAction
                      title="Steam"
                      label="Steam 登录与下载"
                      description="账户登录、所有权验证与下载"
                      symbol="user"
                      onClick={() => accounts('steam')}
                    />
                    <NativeAcquireAction
                      title="GOG"
                      label="GOG 登录与下载"
                      description="官方网页授权与已购资源下载"
                      symbol="user"
                      onClick={() => accounts('gog')}
                    />
                    <NativeAcquireAction
                      title="导入资源"
                      description="Steam ZIP 或 GOG Linux .sh"
                      symbol="folder"
                      onClick={() => importInfo('terraria')}
                    />
                  </div>
                </section>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
