import { Button, Icon, TaskProgress } from '../../../components/ui';
import { useLauncher } from '../../../state/launcher';
import { useSteam } from './state';
import { type DownloadTask, useDownloads } from '../download-state';
import { ModDependencies } from '../mod-dependencies';

const STATUS_LABELS = {
  running: '下载进行中',
  completed: '安装完成',
  failed: '下载未完成',
  cancelled: '下载已取消',
} satisfies Record<DownloadTask['status'], string>;

function DownloadCard({ task, compact }: { task: DownloadTask; compact: boolean }) {
  const { nativeState, navigate, update, openWorkspace, closeDialog } = useLauncher();
  const { account } = useSteam();
  const downloads = useDownloads();
  const running = task.status === 'running';
  const completed = task.status === 'completed';
  const failed = task.status === 'failed';
  const canRetry = failed || task.status === 'cancelled';
  const steam = task.method === 'store.steam.download';
  const workshop = task.method === 'workshop.download';
  const terrariaWorkshop = workshop && (task.params as { appId?: number } | undefined)?.appId === 105600;
  const installedMod = completed && task.installedModId
    ? nativeState?.mods.find((mod) => mod.id === task.installedModId)
    : undefined;
  const installed = () => {
    closeDialog(false);
    if (terrariaWorkshop) {
      openWorkspace('resource-assets');
    } else if (workshop) {
      update((current) => ({ ...current, modTab: 'installed' }));
      navigate('mods');
    } else {
      update((current) => ({ ...current, gameTab: 'installed' }));
      navigate('games');
    }
  };

  return (
    <article className={`download-card ${completed ? 'is-complete' : ''}`} aria-label={task.name}>
      <div className="download-game-line">
        <span className="download-game-icon">
          <Icon name={workshop ? (terrariaWorkshop ? 'wallpaper' : 'mod') : 'game'} />
        </span>
        <div>
          <span className="download-eyebrow">{task.source}</span>
          <h3>{task.name}</h3>
          {!compact && <p>{STATUS_LABELS[task.status]}</p>}
        </div>
        {task.progress >= 0 && <strong className="download-percent">{task.progress}%</strong>}
      </div>
      {running && <TaskProgress value={task.progress >= 0 ? task.progress : null} />}
      {(running || failed) && task.message && (
        <p className={failed ? 'download-error' : 'download-message'} role={failed ? 'alert' : 'status'}>
          {task.message}
        </p>
      )}
      {installedMod && (
        <details className="download-mod-dependencies">
          <summary>查看模组依赖</summary>
          <ModDependencies mod={installedMod} />
        </details>
      )}
      <div className="download-card-actions">
        {running && (
          <Button disabled={task.cancelling} onClick={downloads.cancel}>
            {task.cancelling ? '正在取消…' : '取消任务'}
          </Button>
        )}
        {completed && (
          <Button variant="primary" onClick={installed}>
            查看已安装资源
            <Icon name="arrow" />
          </Button>
        )}
        {canRetry && (
          <Button
            variant="primary"
            disabled={
              downloads.tasks.some((entry) => entry.status === 'running') ||
              nativeState?.busy ||
              (steam && (account?.phase !== 'ready' || !account.owned))
            }
            onClick={() => downloads.retry(task.id)}
          >
            重新下载
          </Button>
        )}
        {canRetry && steam && account?.phase !== 'ready' && (
          <Button onClick={() => openWorkspace('steam-login')}>恢复 Steam 连接</Button>
        )}
        {compact ? (
          <Button onClick={downloads.minimize}>最小化</Button>
        ) : (
          <Button onClick={() => downloads.show(task.id)}>查看下载窗口</Button>
        )}
      </div>
    </article>
  );
}

export function NativeDownloadsPage({ compact = false }: { compact?: boolean }) {
  const { openWorkspace } = useLauncher();
  const { tasks, focusedTask } = useDownloads();
  const visibleTasks = compact ? (focusedTask ? [focusedTask] : []) : tasks;
  const titleId = compact ? 'download-window-title' : 'download-title';

  return (
    <section className={`download-page ${compact ? 'download-compact' : ''}`} aria-labelledby={titleId}>
      <div className="download-page-heading">
        <h2 id={titleId}>{compact && focusedTask ? STATUS_LABELS[focusedTask.status] : '下载任务'}</h2>
      </div>
      {visibleTasks.length > 0 ? (
        <div className="download-task-list">
          {visibleTasks.map((task) => <DownloadCard key={task.id} task={task} compact={compact} />)}
        </div>
      ) : (
        <div className="download-empty">
          <Icon name="download" />
          <h3>还没有下载任务</h3>
          {!compact && (
            <Button variant="primary" onClick={() => openWorkspace('resource-versions')}>
              浏览下载资源
              <Icon name="arrow" />
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
