import { useState } from 'react';
import { Badge, Button, EmptyState, Icon } from '../../components/ui';
import { nativeRequest } from '../../native/bridge';
import { useLauncher } from '../../state/launcher';
import { useNativeActions } from './actions';
import { NativeField } from './controls';
import { useNativeFileBrowser } from './files';
import {
  ResourceBrowserLayout,
  ResourceSearch,
  ResourceSelect,
  ResourceReset,
} from './resource-layout';

export function NativePacks({ catalog = false }: { catalog?: boolean }) {
  const launcher = useLauncher();
  const { nativeState, openDialog, closeDialog } = launcher;
  const { importInfo } = useNativeActions(launcher);
  const { exportJson } = useNativeFileBrowser();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const packs = nativeState?.packs || [];
  const visible = packs
    .filter((pack) => pack.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) =>
      sort === 'size'
        ? b.mods.length - a.mods.length || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const run = (method: string, params: object) =>
    void nativeRequest(method, params).catch((error: Error) =>
      openDialog({ title: '操作未完成', description: error.message }),
    );
  const tools = (
    <>
      <NativeField
        label="模组包名称"
        value={name}
        onChange={setName}
        placeholder="保存当前启用清单"
      />
      <Button
        disabled={!name.trim() || nativeState?.busy}
        onClick={() => run('packs.save', { name: name.trim() })}
      >
        保存模组包
      </Button>
      {catalog && <Button onClick={() => importInfo('pack')}>导入 JSON</Button>}
    </>
  );
  const list = !visible.length ? (
    <EmptyState
      symbol="folder"
      title={packs.length ? '没有匹配的模组包' : '还没有模组包'}
      description={
        packs.length
          ? '试试其他关键词，或重置筛选。'
          : '把当前启用的模组清单保存为预设，可导出分享。'
      }
    >
      {!!packs.length && (
        <ResourceReset
          onClick={() => {
            setQuery('');
            setSort('name');
          }}
        />
      )}
    </EmptyState>
  ) : (
    <div className={catalog ? 'resource-pack-list' : 'panel'}>
      {visible.map((pack) => (
        <article
          className={catalog ? 'resource-catalog-card resource-pack-card' : 'resource-row'}
          key={pack.name}
        >
          <span className={catalog ? 'resource-cover' : 'resource-icon'}>
            <Icon name="folder" />
          </span>
          <div className={catalog ? 'resource-card-copy' : 'resource-copy'}>
            <h3>{pack.name}</h3>
            <p>{pack.mods.length} 个模组 · 启用清单预设</p>
            {catalog && <Badge>本地模组包</Badge>}
          </div>
          <div className="resource-pack-actions">
            <Button
              disabled={nativeState?.busy}
              onClick={() =>
                openDialog({
                  title: `应用 ${pack.name}`,
                  description: '将替换当前启用清单并检查依赖；缺失模组时保留原清单。',
                  actions: (
                    <>
                      <Button onClick={() => closeDialog()}>取消</Button>
                      <Button
                        onClick={() => {
                          closeDialog();
                          run('packs.apply', { name: pack.name });
                        }}
                      >
                        应用
                      </Button>
                    </>
                  ),
                })
              }
            >
              应用
            </Button>
            <Button
              disabled={nativeState?.busy}
              onClick={() => exportJson(pack.name, JSON.stringify(pack.mods, null, 2))}
            >
              导出
            </Button>
            <Button
              disabled={nativeState?.busy}
              onClick={() =>
                openDialog({
                  title: `删除模组包 ${pack.name}`,
                  description: '仅删除此预设清单，已安装模组和存档保留。',
                  actions: (
                    <>
                      <Button onClick={() => closeDialog()}>取消</Button>
                      <Button
                        onClick={() => {
                          closeDialog();
                          run('packs.delete', { name: pack.name });
                        }}
                      >
                        删除清单
                      </Button>
                    </>
                  ),
                })
              }
            >
              删除
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
  if (!catalog)
    return (
      <>
        <div className="native-toolbar">{tools}</div>
        {list}
      </>
    );
  return (
    <ResourceBrowserLayout
      title="模组包"
      summary={`${visible.length} 个匹配 · 共 ${packs.length} 个本地预设`}
      filters={
        <>
          <ResourceSearch label="搜索模组包" value={query} onChange={setQuery} />
          <ResourceSelect
            label="模组包排序"
            value={sort}
            onChange={setSort}
            options={[
              ['name', '名称'],
              ['size', '模组数量'],
            ]}
          />
          <div className="resource-filter-tools">{tools}</div>
          <div className="resource-source">
            <span>模组包来源</span>
            <Badge>本地 JSON 清单</Badge>
            <p>模组包保存模组名称与启用清单；应用前会检查已安装的模组和依赖。</p>
          </div>
          <ResourceReset
            onClick={() => {
              setQuery('');
              setSort('name');
            }}
          />
        </>
      }
    >
      {list}
    </ResourceBrowserLayout>
  );
}
