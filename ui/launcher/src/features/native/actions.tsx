import { useEffect, useState } from 'react';
import { Badge, Button, EmptyState } from '../../components/ui';
import { useLauncher, type LauncherContextValue } from '../../state/launcher';
import { nativeRequest } from '../../native/bridge';
import type { NativeRelease, ReleasePage } from '../../native/models';
import { NativeGogPanel } from './gog';
import { useSteam } from './steam/state';
import { useNativeFileBrowser } from './files';

export function useNativeActions(launcher: LauncherContextValue) {
  const { nativeState, openDialog, closeDialog, navigate, notify, openWorkspace } = launcher;
  const { openSteam } = useSteam();
  const { browse } = useNativeFileBrowser();
  const notice = (title: string, description: string, body?: React.ReactNode) =>
    openDialog({ title, description, body });
  const run = (method: string, params: object = {}) => {
    closeDialog(false);
    void nativeRequest(method, params).catch((error: Error) => notice('操作未完成', error.message));
  };
  const tasks = () => openWorkspace('downloads');
  const versions = () =>
    openDialog({
      title: '选择 tModLoader 版本',
      description: '官方 GitHub Releases · 下载预编译发行包。安装时保留模组与存档。',
      body: <NativeReleaseList />,
      drawer: true,
    });
  const importFile = (
    kind: 'terraria-steam' | 'terraria-gog' | 'tml' | 'mod' | 'patch' | 'pack',
  ) => {
    browse({
      kind,
      choose: (files) => nativeRequest('import', { kind, files }),
      complete: (imported) => {
        if (!imported) return;
        if (kind === 'terraria-steam') {
          openDialog({
            title: 'Steam 资源已导入',
            description:
              '启动前需要登录拥有 Terraria 的 Steam 账户。每次启动都会在线验证游戏所有权。',
            actions: (
              <Button
                onClick={() => {
                  closeDialog(false);
                  openSteam();
                }}
              >
                前往 Steam
              </Button>
            ),
          });
        } else
          notify(
            kind === 'terraria-gog'
              ? 'GOG 资源已导入并校验，无需登录即可启动。'
              : '文件已导入并校验。',
            '配置',
          );
      },
    });
  };
  const importInfo = (kind: 'terraria' | 'tml' | 'mod' | 'patch' | 'pack') => {
    if (kind !== 'terraria') {
      importFile(kind);
      return;
    }
    openDialog({
      title: '导入 Terraria 资源',
      description: '选择资源来源。安装时保留模组与存档。',
      body: (
        <div className="native-stack">
          <div className="resource-row">
            <div className="resource-copy">
              <h3>Steam · ZIP</h3>
              <p>启动前登录 Steam，并在线验证账户拥有 Terraria。</p>
            </div>
            <Button onClick={() => importFile('terraria-steam')}>选择 ZIP</Button>
          </div>
          <div className="resource-row">
            <div className="resource-copy">
              <h3>GOG · Linux .sh</h3>
              <p>导入离线安装包，无需登录或验证游戏所有权。</p>
            </div>
            <Button onClick={() => importFile('terraria-gog')}>选择 .sh</Button>
          </div>
        </div>
      ),
    });
  };
  const accounts = (platform: 'steam' | 'gog') =>
    platform === 'steam'
      ? openSteam()
      : openDialog({
          title: 'GOG 登录与下载',
          description: '登录拥有 Terraria 的账户，下载并校验游戏资源。安装时保留现有模组与存档。',
          body: <NativeGogPanel />,
          drawer: true,
        });
  const instances = () =>
    openDialog({
      title: '已安装版本',
      description: '当前安装的 tModLoader；安装其他版本会替换发行文件，保留用户数据。',
      body: nativeState?.tml ? (
        <div className="resource-row">
          <strong>{nativeState.tml}</strong>
          <Badge tone="green">当前版本</Badge>
        </div>
      ) : (
        <EmptyState
          symbol="game"
          title="尚未安装 tModLoader"
          description="选择官方版本下载，或导入本地发行 ZIP。"
        />
      ),
      actions: (
        <>
          <Button onClick={versions}>下载版本</Button>
          <Button onClick={() => importInfo('tml')}>导入 ZIP</Button>
        </>
      ),
      drawer: true,
    });
  const environment = () => {
    void nativeRequest('refresh')
      .then(() => {
        openDialog({
          title: '运行环境检查',
          description: '根据设备中实际安装的资源检查。',
          body: <NativeEnvironment />,
        });
      })
      .catch((error: Error) => notice('检查失败', error.message));
  };
  const showInfo = (id: string) => {
    if (id === 'logs')
      openDialog({
        title: '诊断日志',
        description: '读取本机最近的运行日志。',
        body: <NativeLogs />,
        drawer: true,
      });
    else if (['storage-paths', 'mod-folder', 'cache'].includes(id))
      openDialog({
        title: id === 'cache' ? '缓存管理' : '数据目录',
        description: '数据保存在应用专用目录，重新安装游戏发行包不会删除模组和存档。',
        body: <NativeStorage clear={id === 'cache'} />,
        drawer: true,
      });
    else if (id === 'launch-args')
      openDialog({
        title: '启动参数',
        description: '每行一个参数，下一次启动生效。数据目录由启动器管理。',
        body: <NativeArguments />,
        drawer: true,
      });
    else if (id === 'controls-layout')
      notice(
        '触控布局',
        '触控由内置 MobileJoystick 提供。进入游戏后打开设置，可选择简单、高级或自定义布局，调整大小、透明度和死区；自定义模式支持拖动控件、绑定模组快捷键及保存四套预设。',
      );
    else if (id === 'licenses')
      openDialog({
        title: '开源与许可',
        description:
          'React、Motion、Radix、Animate UI、Inspira UI、AndroidX WebKit、SteamKit2 与游戏运行依赖。',
        body: (
          <>
            <p>Animate UI: MIT + Commons Clause。</p>
            <p>Inspira UI: MIT。</p>
            <p>SteamKit2: LGPL-2.1-only。未修改的独立程序集，源码来自 SteamRE/SteamKit。</p>
            <p>
              RotatingartLauncher 触摸、显示、帧率、控制台与联机适配：GPL-3.0，源码位于
              external/tML-Pocket-Patches。MobileJoystick 0.1.4：yu，源码见外部 tML-Pocket-Mods 项目并保留资源来源说明。
            </p>
            <p>完整许可文件随 APK 提供。</p>
          </>
        ),
      });
    else notice('启动器', '请从相应页面执行操作。');
  };
  return {
    notice,
    tasks,
    versions,
    importInfo,
    accounts,
    instances,
    environment,
    showInfo,
    launch: () => run('launch'),
    startTask: () => {
      navigate('games');
      versions();
    },
  };
}

export function NativeReleaseList() {
  const { nativeState, notify, closeDialog, openDialog } = useLauncher();
  const [items, setItems] = useState<NativeRelease[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [channel, setChannel] = useState('all');
  const load = (next: number) => {
    setLoading(true);
    setFailure('');
    void nativeRequest<ReleasePage>('releases', { page: next })
      .then((result) => {
        setItems((old) => [
          ...old,
          ...result.releases.filter((release) => !old.some((item) => item.id === release.id)),
        ]);
        setMore(result.hasMore);
        setPage(next + 1);
      })
      .catch((error: Error) => setFailure(error.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(1);
  }, []);
  const download = (release: NativeRelease) =>
    openDialog({
      title: `安装 ${release.tag}`,
      description: `${(release.size / 1048576).toFixed(1)} MB · 官方发行包。将替换当前发行文件，保留模组与存档。`,
      actions: (
        <>
          <Button onClick={() => closeDialog()}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              closeDialog(false);
              void nativeRequest('download', { id: release.id })
                .then(() => notify('tModLoader 已下载并校验。', '任务'))
                .catch((error: Error) =>
                  openDialog({ title: '下载未完成', description: error.message }),
                );
            }}
          >
            下载并安装
          </Button>
        </>
      ),
    });
  return (
    <>
      <div className="filter-group dialog-spaced">
        {[
          ['all', '全部'],
          ['stable', '稳定版'],
          ['preview', '预览版'],
        ].map(([id, label]) => (
          <Button
            key={id}
            className={`filter ${channel === id ? 'active' : ''}`}
            onClick={() => setChannel(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {failure && <p role="alert">{failure}</p>}
      {items
        .filter((item) => channel === 'all' || (item.preview ? 'preview' : 'stable') === channel)
        .map((release) => (
          <div className="release-row" key={release.id}>
            <div className="resource-copy">
              <h3>{release.name}</h3>
              <p>
                {release.tag} · {(release.size / 1048576).toFixed(1)} MB
              </p>
              <Badge>{release.preview ? '预览版' : '稳定版'}</Badge>
            </div>
            <Button disabled={nativeState?.busy} onClick={() => download(release)}>
              下载
            </Button>
          </div>
        ))}
      {loading && <p role="status">正在读取官方版本…</p>}
      {more && (
        <Button disabled={loading || nativeState?.busy} onClick={() => load(page)}>
          {failure ? '重试' : '加载更多'}
        </Button>
      )}
    </>
  );
}

function NativeEnvironment() {
  const { nativeState: state } = useLauncher();
  return (
    <dl className="detail-list">
      <dt>Terraria</dt>
      <dd>{state?.terraria || '未安装或校验未通过'}</dd>
      <dt>tModLoader</dt>
      <dd>{state?.tml || '未安装或校验未通过'}</dd>
      <dt>Android 运行时</dt>
      <dd>{state?.runtime ? '已随 APK 提供' : '运行时资产缺失'}</dd>
      <dt>启动</dt>
      <dd>{state?.ready ? '资源已就绪，启动时再次检查依赖' : '请先完成资源准备'}</dd>
    </dl>
  );
}
function NativeLogs() {
  const { notify } = useLauncher();
  const [text, setText] = useState('正在读取…');
  useEffect(() => {
    void nativeRequest<{ text: string }>('logs')
      .then((data) => setText(data.text))
      .catch((error: Error) => setText(error.message));
  }, []);
  return (
    <>
      <pre className="native-log">{text}</pre>
      <Button
        onClick={() =>
          void nativeRequest('share', { text }).catch((error: Error) => notify(error.message))
        }
      >
        分享日志
      </Button>
    </>
  );
}
function NativeStorage({ clear }: { clear: boolean }) {
  const [data, setData] = useState<Record<string, string | number>>({});
  const [error, setError] = useState('');
  const read = (method = 'storage') =>
    void nativeRequest<Record<string, string | number>>(method)
      .then(setData)
      .catch((failure: Error) => setError(failure.message));
  useEffect(() => {
    read();
  }, []);
  return (
    <>
      <dl className="detail-list">
        {Object.entries(data).map(([key, value]) => (
          <div key={key}>
            <dt>
              {(
                {
                  games: '发行包',
                  userdata: '用户数据',
                  mods: '模组',
                  cache: '下载缓存',
                  availableBytes: '可用空间',
                  cacheBytes: '可清理缓存',
                } as Record<string, string>
              )[key] || key}
            </dt>
            <dd>{typeof value === 'number' ? `${(value / 1048576).toFixed(1)} MB` : value}</dd>
          </div>
        ))}
      </dl>
      {error && <p role="alert">{error}</p>}
      {clear && <Button onClick={() => read('cache.clear')}>清理下载临时文件</Button>}
    </>
  );
}
function NativeArguments() {
  const { nativeState, notify, closeDialog } = useLauncher();
  const [value, setValue] = useState(nativeState?.preferences.launchArguments?.join('\n') || '');
  return (
    <>
      <textarea
        aria-label="启动参数"
        className="native-textarea"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        variant="primary"
        onClick={() =>
          void nativeRequest('settings.save', {
            preferences: {
              launchArguments: value
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean),
            },
          })
            .then(() => {
              notify('启动参数已保存。');
              closeDialog();
            })
            .catch((error: Error) => notify(error.message))
        }
      >
        保存
      </Button>
    </>
  );
}
