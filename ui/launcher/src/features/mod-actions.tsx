import { useState } from 'react';
import { Badge, Button, Field } from '../components/ui';
import { Select } from '../components/form-controls';
import { useGameActions } from './game-actions';
import {
  catalog,
  enabledDependents,
  modTitle,
  needsUpdate,
  resolveMods,
  defaultFilters,
} from '../domain/mods';
import type { Mod, ModFilters } from '../domain/types';

export function useModActions() {
  const actions = useGameActions();
  const {
    state,
    installed,
    update,
    notice,
    openDialog,
    closeDialog,
    notify,
    tasks,
    startTask,
    instances,
  } = actions;
  const plan = (ids: string[]) => {
    if (state.task) {
      if (state.task.kind === 'mods') tasks();
      else
        notice(
          '已有下载任务',
          '当前有其他示例任务。请先在下载与任务中取消该任务，再演示模组下载。',
          <Button data-action="tasks" variant="soft" onClick={tasks}>
            查看任务
          </Button>,
        );
      return;
    }
    let closure: Mod[];
    try {
      closure = resolveMods(ids);
    } catch (error) {
      notice('无法生成下载计划', String(error));
      return;
    }
    if (closure.some((mod) => mod.channel !== state.profile)) {
      notice(
        '版本不兼容',
        '模组或依赖不适合当前启动配置。请先选择匹配的 tML 版本。',
        <Button variant="soft" data-action="instances" onClick={instances}>
          选择配置
        </Button>,
      );
      return;
    }
    const items = closure.filter((mod) => {
      const local = installed.find((item) => item.id === mod.id);
      return !local || needsUpdate(local);
    });
    if (!items.length) {
      notice('已是最新版本', '当前示例目录中没有需要安装或更新的模组。');
      return;
    }
    openDialog({
      title: '下载模组与依赖',
      description: '先确认整个依赖计划。新下载的模组默认停用，更新保留原启用状态。',
      body: (
        <>
          <div className="mod-plan">
            {items.map((mod) => (
              <div key={mod.id}>
                <span>
                  <strong>{mod.title}</strong>
                  <small>
                    {installed.some((local) => local.id === mod.id)
                      ? `更新 → v${mod.version}`
                      : `新安装 · v${mod.version}`}
                    {ids.includes(mod.id) ? '' : ' · 必需依赖'}
                  </small>
                </span>
                <span>{mod.size} MB</span>
              </div>
            ))}
          </div>
          <p>
            共 {items.length} 项 · 示例大小 {items.reduce((sum, mod) => sum + mod.size, 0)}{' '}
            MB。正式下载需接入 Steam Workshop 查询和文件传输服务。
          </p>
        </>
      ),
      actions: (
        <>
          <Button onClick={() => closeDialog()}>取消</Button>
          <Button
            variant="primary"
            symbol="download"
            data-action="mw-start-download"
            onClick={() =>
              startTask(
                'mods',
                items.map((mod) => mod.id),
              )
            }
          >
            演示下载
          </Button>
        </>
      ),
      drawer: true,
    });
  };
  const applyEnable = (ids: string[], value: boolean) => {
    update((current) => ({
      ...current,
      mods: current.mods.map((mod) => (ids.includes(mod.id) ? { ...mod, enabled: value } : mod)),
    }));
    closeDialog(false);
    notify('已更新示例启用清单，下次启动生效。', '配置');
  };
  const confirmEnable = (ids: string[], value: boolean, title: string, description: string) =>
    openDialog({
      title,
      description,
      actions: (
        <>
          <Button onClick={() => closeDialog()}>取消</Button>
          <Button
            variant="primary"
            data-action="mw-apply-enable"
            onClick={() => applyEnable(ids, value)}
          >
            {value ? '一并启用' : '一并停用'}
          </Button>
        </>
      ),
    });
  const toggle = (mod: Mod) => {
    if (mod.enabled) {
      const dependents = enabledDependents(mod.id, installed);
      if (dependents.length)
        confirmEnable(
          [mod.id, ...dependents],
          false,
          '这个模组仍被依赖',
          '停用此模组需要同时停用以下依赖者：' + dependents.map(modTitle).join('、'),
        );
      else applyEnable([mod.id], false);
      return;
    }
    let closure: Mod[];
    try {
      closure = resolveMods([mod.id], installed, true);
    } catch (error) {
      notice('缺少启用的依赖', String(error));
      return;
    }
    const missing = closure.filter((item) => !installed.some((local) => local.id === item.id));
    if (missing.length) {
      openDialog({
        title: '缺少启用的依赖',
        description: missing.map((mod) => mod.title).join('、') + ' 尚未安装。下载完成后再启用。',
        actions: (
          <>
            <Button onClick={() => closeDialog()}>取消</Button>
            <Button
              variant="primary"
              data-action={`mw-plan-${mod.id}`}
              onClick={() => plan([mod.id])}
            >
              下载缺失依赖
            </Button>
          </>
        ),
      });
      return;
    }
    if (closure.some((item) => item.channel !== state.profile)) {
      notice('版本不兼容', '模组或依赖不适合当前 tML 配置，请切换匹配版本。');
      return;
    }
    const ids = closure
      .filter((item) => !installed.find((local) => local.id === item.id)?.enabled)
      .map((item) => item.id);
    if (ids.length > 1) confirmEnable(ids, true, '同时启用依赖', ids.map(modTitle).join('、'));
    else applyEnable([mod.id], true);
  };
  const remove = (mod: Mod) => {
    const dependents = installed.filter((other) => other.deps.includes(mod.id));
    if (dependents.length) {
      notice(
        '这个模组仍被依赖',
        '请先处理以下模组再删除：' + dependents.map((mod) => mod.title).join('、'),
      );
      return;
    }
    openDialog({
      title: '删除模组？',
      description: mod.title + ' 将从示例安装列表移除，存档和配置保留。',
      actions: (
        <>
          <Button onClick={() => closeDialog()}>取消</Button>
          <Button
            variant="primary"
            data-action="mw-confirm-delete"
            onClick={() => {
              update((current) => ({
                ...current,
                mods: current.mods.filter((item) => item.id !== mod.id),
              }));
              closeDialog(false);
              notify('已移除示例模组。', '配置');
            }}
          >
            删除
          </Button>
        </>
      ),
    });
  };
  const config = (mod: Mod) =>
    openDialog({
      title: '模组配置文件',
      description:
        '启动器可管理已有 JSON 文件；游戏内通过模组程序集生成的设置界面仍需在游戏中使用。',
      body: <ConfigEditor id={mod.id} />,
      drawer: true,
    });
  const details = (mod: Mod, online = false) =>
    openDialog({
      title: mod.title,
      description: '模组详情 · 示例元信息',
      body: (
        <>
          <dl className="detail-list">
            <dt>版本</dt>
            <dd>{mod.version}</dd>
            <dt>作者</dt>
            <dd>{mod.author}</dd>
            <dt>内部名称</dt>
            <dd>{mod.id}</dd>
            <dt>目标 tML</dt>
            <dd>
              {mod.channel === 'stable' ? '稳定配置' : '预览配置'}
              {mod.channel !== state.profile ? ' · 与当前配置不匹配' : ''}
            </dd>
            <dt>运行侧</dt>
            <dd>{mod.side === 'client' ? '仅客户端' : '客户端与服务端'}</dd>
            <dt>依赖</dt>
            <dd>{mod.deps.map(modTitle).join('、') || '无必需依赖'}</dd>
            <dt>被依赖</dt>
            <dd>
              {installed
                .filter((item) => item.deps.includes(mod.id))
                .map((item) => item.title)
                .join('、') || '无'}
            </dd>
            <dt>来源</dt>
            <dd>{mod.installed ? '示例下载' : '示例本地导入'} · 非真实安装</dd>
          </dl>
          <p>{mod.description}</p>
        </>
      ),
      actions: online ? (
        <Button
          variant="primary"
          symbol="download"
          data-action={`mw-plan-${mod.id}`}
          onClick={() => plan([mod.id])}
        >
          连同依赖下载
        </Button>
      ) : (
        <>
          <Button data-action={`mw-config-${mod.id}`} onClick={() => config(mod)}>
            配置文件
          </Button>
          <Button data-action={`mw-delete-${mod.id}`} onClick={() => remove(mod)}>
            删除模组
          </Button>
          <Button
            variant="soft"
            data-action={`mw-detail-${mod.id}`}
            onClick={() => {
              const item = catalog.find((item) => item.id === mod.id);
              if (item) details(item, true);
            }}
          >
            查看更新
          </Button>
        </>
      ),
      drawer: true,
    });
  const updateAll = () =>
    plan(
      installed
        .filter((mod) => needsUpdate(mod) && mod.channel === state.profile)
        .map((mod) => mod.id),
    );
  const bulk = (value: boolean) => {
    if (!installed.length) {
      notice('没有已安装模组', '先下载或导入模组。');
      return;
    }
    if (value) {
      try {
        const closure = resolveMods(
          installed.map((mod) => mod.id),
          installed,
          true,
        );
        if (
          closure.some(
            (mod) =>
              !installed.some((local) => local.id === mod.id) || mod.channel !== state.profile,
          )
        )
          throw new Error('存在缺失依赖或不兼容模组，请在详情中处理后再全部启用。');
      } catch (error) {
        notice('无法全部启用', String(error));
        return;
      }
    }
    confirmEnable(
      installed.map((mod) => mod.id),
      value,
      value ? '全部启用？' : '全部停用？',
      `将更新 ${installed.length} 项模组的启用清单，下次启动时生效。`,
    );
  };
  return { ...actions, plan, toggle, details, updateAll, bulk };
}
export function CatalogFilters() {
  const { state, update, closeDialog } = useGameActions();
  const [draft, setDraft] = useState(state.filters);
  const options: { label: string; key: keyof ModFilters; items: [string, string][] }[] = [
    {
      label: '搜索范围',
      key: 'searchBy',
      items: [
        ['name', '名称与作者'],
        ['author', '仅作者'],
      ],
    },
    {
      label: '排序方式',
      key: 'sort',
      items: [
        ['hot', '热门'],
        ['recent', '最近更新'],
        ['name', '名称 A–Z'],
      ],
    },
    {
      label: '安装状态',
      key: 'status',
      items: [
        ['all', '全部'],
        ['compatible', '适合当前 tML'],
        ['not-installed', '未安装'],
        ['installed', '已安装'],
        ['updates', '可更新'],
      ],
    },
    {
      label: '分类标签',
      key: 'tag',
      items: [
        ['all', '所有分类'],
        ['内容扩展', '内容扩展'],
        ['实用工具', '实用工具'],
        ['前置库', '前置库'],
      ],
    },
    {
      label: '运行侧',
      key: 'side',
      items: [
        ['all', '全部'],
        ['both', '客户端与服务端'],
        ['client', '仅客户端'],
      ],
    },
    {
      label: '更新时间',
      key: 'period',
      items: [
        ['all', '不限'],
        ['7', '最近一周'],
        ['30', '最近一月'],
      ],
    },
  ];
  return (
    <>
      <div className="mod-select-list">
        {options.map((field) => (
          <Field label={field.label} key={field.key}>
            <Select
              label={field.label}
              value={draft[field.key]}
              onChange={(value) => setDraft({ ...draft, [field.key]: value })}
              options={field.items}
            />
          </Field>
        ))}
      </div>
      <div className="dialog-actions feature-actions">
        <Button
          data-action="mw-reset-filter-dialog"
          onClick={() => setDraft({ ...defaultFilters, query: draft.query })}
        >
          重置
        </Button>
        <Button
          variant="primary"
          data-action="mw-apply-filters"
          onClick={() => {
            update((current) => ({ ...current, filters: draft }));
            closeDialog();
          }}
        >
          查看结果
        </Button>
      </div>
    </>
  );
}
function ConfigEditor({ id }: { id: string }) {
  const { state, update, closeDialog, notify } = useGameActions();
  const [text, setText] = useState(state.configs[id] || '{}');
  return (
    <>
      <label className="pack-name-field">
        示例 JSON 草稿
        <textarea
          id="mod-config-json"
          aria-label="模组配置 JSON"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <p>此处只验证 JSON 格式，不执行模组配置校验，也不写入真实文件。</p>
      <Badge>不加载模组程序集</Badge>
      <div className="dialog-actions feature-actions">
        <Button onClick={() => closeDialog()}>取消</Button>
        <Button
          variant="primary"
          data-action="mw-save-config"
          onClick={() => {
            try {
              const json = JSON.stringify(JSON.parse(text), null, 2);
              update((current) => ({
                ...current,
                configs: { ...current.configs, [id]: json },
              }));
              closeDialog();
              notify('已保存本次预览的 JSON 草稿。', '配置');
            } catch {
              notify('JSON 格式有误，请检查后再保存。');
            }
          }}
        >
          保存示例草稿
        </Button>
      </div>
    </>
  );
}
