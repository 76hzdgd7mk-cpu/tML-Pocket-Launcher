import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Switch,
  WorkspaceTabs,
} from '../../components/ui';
import { NativeField as Field } from './controls';
import { useLauncher } from '../../state/launcher';
import { useNativeActions } from './actions';
import { nativeRequest } from '../../native/bridge';
import { useNativeFileBrowser } from './files';

export function NativeModsPage() {
  const { state, update, nativeState, openDialog, closeDialog, notify } = useLauncher();
  const { importInfo } = useNativeActions(useLauncher());
  const { exportJson } = useNativeFileBrowser();
  const [query, setQuery] = useState('');
  const [workshopQuery, setWorkshopQuery] = useState('');
  const [id, setId] = useState('');
  const [packName, setPackName] = useState('');
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
        <EmptyState symbol="mod" title="还没有模组" description="使用右上角导入模组。" />
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
  const browse = (
    <>
      <div className="native-mod-tools native-workshop-search">
        <label className="search-field">
          <Icon name="search" />
          <input
            type="search"
            aria-label="搜索创意工坊"
            placeholder="搜索创意工坊"
            value={workshopQuery}
            onChange={(event) => setWorkshopQuery(event.target.value)}
          />
        </label>
        <Button
          onClick={() =>
            run('openExternal', {
              url: `https://steamcommunity.com/workshop/browse/?appid=1281930&searchtext=${encodeURIComponent(workshopQuery)}`,
            })
          }
        >
          浏览创意工坊
        </Button>
      </div>
      <section className="panel">
        <div className="native-toolbar">
          <Field
            label="创意工坊项目编号"
            value={id}
            onChange={setId}
            placeholder="例如 2563309347"
          />
          <Button
            disabled={!/^\d{1,20}$/.test(id) || nativeState?.busy}
            onClick={() => {
              void nativeRequest<{ title: string; description: string; file_url: string }>(
                'workshop.details',
                { id },
              )
                .then((detail) =>
                  openDialog({
                    title: detail.title,
                    description:
                      '下载公开直链文件并校验 TMOD；Steam UGC 专用文件需要从 Steam 客户端获取后导入。',
                    body: <p>{detail.description?.slice(0, 1200)}</p>,
                    actions: (
                      <>
                        <Button onClick={() => importInfo('mod')}>导入本地文件</Button>
                        <Button
                          disabled={!detail.file_url}
                          onClick={() => {
                            closeDialog();
                            run('workshop.download', { id });
                          }}
                        >
                          下载并安装
                        </Button>
                      </>
                    ),
                  }),
                )
                .catch((error: Error) => notify(error.message));
            }}
          >
            查询模组
          </Button>
        </div>
      </section>
    </>
  );
  const packs = (
    <>
      <div className="native-toolbar">
        <Field
          label="模组包名称"
          value={packName}
          onChange={setPackName}
          placeholder="保存当前启用清单"
        />
        <Button
          disabled={!packName.trim() || nativeState?.busy}
          onClick={() => run('packs.save', { name: packName })}
        >
          保存模组包
        </Button>
        <Button onClick={() => importInfo('pack')}>导入 JSON</Button>
      </div>
      {!nativeState?.packs.length ? (
        <EmptyState
          symbol="folder"
          title="还没有模组包"
          description="把当前启用的模组清单保存为预设，可导出分享。"
        />
      ) : (
        <section className="panel">
          {nativeState.packs.map((pack) => (
            <div className="resource-row" key={pack.name}>
              <span className="resource-icon">
                <Icon name="folder" />
              </span>
              <div className="resource-copy">
                <h3>{pack.name}</h3>
                <p>{pack.mods.length} 个模组</p>
              </div>
              <Button
                disabled={nativeState.busy}
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
              <Button onClick={() => exportJson(pack.name, JSON.stringify(pack.mods, null, 2))}>
                导出
              </Button>
              <Button
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
          ))}
        </section>
      )}
    </>
  );
  return (
    <div className="native-mods-workspace">
      <WorkspaceTabs
        value={state.modTab}
        onChange={(modTab) => update((current) => ({ ...current, modTab }))}
        label="模组分类"
        items={[
          { value: 'installed', label: '已安装', count: mods.length, content: installed },
          { value: 'browse', label: '下载模组', content: browse },
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
