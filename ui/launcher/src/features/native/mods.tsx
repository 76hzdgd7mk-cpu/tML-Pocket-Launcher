import { useEffect, useState } from 'react';
import { NativePacks } from './packs';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Switch,
  WorkspaceTabs,
} from '../../components/ui';
import { useLauncher } from '../../state/launcher';
import { nativeRequest } from '../../native/bridge';

export function NativeModsPage() {
  const { state, update, nativeState, openDialog, closeDialog, openWorkspace } = useLauncher();
  useEffect(() => {
    if (state.modTab !== 'browse') return;
    update((current) => ({ ...current, modTab: 'installed' }));
    openWorkspace('resource-mods');
  }, [state.modTab, update, openWorkspace]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const mods = nativeState?.mods || [];
  const filteredMods = mods.filter(
    (mod) =>
      `${mod.title} ${mod.author} ${mod.id}`.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === 'all' || (filter === 'enabled' ? mod.enabled : !mod.enabled)),
  );
  const run = (method: string, params: object = {}) =>
    void nativeRequest(method, params).catch((error: Error) =>
      openDialog({ title: '操作未完成', description: error.message }),
    );
  const confirmDelete = (id: string, title: string) =>
    openDialog({
      title: `删除 ${title}`,
      description: '模组文件将从当前目录删除，依赖它的模组会一并停用；存档保留。',
      actions: (
        <>
          <Button onClick={() => closeDialog()}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              closeDialog();
              run('mods.delete', { id });
            }}
          >
            删除模组
          </Button>
        </>
      ),
    });
  const installed = (
    <>
      <div className="native-mod-tools">
        <label className="search-field">
          <Icon name="search" />
          <input
            type="search"
            aria-label="搜索已安装模组"
            placeholder="搜索名称或作者"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-group" role="group" aria-label="筛选模组">
          {[
            ['all', '全部'],
            ['enabled', '已启用'],
            ['disabled', '已停用'],
          ].map(([key, label]) => (
            <Button
              className={`filter ${filter === key ? 'active' : ''}`}
              aria-pressed={filter === key}
              key={key}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <IconButton
          symbol="sliders"
          label="模组批量操作"
          disabled={nativeState?.busy || !mods.some((mod) => !mod.error && !mod.builtin)}
          onClick={() =>
            openDialog({
              title: '批量管理',
              description:
                '作用于全部可管理模组，内置触控保持启用。停用时会联动停用依赖项，下次启动生效。',
              body: (
                <div className="pack-options">
                  {[true, false].map((enabled) => (
                    <Button
                      key={String(enabled)}
                      onClick={() => {
                        closeDialog();
                        run('mods.enable', {
                          ids: mods
                            .filter((mod) => !mod.error && !mod.builtin)
                            .map((mod) => mod.id),
                          enabled,
                        });
                      }}
                    >
                      {enabled ? '全部启用' : '全部停用'}
                    </Button>
                  ))}
                </div>
              ),
            })
          }
        />
      </div>
      {!mods.length ? (
        <EmptyState
          symbol="mod"
          title="还没有模组"
          description="使用右上角「添加模组」下载或导入 .tmod 文件。"
        />
      ) : !filteredMods.length ? (
        <EmptyState symbol="search" title="没有匹配的模组" description="试试其他关键词或清除筛选。">
          <Button
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            清除筛选
          </Button>
        </EmptyState>
      ) : (
        <section className="panel native-mod-list" aria-label="已安装模组">
          {filteredMods.map((mod) => (
            <div className="resource-row native-mod-row" key={mod.id}>
              <span className="resource-icon">
                <Icon name="mod" />
              </span>
              <div className="resource-copy">
                <h3>
                  {mod.title} <Badge>{mod.version || '无法读取'}</Badge>{' '}
                  {mod.builtin && <Badge tone="green">内置触控</Badge>}
                </h3>
                <p>
                  {mod.author || mod.id} · {(mod.size / 1048576).toFixed(1)} MB
                </p>
                {(mod.error || mod.deps.length > 0) && (
                  <p>{mod.error || `依赖：${mod.deps.join('、')}`}</p>
                )}
              </div>
              {!mod.builtin && (
                <div className="native-mod-actions">
                  <Switch
                    disabled={nativeState?.busy || !!mod.error}
                    label={`启用${mod.title}`}
                    checked={mod.enabled}
                    onChange={(enabled) => run('mods.enable', { ids: [mod.id], enabled })}
                  />
                  <Button
                    disabled={nativeState?.busy}
                    onClick={() => confirmDelete(mod.id, mod.title)}
                  >
                    删除
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
  const packs = <NativePacks />;
  return (
    <div className="native-mods-workspace">
      <WorkspaceTabs
        value={state.modTab === 'browse' ? 'installed' : state.modTab}
        onChange={(modTab) => update((current) => ({ ...current, modTab }))}
        label="模组分类"
        items={[
          { value: 'installed', label: '已安装', count: mods.length, content: installed },
          {
            value: 'packs',
            label: '模组包',
            count: nativeState?.packs.length || 0,
            content: packs,
          },
        ]}
      />
    </div>
  );
}
