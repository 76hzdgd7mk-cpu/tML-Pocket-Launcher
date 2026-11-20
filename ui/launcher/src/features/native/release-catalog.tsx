import { useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, Icon, IconButton } from '../../components/ui';
import { nativeRequest } from '../../native/bridge';
import type { NativeRelease, ReleasePage } from '../../native/models';
import { useLauncher } from '../../state/launcher';
import { useNativeActions } from './actions';
import { useDownloads } from './download-state';
import {
  ResourceBrowserLayout,
  ResourceSearch,
  ResourceSelect,
  ResourceReset,
} from './resource-layout';

export function NativeReleaseCatalog() {
  const launcher = useLauncher();
  const { nativeState, closeDialog, openDialog } = launcher;
  const { instances, importInfo } = useNativeActions(launcher);
  const downloads = useDownloads();
  const [items, setItems] = useState<NativeRelease[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [channel, setChannel] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('latest');
  const pending = useRef(false);
  const generation = useRef(0);
  const retryRequest = useRef({ page: 1, replace: false });
  const load = async (next: number, replace = false) => {
    if (pending.current) return;
    pending.current = true;
    retryRequest.current = { page: next, replace };
    const token = ++generation.current;
    setLoading(true);
    setFailure('');
    try {
      const result = await nativeRequest<ReleasePage>('releases', { page: next });
      if (token !== generation.current) return;
      setItems((old) => {
        const previous = replace ? [] : old;
        return [
          ...previous,
          ...result.releases.filter((release) => !previous.some((item) => item.id === release.id)),
        ];
      });
      setMore(result.hasMore);
      setPage(next + 1);
    } catch (error) {
      if (token === generation.current)
        setFailure(error instanceof Error ? error.message : '版本列表读取失败，请重试。');
    } finally {
      if (token === generation.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    void load(1);
    return () => {
      generation.current++;
    };
  }, []);
  const reset = () => {
    setChannel('all');
    setQuery('');
    setSort('latest');
  };
  const visible = items
    .filter(
      (item) =>
        (channel === 'all' || (item.preview ? 'preview' : 'stable') === channel) &&
        `${item.tag} ${item.name}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? b.tag.localeCompare(a.tag, undefined, { numeric: true })
        : sort === 'oldest'
          ? a.id.localeCompare(b.id, undefined, { numeric: true })
          : b.id.localeCompare(a.id, undefined, { numeric: true }),
    );
  const install = (release: NativeRelease) =>
    openDialog({
      title: `安装 ${release.tag}`,
      description: `${(release.size / 1048576).toFixed(1)} MB · 官方发行包。独立安装并设为当前版本；同版本重新安装只替换该版本文件。保留模组与存档。`,
      actions: (
        <>
          <Button onClick={() => closeDialog()}>取消</Button>
          <Button
            variant="primary"
            onClick={() =>
              downloads.start({
                method: 'download',
                params: { id: release.id },
                name: `tModLoader ${release.tag}`,
                source: 'GitHub · 官方发行包',
              })
            }
          >
            下载并安装
          </Button>
        </>
      ),
    });
  return (
    <ResourceBrowserLayout
      title="tModLoader 发行版本"
      summary={`${visible.length} 个匹配 · 已加载 ${items.length} 个版本${more ? '，可继续加载' : ''}`}
      toolbar={
        <>
          <div className="resource-channels" role="group" aria-label="发行通道">
            {[
              ['all', '全部'],
              ['stable', '稳定版'],
              ['preview', '预览版'],
            ].map(([id, label]) => (
              <Button
                key={id}
                aria-pressed={channel === id}
                className={`resource-channel ${channel === id ? 'active' : ''}`}
                onClick={() => setChannel(id)}
              >
                {channel === id && <Icon name="check" />}
                {label}
              </Button>
            ))}
          </div>
          <IconButton
            symbol="refresh"
            label="刷新版本列表"
            disabled={loading || nativeState?.busy}
            onClick={() => void load(1, true)}
          />
        </>
      }
      filters={
        <>
          <ResourceSearch
            label="搜索游戏版本"
            value={query}
            onChange={setQuery}
            placeholder="版本号或发行名称"
          />
          <ResourceSelect
            label="排序方式"
            value={sort}
            onChange={setSort}
            options={[
              ['latest', '发行较新优先'],
              ['oldest', '发行较早优先'],
              ['name', '版本号'],
            ]}
          />
          <div className="resource-source">
            <span>版本来源</span>
            <Badge>GitHub · tModLoader</Badge>
            <p>筛选作用于已加载版本。不同版本独立安装，模组与存档共用。</p>
          </div>
          <Button onClick={() => importInfo('tml')}>导入 ZIP</Button>
          <Button onClick={instances}>管理已安装版本</Button>
          <ResourceReset onClick={reset} />
        </>
      }
    >
      {failure && (
        <div className="resource-catalog-error" role="alert">
          <p>{failure}</p>
          <Button
            disabled={loading || nativeState?.busy}
            onClick={() => void load(retryRequest.current.page, retryRequest.current.replace)}
          >
            重试
          </Button>
        </div>
      )}
      {visible.map((release) => (
        <article className="release-row resource-catalog-card" key={release.id}>
          <span className="resource-cover">
            <img src="/tmodloader.png" alt="" />
          </span>
          <div className="resource-card-copy">
            <h3>{release.name}</h3>
            <div className="resource-card-meta">
              <strong>{release.tag}</strong>
              <Badge>{release.preview ? '预览版' : '稳定版'}</Badge>
              {nativeState?.tml?.replace(/^v/, '') === release.tag.replace(/^v/, '') && (
                <Badge tone="green">当前版本</Badge>
              )}
            </div>
            <p>{(release.size / 1048576).toFixed(1)} MB · tModLoader 官方发行包</p>
          </div>
          <div className="resource-card-end">
            <span className="resource-provider">GitHub</span>
            <Button disabled={nativeState?.busy} onClick={() => install(release)}>
              <Icon name="download" />
              下载
            </Button>
          </div>
        </article>
      ))}
      {!loading && !failure && !visible.length && (
        <EmptyState
          symbol="search"
          title={items.length ? '没有匹配的版本' : '暂未找到发行版本'}
          description={
            more ? '可调整筛选或继续加载更多官方版本。' : '请调整关键词、切换发行通道或刷新列表。'
          }
        >
          <ResourceReset onClick={reset} />
        </EmptyState>
      )}
      {loading && (
        <div className="resource-loading" role="status">
          <span />
          正在读取官方版本…
        </div>
      )}
      {more && !failure && (
        <Button
          className="resource-load-more"
          disabled={loading || nativeState?.busy}
          onClick={() => void load(page)}
        >
          加载更多
        </Button>
      )}
    </ResourceBrowserLayout>
  );
}
