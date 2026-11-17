import { useEffect, useState } from 'react';
import { Badge, Button, Icon } from '../../../components/ui';
import { nativeRequest } from '../../../native/bridge';
import { useLauncher } from '../../../state/launcher';
import { SteamBrand } from './brand';
import { useSteam } from './state';

export function SteamLibraryPage() {
  const { nativeState, openWorkspace } = useLauncher();
  const {
    account,
    connectionError,
    refresh,
    download,
    startDownload,
    details,
    detailsLoading,
    detailsError,
    loadDetails,
  } = useSteam();
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [details?.headerImage]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const ready = account?.phase === 'ready';
  const logout = async () => {
    setPending(true);
    try {
      await nativeRequest('store.steam.logout');
      await refresh();
      openWorkspace('steam-login');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="steam-page steam-library-page" aria-labelledby="steam-library-title">
      <div className="steam-library-top">
        <SteamBrand />
        <div className="steam-account-chip">
          <Icon name="user" />
          <span>
            {account?.account || 'Steam 账户'}
            <small>{ready ? '已连接' : '连接中断'}</small>
          </span>
          <Button
            className="steam-text-button"
            disabled={pending || nativeState?.busy}
            onClick={() => void logout()}
          >
            退出登录
          </Button>
        </div>
      </div>
      {(error || connectionError) && (
        <p className="steam-error" role="alert">
          {error || connectionError}
        </p>
      )}
      {!ready && (
        <div className="steam-offline">
          <p role="status">{account?.message || '正在读取账户状态…'}</p>
          <Button onClick={() => openWorkspace('steam-login')}>管理 Steam 连接</Button>
        </div>
      )}
      <div className="steam-game-card">
        <div
          className={`steam-game-art ${details?.headerImage && !imageFailed ? 'has-artwork' : ''}`}
        >
          {details?.headerImage && !imageFailed ? (
            <img
              src={details.headerImage}
              alt={`${details.name} · Steam 官方封面`}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <>
              <Icon name="game" />
              <span>{details?.name || 'Terraria'}</span>
              <small>{detailsLoading ? '正在获取 Steam 封面…' : 'Steam 游戏资源'}</small>
            </>
          )}
        </div>
        <div className="steam-game-details">
          <div className="steam-game-label">
            <span className="steam-eyebrow">你的游戏库</span>
            {ready && (
              <Badge tone={account?.owned ? 'green' : ''}>
                {account?.owned ? '拥有 Terraria' : '未拥有游戏'}
              </Badge>
            )}
          </div>
          <h2 id="steam-library-title">{details?.name || 'Terraria'}</h2>
          <p>
            {details?.description ||
              (detailsLoading
                ? '正在从 Steam 获取游戏简介…'
                : '从 Steam 下载已购 Terraria 的游戏资源。')}
          </p>
          {details && (
            <>
              {details.genres.length > 0 && (
                <div className="steam-game-genres" aria-label="Steam 游戏类型">
                  {details.genres.map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>
              )}
              <dl className="steam-store-facts">
                {details.developers.length > 0 && (
                  <div>
                    <dt>开发商</dt>
                    <dd>{details.developers.join('、')}</dd>
                  </div>
                )}
                {details.publishers.length > 0 && (
                  <div>
                    <dt>发行商</dt>
                    <dd>{details.publishers.join('、')}</dd>
                  </div>
                )}
                {details.releaseDate && (
                  <div>
                    <dt>发行日期</dt>
                    <dd>{details.releaseDate}</dd>
                  </div>
                )}
              </dl>
            </>
          )}
          <dl className="steam-facts">
            <div>
              <dt>分支</dt>
              <dd>Linux · public</dd>
            </div>
            <div>
              <dt>内容</dt>
              <dd>游戏资源 Content</dd>
            </div>
            <div>
              <dt>安装</dt>
              <dd>下载后自动校验</dd>
            </div>
          </dl>
          {download?.status === 'running' ? (
            <Button className="steam-primary" onClick={() => openWorkspace('downloads')}>
              <Icon name="download" />
              查看下载进度
            </Button>
          ) : (
            <Button
              className="steam-primary"
              disabled={!ready || !account?.owned || nativeState?.busy}
              onClick={startDownload}
            >
              <Icon name="download" />
              下载 Terraria 资源
            </Button>
          )}
          <small className="steam-install-note">
            {nativeState?.terraria
              ? '本机已有资源，重新下载将更新资源文件。'
              : '下载完成后会自动安装到启动器。'}
            模组与存档保留。
          </small>
        </div>
      </div>
      <div className="steam-details-source">
        <span role="status">
          {detailsLoading
            ? '正在读取 Steam 商店资料…'
            : detailsError ||
              (details?.stale
                ? 'Steam 暂时不可用，显示已缓存的详情。'
                : details
                  ? '游戏详情来自 Steam 商店'
                  : '尚未读取游戏详情')}
        </span>
        <Button
          className="steam-text-button"
          disabled={detailsLoading}
          onClick={() => void loadDetails(true)}
        >
          刷新详情
        </Button>
      </div>
      <div className="steam-library-bottom">
        <span>
          <Icon name="folder" />
          {nativeState?.terraria ? '本机已安装 Terraria 资源' : '本机尚未安装 Terraria 资源'}
        </span>
        <Button className="steam-text-button" onClick={() => openWorkspace('downloads')}>
          查看下载
          <Icon name="arrow" />
        </Button>
      </div>
    </section>
  );
}
