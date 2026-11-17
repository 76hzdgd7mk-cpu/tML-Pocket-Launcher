import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Switch,
  WorkspaceTabs,
} from '../components/ui';
import { filterCatalog, needsUpdate, defaultFilters } from '../domain/mods';
import { CatalogFilters, useModActions } from './mod-actions';
import { PacksPanel } from './packs';
import type { Mod } from '../domain/types';

function ModArt({ mod }: { mod: Mod }) {
  return <span className={`mod-art ${mod.side === 'client' ? 'blue' : ''}`}>{mod.art}</span>;
}
export function ModsPage() {
  const { state, update, installed } = useModActions();
  return (
    <WorkspaceTabs
      value={state.modTab}
      onChange={(modTab) => update((current) => ({ ...current, modTab }))}
      label="模组工作区"
      className="mods-tabs"
      items={[
        {
          value: 'installed',
          label: '已安装',
          count: installed.length,
          id: 'mod-tab-installed',
          data: { 'data-action': 'mw-tab-installed' },
          content: <LocalMods />,
        },
        {
          value: 'browse',
          label: '下载模组',
          id: 'mod-tab-browse',
          data: { 'data-action': 'mw-tab-browse' },
          content: <Catalog />,
        },
        {
          value: 'packs',
          label: '模组包',
          id: 'mod-tab-packs',
          data: { 'data-action': 'mw-tab-packs' },
          content: <PacksPanel />,
        },
      ]}
    />
  );
}
function LocalMods() {
  const {
    state,
    installed,
    update,
    openDialog,
    closeDialog,
    toggle,
    details,
    updateAll,
    bulk,
    showInfo,
  } = useModActions();
  const query = state.localQuery.toLocaleLowerCase().trim();
  const filtered = installed
    .filter(
      (mod) =>
        (state.localFilter === 'all' || mod.enabled === (state.localFilter === 'enabled')) &&
        `${mod.title} ${mod.id} ${mod.author} ${mod.kind}`.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) =>
      state.localSort === 'enabled'
        ? Number(b.enabled) - Number(a.enabled)
        : state.localSort === 'updated'
          ? (b.changed || 0) - (a.changed || 0)
          : a.title.localeCompare(b.title, 'zh-CN'),
    );
  const menu = () =>
    openDialog({
      title: '本地模组操作',
      description: '批量操作作用于当前已安装列表；不会启动或重新加载游戏。',
      body: (
        <div className="pack-options">
          <Button variant="soft" data-action="mw-enable-all" onClick={() => bulk(true)}>
            全部启用
          </Button>
          <Button data-action="mw-disable-all" onClick={() => bulk(false)}>
            全部停用
          </Button>
          {(
            [
              ['name', '按名称排序'],
              ['enabled', '已启用优先'],
              ['updated', '最近变更优先'],
            ] as const
          ).map(([localSort, label]) => (
            <Button
              key={localSort}
              data-action={`mw-sort-${localSort}`}
              onClick={() => {
                update((current) => ({ ...current, localSort }));
                closeDialog();
              }}
            >
              {label}
            </Button>
          ))}
          <Button data-action="mod-folder" onClick={() => showInfo('mod-folder')}>
            查看模组目录
          </Button>
          <Button
            data-action="mod-profiles"
            onClick={() => {
              update((current) => ({ ...current, modTab: 'packs' }));
              closeDialog(false);
            }}
          >
            管理模组包
          </Button>
        </div>
      ),
      drawer: true,
    });
  return (
    <>
      <div className="mod-search-tools">
        <label className="search-field">
          <Icon name="search" />
          <input
            type="search"
            id="mod-search"
            aria-label="搜索本地模组"
            placeholder="搜索名称或作者"
            value={state.localQuery}
            onChange={(event) =>
              update((current) => ({ ...current, localQuery: event.target.value }))
            }
          />
        </label>
        <IconButton
          symbol="sliders"
          label="模组批量操作与排序"
          data-action="mw-local-menu"
          onClick={menu}
        />
      </div>
      <div className="mod-filter-line">
        <div className="filter-group" aria-label="筛选模组">
          {(
            [
              ['all', '全部'],
              ['enabled', '已启用'],
              ['disabled', '未启用'],
            ] as const
          ).map(([localFilter, label]) => (
            <Button
              key={localFilter}
              className={`filter ${state.localFilter === localFilter ? 'active' : ''}`}
              aria-pressed={state.localFilter === localFilter}
              data-mod-filter={localFilter}
              onClick={() => update((current) => ({ ...current, localFilter }))}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button className="mod-text-action" data-action="mw-update-all" onClick={updateAll}>
          <Icon name="download" />
          检查更新
        </Button>
      </div>
      <section className="panel mod-list" id="mods-list">
        {!installed.length ? (
          <EmptyState
            symbol="mod"
            title="添加你的第一个模组"
            description="可以直接浏览和下载模组，也可以导入本地 .tmod 文件。"
          >
            <Button
              variant="soft"
              symbol="download"
              onClick={() => update((current) => ({ ...current, modTab: 'browse' }))}
            >
              下载模组
            </Button>
          </EmptyState>
        ) : !filtered.length ? (
          <EmptyState
            symbol="search"
            title="没有匹配的模组"
            description="尝试其他关键词或筛选条件。"
          >
            <Button
              variant="soft"
              data-action="clear-mod-search"
              onClick={() =>
                update((current) => ({
                  ...current,
                  localQuery: '',
                  localFilter: 'all',
                }))
              }
            >
              清除筛选
            </Button>
          </EmptyState>
        ) : (
          filtered.map((mod) => (
            <div className="mod-row" key={mod.id}>
              <ModArt mod={mod} />
              <div className="row-main">
                <h3>
                  {mod.title}
                  {mod.channel !== state.profile ? (
                    <Badge>版本不兼容</Badge>
                  ) : needsUpdate(mod) ? (
                    <Badge tone="blue">可更新</Badge>
                  ) : null}
                </h3>
                <p>
                  v{mod.version} · {mod.author}
                </p>
                <small>
                  {mod.kind}
                  {mod.deps.length ? ` · ${mod.deps.length} 项依赖` : ''}
                </small>
              </div>
              <Switch
                label={'启用' + mod.title}
                checked={mod.enabled}
                action={`mod-${mod.id}`}
                onChange={() => toggle(mod)}
              />
              <IconButton
                symbol="chevron"
                label={'查看' + mod.title + '详情'}
                data-action={`mod-detail-${mod.id}`}
                onClick={() => details(mod)}
              />
            </div>
          ))
        )}
      </section>
    </>
  );
}
function Catalog() {
  const { state, installed, update, openDialog, notice, details, plan, instances, updateAll } =
    useModActions();
  const filtered = filterCatalog(state.filters, installed, state.profile);
  const filters = state.filters;
  const hasFilter =
    filters.status !== 'all' ||
    filters.tag !== 'all' ||
    filters.side !== 'all' ||
    filters.period !== 'all';
  return (
    <>
      <div className="mod-search-tools">
        <label className="search-field">
          <Icon name="search" />
          <input
            type="search"
            id="catalog-search"
            aria-label="搜索在线模组"
            placeholder="搜索模组名称或作者"
            value={filters.query}
            onChange={(event) =>
              update((current) => ({
                ...current,
                filters: { ...current.filters, query: event.target.value },
              }))
            }
          />
        </label>
        <IconButton
          symbol="sliders"
          label="模组下载筛选与排序"
          data-action="mw-filters"
          onClick={() =>
            openDialog({
              title: '筛选与排序',
              description: '参考 tML 模组浏览器；这些选项筛选当前示例目录。',
              body: <CatalogFilters />,
              drawer: true,
            })
          }
        />
      </div>
      <div id="catalog-results">
        <div className="catalog-summary">
          <span>
            创意工坊 · 示例 · {filtered.length} 项{hasFilter ? ' · 已筛选' : ''}
          </span>
          <Button className="mod-text-action" data-action="mw-update-all" onClick={updateAll}>
            <Icon name="download" />
            全部更新
          </Button>
        </div>
        {filtered.length ? (
          <section className="panel mod-list">
            {filtered.map((mod) => {
              const local = installed.find((item) => item.id === mod.id);
              const compatible = mod.channel === state.profile;
              const update = local && needsUpdate(local);
              return (
                <div className="catalog-row" key={mod.id}>
                  <ModArt mod={mod} />
                  <Button
                    className="catalog-copy"
                    data-action={`mw-detail-${mod.id}`}
                    onClick={() => details(mod, true)}
                  >
                    <strong>{mod.title}</strong>
                    <span>
                      {mod.author} · v{mod.version}
                    </span>
                    <small>
                      {mod.kind} · {mod.size} MB
                      {mod.deps.length ? ' · 含依赖' : ''} · 示例
                    </small>
                  </Button>
                  <Button
                    className={`catalog-install ${compatible ? '' : 'incompatible'}`}
                    data-action={`${compatible ? 'mw-plan-' : 'mw-incompatible-'}${mod.id}`}
                    aria-label={`${!compatible ? '查看兼容要求：' : local ? (update ? '更新' : '查看') : '下载'}${mod.title}`}
                    onClick={() =>
                      compatible
                        ? plan([mod.id])
                        : notice(
                            '需要匹配的 tML 版本',
                            mod.title + ' 需要预览配置。请先选择匹配版本，再检查其依赖。',
                            <Button variant="soft" onClick={instances}>
                              选择游戏配置
                            </Button>,
                          )
                    }
                  >
                    <Icon name={!compatible ? 'info' : local && !update ? 'check' : 'download'} />
                    <span>
                      {!compatible ? '版本要求' : local ? (update ? '更新' : '已安装') : '下载'}
                    </span>
                  </Button>
                </div>
              );
            })}
          </section>
        ) : (
          <EmptyState
            symbol="search"
            title="没有匹配的模组"
            description="修改关键词或筛选条件后再试。"
          >
            <Button
              variant="soft"
              data-action="mw-reset-search"
              onClick={() =>
                update((current) => ({
                  ...current,
                  filters: { ...defaultFilters },
                }))
              }
            >
              重置搜索
            </Button>
          </EmptyState>
        )}
      </div>
      <p className="list-caption">
        <Icon name="info" />
        当前展示示例目录与下载流程；未连接真实创意工坊。
      </p>
    </>
  );
}
