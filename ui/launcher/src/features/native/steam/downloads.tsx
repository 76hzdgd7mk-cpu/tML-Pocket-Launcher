import { Button, Icon, TaskProgress } from '../../../components/ui';
import { nativeRequest } from '../../../native/bridge';
import { useLauncher } from '../../../state/launcher';
import { useSteam } from './state';

export function NativeDownloadsPage() {
  const { nativeState, notify, navigate, update, openWorkspace } = useLauncher();
  const { account, download, startDownload, cancelDownload, details } = useSteam();
  const generic = nativeState?.busy && nativeState.operation !== 'store.steam.download';
  const steam = !generic && (download || nativeState?.operation === 'store.steam.download');
  const running = steam
    ? download?.status === 'running' || (!download && nativeState?.busy)
    : nativeState?.busy;
  const completed =
    steam &&
    (download?.status === 'completed' ||
      (!download && !nativeState?.busy && !nativeState?.error && nativeState?.progress === 100));
  const cancelled = steam && download?.status === 'cancelled';
  const failure = steam
    ? download?.status === 'failed'
      ? download.error
      : !download
        ? nativeState?.error
        : ''
    : nativeState?.error;
  const empty = !steam && !running && !nativeState?.error;
  const progress = completed
    ? 100
    : running && nativeState?.operation === 'store.steam.download'
      ? Math.max(-1, nativeState.progress)
      : running && !steam
        ? (nativeState?.progress ?? -1)
        : -1;
  const message = completed
    ? '资源已安装，随时可以继续准备游戏。'
    : cancelled
      ? '临时下载已取消，已安装的资源和存档保留。'
      : failure || (running ? nativeState?.message || '正在准备下载…' : '尚无正在进行的下载。');
  const installing =
    running && /^(?!.*准备安装).*(安装|解压|Extract|Install)/i.test(nativeState?.message || '');
  const verifying =
    running && /校验完成|准备安装|校验资源|正在校验|正在打包/.test(nativeState?.message || '');
  const stage = completed ? 3 : installing ? 2 : verifying ? 1 : 0;
  const run = (method: string) =>
    void nativeRequest(method).catch((error: Error) => notify(error.message));
  const installed = () => {
    update((current) => ({ ...current, gameTab: 'installed' }));
    navigate('games');
  };
  return (
    <section className="download-page" aria-labelledby="download-title">
      <div className="download-page-heading">
        <div>
          <span className="download-eyebrow">下载与安装</span>
          <h2 id="download-title">
            {completed
              ? '一切准备就绪'
              : cancelled
                ? '下载已取消'
                : failure
                  ? '下载需要处理'
                  : running
                    ? '正在为冒险做准备'
                    : '所有下载都在这里'}
          </h2>
        </div>
        <span className={`download-state ${completed ? 'is-complete' : ''}`}>
          <span />
          {completed
            ? '已完成'
            : cancelled
              ? '已取消'
              : failure
                ? '未完成'
                : running
                  ? '进行中'
                  : '空闲'}
        </span>
      </div>
      {empty ? (
        <div className="download-empty">
          <Icon name="download" />
          <h3>还没有下载任务</h3>
          <p>从 Steam 资源库选择 Terraria，下载后会自动校验并安装。</p>
          <Button
            variant="primary"
            onClick={() =>
              openWorkspace(account?.phase === 'ready' ? 'steam-library' : 'steam-login')
            }
          >
            前往 Steam 资源库
            <Icon name="arrow" />
          </Button>
        </div>
      ) : (
        <>
          <article className={`download-card ${completed ? 'is-complete' : ''}`}>
            <div className="download-game-line">
              <span className="download-game-icon">
                <Icon name={completed ? 'check' : 'game'} />
              </span>
              <div>
                <span className="download-eyebrow">
                  {steam ? 'STEAM · 游戏资源' : '启动器任务'}
                </span>
                <h3>
                  {steam
                    ? details?.name || 'Terraria'
                    : nativeState?.operation === 'download'
                      ? 'tModLoader'
                      : '资源处理'}
                </h3>
                <p>{steam ? 'Linux · public · Content' : '下载、校验与安装'}</p>
              </div>
              <strong className="download-percent">
                {progress >= 0 ? `${progress}%` : running ? '准备中' : completed ? '100%' : '—'}
              </strong>
            </div>
            <TaskProgress value={progress >= 0 ? progress : running ? null : 0} />
            <p
              className={failure ? 'download-error' : 'download-message'}
              role={failure ? 'alert' : 'status'}
            >
              {message}
            </p>
            {steam && (
              <ol className="download-stages" aria-label="资源安装阶段">
                {['下载资源', '校验文件', completed ? '安装完成' : '安装资源'].map(
                  (label, index) => (
                    <li
                      className={
                        completed || index < stage
                          ? 'done'
                          : index === stage && running
                            ? 'current'
                            : ''
                      }
                      key={label}
                      aria-current={index === stage && running ? 'step' : undefined}
                    >
                      <span>{completed || index < stage ? <Icon name="check" /> : index + 1}</span>
                      {label}
                    </li>
                  ),
                )}
              </ol>
            )}
            <div className="download-card-actions">
              {running && (
                <Button
                  disabled={Boolean(download?.cancelling)}
                  onClick={steam && download ? cancelDownload : () => run('cancel')}
                >
                  {download?.cancelling ? '正在取消…' : '取消任务'}
                </Button>
              )}
              {completed && (
                <Button variant="primary" onClick={installed}>
                  查看已安装资源
                  <Icon name="arrow" />
                </Button>
              )}
              {(failure || cancelled) && steam && (
                <Button
                  variant="primary"
                  disabled={nativeState?.busy || account?.phase !== 'ready' || !account.owned}
                  onClick={startDownload}
                >
                  重新下载
                </Button>
              )}
              {(failure || cancelled) && steam && account?.phase !== 'ready' && (
                <Button onClick={() => openWorkspace('steam-login')}>恢复 Steam 连接</Button>
              )}
              {!running && !steam && nativeState?.retry && (
                <Button onClick={() => run('retry')}>重试</Button>
              )}
              {steam && <Button onClick={() => openWorkspace('steam-library')}>返回资源库</Button>}
            </div>
          </article>
          <div className="download-footer-notes">
            <div>
              <Icon name="folder" />
              <p>
                <strong>自动安装</strong>
                <span>下载完成后继续校验和安装，无需手动导入。</span>
              </p>
            </div>
            <div>
              <Icon name="lock" />
              <p>
                <strong>保留你的冒险</strong>
                <span>模组、配置与存档单独保存。</span>
              </p>
            </div>
          </div>
          <p className="download-footnote">
            {running ? '可以切换页面，任务会继续。' : '显示当前会话的最近一次任务。'}
            {steam && '仅下载游戏资源；tModLoader 版本在游戏页管理。'}
          </p>
        </>
      )}
    </section>
  );
}
