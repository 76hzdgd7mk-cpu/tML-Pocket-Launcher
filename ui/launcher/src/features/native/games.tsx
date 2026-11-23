import { useEffect, useState } from 'react';
import { Badge, Button, WorkspaceTabs } from '../../components/ui';
import { nativeRequest } from '../../native/bridge';
import { useLauncher } from '../../state/launcher';
import { useGameActions } from '../game-actions';
import { NativeVersionManager } from './versions';
import { NativeAcquireAction } from './controls';

export function NativeGamesPage() {
  const { state, update, nativeState, versions, importInfo, accounts } = useGameActions();
  const { openDialog, notify } = useLauncher();
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
                        ? `${nativeState.terraria} · ${
                            nativeState.terrariaSource === 'android'
                              ? 'Android 版 · 离线可用'
                              : nativeState.terrariaSource === 'gog'
                                ? 'GOG · 离线可用'
                                : 'Steam · 启动前验证所有权'
                          }`
                        : '尚未导入，前往「添加游戏」准备原版资源。'}
                    </p>
                  </div>
                  <Badge tone={nativeState?.terraria ? 'green' : ''}>
                    {nativeState?.terraria ? '已校验' : '待准备'}
                  </Badge>
                  {nativeState?.desktopTerrariaSource &&
                    nativeState.desktopTerrariaSource !== nativeState.terrariaSource && (
                      <Button
                        disabled={nativeState.busy}
                        onClick={() =>
                          void nativeRequest('terraria.desktop.select').catch((error: Error) =>
                            notify(error.message),
                          )
                        }
                      >
                        切换到 {nativeState.desktopTerrariaSource === 'gog' ? 'GOG' : 'Steam'}
                      </Button>
                    )}
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
                    <NativeAcquireAction
                      title="Terraria PE"
                      label="检测 Terraria PE"
                      description="从本机安装包转换游戏资源"
                      symbol="game"
                      onClick={() =>
                        openDialog({
                          title: 'Terraria PE',
                          description: '本机 Terraria 资源',
                          body: <MobileTerrariaInspection />,
                        })
                      }
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

type MobileTerrariaResult =
  | { status: 'not-installed' }
  | {
      status: 'unity' | 'unsupported';
      version: string;
      apkCount: number;
      targetTml: string | null;
    };

function MobileTerrariaInspection() {
  const { nativeState, closeDialog, navigate, notify } = useLauncher();
  const [result, setResult] = useState<MobileTerrariaResult>();
  const [error, setError] = useState('');
  const [conversionError, setConversionError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const converting = nativeState?.busy && nativeState.operation === 'terraria.mobile.convert';
  useEffect(() => {
    let active = true;
    void nativeRequest<MobileTerrariaResult>('terraria.mobile.inspect').then(
      (value) => {
        if (active) setResult(value);
      },
      (failure: Error) => {
        if (active) setError(failure.message);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  if (error) return <p role="alert">安装包检查失败。{error}</p>;
  if (!result) return <p role="status">正在检查本机安装包…</p>;
  if (result.status === 'not-installed')
    return <p role="status">本机未检测到 505 Games 发行的 Terraria PE。</p>;
  return (
    <div className="native-stack">
      <p>
        已检测到 Terraria {result.version || '未知版本'}，共 {result.apkCount} 个 APK。
      </p>
      {result.status === 'unsupported' ? (
        <p>安装包缺少受支持的 Unity 资源容器。</p>
      ) : !result.targetTml ? (
        <p>此 APK 未包含 Terraria PE 转换配置。</p>
      ) : nativeState?.tml !== result.targetTml ? (
        <p>请先安装并选择 tModLoader {result.targetTml}。</p>
      ) : converting ? (
        <>
          <p role="status">{nativeState.message}</p>
          <progress
            aria-label="资源转换进度"
            max={100}
            value={nativeState.progress >= 0 ? nativeState.progress : undefined}
          />
          <Button
            disabled={cancelling}
            onClick={() => {
              setCancelling(true);
              void nativeRequest('cancel').catch((failure: Error) => {
                setCancelling(false);
                setConversionError(failure.message);
              });
            }}
          >
            取消
          </Button>
        </>
      ) : (
        <Button
          variant="primary"
          disabled={nativeState.busy}
          onClick={() => {
            setCancelling(false);
            setConversionError('');
            void nativeRequest('terraria.mobile.convert').then(
              () => {
                closeDialog(false);
                navigate('home');
                notify('Terraria PE 资源已就绪。');
              },
              (failure: Error) => setConversionError(failure.message),
            );
          }}
        >
          转换资源
        </Button>
      )}
      {conversionError && <p role="alert">{conversionError}</p>}
    </div>
  );
}
