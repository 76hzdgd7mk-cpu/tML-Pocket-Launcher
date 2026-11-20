import { useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, Icon } from '../../components/ui';
import { nativeRequest } from '../../native/bridge';
import { useLauncher } from '../../state/launcher';
import { useNativeActions } from './actions';
import { useDownloads } from './download-state';
import { NativeField } from './controls';
import { ResourceBrowserLayout, ResourceSearch } from './resource-layout';

interface WorkshopDetail {
  title: string;
  description: string;
  file_url?: string;
}
export function NativeWorkshopCatalog() {
  const launcher = useLauncher();
  const { nativeState, notify } = launcher;
  const { importInfo } = useNativeActions(launcher);
  const downloads = useDownloads();
  const [query, setQuery] = useState('');
  const [id, setId] = useState('');
  const [detail, setDetail] = useState<(WorkshopDetail & { id: string }) | null>(null);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const open = (url: string) =>
    void nativeRequest('openExternal', { url }).catch((error: Error) => notify(error.message));
  const browse = () =>
    open(
      `https://steamcommunity.com/workshop/browse/?appid=1281930&searchtext=${encodeURIComponent(query.trim())}`,
    );
  const lookup = async () => {
    const project = id.trim();
    if (loading || nativeState?.busy || !/^\d{1,20}$/.test(project)) return;
    const token = ++generation.current;
    setLoading(true);
    setFailure('');
    try {
      const result = await nativeRequest<WorkshopDetail>('workshop.details', { id: project });
      if (token === generation.current) setDetail({ ...result, id: project });
    } catch (error) {
      if (token === generation.current)
        setFailure(error instanceof Error ? error.message : '模组查询失败，请重试。');
    } finally {
      if (token === generation.current) setLoading(false);
    }
  };
  return (
    <ResourceBrowserLayout
      title="tModLoader 模组"
      summary={detail ? '已读取 1 个创意工坊项目' : '通过 Steam 创意工坊发现与获取模组'}
      filters={
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              browse();
            }}
          >
            <ResourceSearch
              label="搜索创意工坊"
              value={query}
              onChange={setQuery}
              placeholder="搜索名称或关键词"
            />
            <Button type="submit">浏览创意工坊</Button>
          </form>
          <form
            className="resource-filter-tools"
            onSubmit={(event) => {
              event.preventDefault();
              void lookup();
            }}
          >
            <NativeField
              label="创意工坊项目编号"
              value={id}
              onChange={setId}
              placeholder="例如 2563309347"
            />
            <Button
              type="submit"
              disabled={loading || nativeState?.busy || !/^\d{1,20}$/.test(id.trim())}
            >
              {loading ? '正在查询…' : '查询模组'}
            </Button>
          </form>
          <div className="resource-source">
            <span>目标平台</span>
            <Badge>Steam 创意工坊</Badge>
            <p>关键词搜索会打开 Steam 页面。复制项目编号后可在这里读取详情；支持公开直链文件。</p>
          </div>
          <Button onClick={() => importInfo('mod')}>导入本地模组</Button>
        </>
      }
    >
      {failure && (
        <div className="resource-catalog-error" role="alert">
          {failure}
        </div>
      )}
      {loading && (
        <div className="resource-loading" role="status">
          <span />
          正在读取模组详情…
        </div>
      )}
      {detail ? (
        <article className="resource-catalog-card resource-workshop-card">
          <span className="resource-cover">
            <Icon name="mod" />
          </span>
          <div className="resource-card-copy">
            <span className="resource-provider">Steam Workshop</span>
            <h3>{detail.title || `工坊项目 ${detail.id}`}</h3>
            <p>项目编号 {detail.id}</p>
            <p className="resource-workshop-description">
              {detail.description?.slice(0, 1200) || '此项目未提供简介。'}
            </p>
            <Badge>{detail.file_url ? '公开直链可下载' : '需从 Steam 获取后导入'}</Badge>
            <div className="resource-pack-actions">
              <Button
                onClick={() =>
                  open(`https://steamcommunity.com/sharedfiles/filedetails/?id=${detail.id}`)
                }
              >
                查看工坊页面
              </Button>
              <Button
                disabled={!detail.file_url || nativeState?.busy || loading}
                onClick={() =>
                  downloads.start({
                    method: 'workshop.download',
                    params: { id: detail.id },
                    name: detail.title || `工坊模组 ${detail.id}`,
                    source: 'Steam 创意工坊 · 模组',
                  })
                }
              >
                <Icon name="download" />
                下载并安装
              </Button>
            </div>
          </div>
        </article>
      ) : (
        !loading && (
          <EmptyState
            symbol="mod"
            title="发现下一个冒险"
            description="搜索 Steam 创意工坊，或输入项目编号读取真实模组详情。"
          >
            <Button onClick={browse}>打开 Steam 工坊</Button>
          </EmptyState>
        )
      )}
      <div className="resource-browser-note">
        <Icon name="info" />
        <p>
          下载后校验 TMOD 并安装。Steam UGC 专用文件需要从 Steam
          客户端获取后导入；请确认模组适配当前 tML 版本。
        </p>
      </div>
    </ResourceBrowserLayout>
  );
}
