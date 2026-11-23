import { useEffect, useState } from 'react';
import { Badge, Button, WorkspaceTabs } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { nativeRequest } from '../../native/bridge';
import { useLauncher } from '../../state/launcher';
import { useGameActions } from '../game-actions';
import { NativeVersionManager } from './versions';
import { NativeAcquireAction } from './controls';

export function NativeGamesPage() {
  const { t } = useTranslation();
  const { state, update, nativeState, versions, importInfo, accounts } = useGameActions();
  const { openDialog, notify } = useLauncher();
  const tab = state.gameTab === 'accounts' ? 'sources' : state.gameTab;
  return (
    <div className="native-games-workspace">
      <WorkspaceTabs
        value={tab}
        onChange={(gameTab) => update((current) => ({ ...current, gameTab }))}
        label={t('游戏资源分类')}
        items={[
          {
            value: 'installed',
            label: t('已安装'),
            content: (
              <div className="native-game-library">
                <section className="native-resource-status" aria-label={t('Terraria 资源状态')}>
                  <img src="/terraria.png" alt="" />
                  <div>
                    <h2>{t('Terraria 资源')}</h2>
                    <p>
                      {nativeState?.terraria
                        ? `${nativeState.terraria} · ${
                            nativeState.terrariaSource === 'android'
                              ? t('Android 版 · 离线可用')
                              : nativeState.terrariaSource === 'gog'
                                ? t('GOG · 离线可用')
                                : t('Steam · 启动前验证所有权')
                          }`
                        : t('尚未导入，前往「添加游戏」准备原版资源。')}
                    </p>
                  </div>
                  <Badge tone={nativeState?.terraria ? 'green' : ''}>
                    {t(nativeState?.terraria ? '已校验' : '待准备')}
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
                        {t('切换到 {source}', {
                          source: nativeState.desktopTerrariaSource === 'gog' ? 'GOG' : 'Steam',
                        })}
                      </Button>
                    )}
                </section>
                <section
                  className="panel native-version-panel"
                  aria-labelledby="installed-versions-title"
                >
                  <div className="panel-header">
                    <h2 id="installed-versions-title">{t('tModLoader 版本')}</h2>
                  </div>
                  <NativeVersionManager compact />
                </section>
              </div>
            ),
          },
          {
            value: 'sources',
            label: t('添加游戏'),
            content: (
              <div className="native-game-sources">
                <section className="panel native-source-section" aria-label={t('添加 tModLoader')}>
                  <div className="native-section-heading">
                    <img src="/tmodloader.png" alt="" />
                    <div>
                      <h2>tModLoader</h2>
                      <p>{t('各版本独立安装，模组与存档共用。')}</p>
                    </div>
                  </div>
                  <div className="native-acquire-options">
                    <NativeAcquireAction
                      title={t('下载版本')}
                      description={t('浏览官方稳定版与预览版')}
                      symbol="download"
                      action="versions"
                      onClick={versions}
                    />
                    <NativeAcquireAction
                      title={t('导入 ZIP')}
                      description={t('安装本地预编译发行包')}
                      symbol="folder"
                      onClick={() => importInfo('tml')}
                    />
                  </div>
                </section>
                <section
                  className="panel native-source-section"
                  aria-label={t('获取 Terraria 资源')}
                >
                  <div className="native-section-heading">
                    <img src="/terraria.png" alt="" />
                    <div>
                      <h2>{t('Terraria 原版资源')}</h2>
                      <p>{t('从已购游戏获取，或导入本地安装包。')}</p>
                    </div>
                  </div>
                  <div className="native-acquire-options">
                    <NativeAcquireAction
                      title="Steam"
                      label={t('Steam 登录与下载')}
                      description={t('账户登录、所有权验证与下载')}
                      symbol="user"
                      onClick={() => accounts('steam')}
                    />
                    <NativeAcquireAction
                      title="GOG"
                      label={t('GOG 登录与下载')}
                      description={t('官方网页授权与已购资源下载')}
                      symbol="user"
                      onClick={() => accounts('gog')}
                    />
                    <NativeAcquireAction
                      title={t('导入资源')}
                      description={t('Steam ZIP 或 GOG Linux .sh')}
                      symbol="folder"
                      onClick={() => importInfo('terraria')}
                    />
                    <NativeAcquireAction
                      title="Terraria PE"
                      label={t('检测 Terraria PE')}
                      description={t('从本机安装包转换游戏资源')}
                      symbol="game"
                      onClick={() =>
                        openDialog({
                          title: 'Terraria PE',
                          description: t('本机 Terraria 资源'),
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
  const { t, locale } = useTranslation();
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
  if (error) return <p role="alert">{t('安装包检查失败。{error}', { error })}</p>;
  if (!result) return <p role="status">{t('正在检查本机安装包…')}</p>;
  if (result.status === 'not-installed')
    return <p role="status">{t('本机未检测到 505 Games 发行的 Terraria PE。')}</p>;

  const conversionMessage = nativeState?.message ?? '';
  const conversionStep = /^正在转换(贴图、字体和音效|音乐)（(\d+)\/(\d+)）…$/.exec(
    conversionMessage,
  );
  const conversionStatus = conversionStep
    ? t(
        conversionStep[1] === '音乐'
          ? '正在转换音乐（{current}/{total}）…'
          : '正在转换贴图、字体和音效（{current}/{total}）…',
        {
          current: Number(conversionStep[2]).toLocaleString(locale),
          total: Number(conversionStep[3]).toLocaleString(locale),
        },
      )
    : t(conversionMessage);

  return (
    <div className="native-stack">
      <p>
        {t('已检测到 Terraria {version}，共 {count} 个 APK。', {
          version: result.version || t('未知版本'),
          count: result.apkCount.toLocaleString(locale),
        })}
      </p>
      {result.status === 'unsupported' ? (
        <p>{t('安装包缺少受支持的 Unity 资源容器。')}</p>
      ) : !result.targetTml ? (
        <p>{t('此 APK 未包含 Terraria PE 转换配置。')}</p>
      ) : nativeState?.tml !== result.targetTml ? (
        <p>{t('请先安装并选择 tModLoader {version}。', { version: result.targetTml })}</p>
      ) : converting ? (
        <>
          <p role="status">{conversionStatus}</p>
          <progress
            aria-label={t('资源转换进度')}
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
            {t('取消')}
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
                notify(t('Terraria PE 资源已就绪。'));
              },
              (failure: Error) => setConversionError(failure.message),
            );
          }}
        >
          {t('转换资源')}
        </Button>
      )}
      {conversionError && <p role="alert">{conversionError}</p>}
    </div>
  );
}
