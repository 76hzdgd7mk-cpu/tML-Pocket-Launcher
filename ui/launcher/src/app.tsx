import { useLayoutEffect, useRef } from 'react';
import { RippleButton, RippleButtonRipples } from '@animate-ui/react/primitives/buttons/ripple';
import {
  BottomNavigation,
  BottomNavigationHighlight,
  BottomNavigationHighlightItem,
  BottomNavigationItem,
  BottomNavigationLabel,
} from '@animate-ui/react/primitives/bottom-navigation';
import { motion } from 'motion/react';
import { Button, Icon, IconButton } from './components/ui';
import { OverlayHost } from './components/overlay-host';
import { DemoControl } from './components/demo-control';
import { LiquidGlassSurface } from './components/liquid-glass-surface';
import { PanelGlass } from './components/glass/panel-glass';
import { PageTransition } from './components/page-transition';
import { HomePage } from './features/home';
import { GamesPage } from './features/games';
import { ModsPage } from './features/mods';
import { PatchesPage } from './features/patches';
import { SettingsPage } from './features/settings';
import { useGameActions } from './features/game-actions';
import {
  isResourceWorkspace,
  pageNames,
  profileTitle,
  resourceDestinations,
  useLauncher,
  workspaceNames,
} from './state/launcher';
import type { Page } from './domain/types';
import { NativeHomePage, NativePatchesPage } from './features/native/pages';
import { NativeGamesPage } from './features/native/games';
import { NativeModsPage } from './features/native/mods';
import { SteamLoginPage } from './features/native/steam/login';
import { SteamLibraryPage } from './features/native/steam/library';
import { NativeDownloadsPage } from './features/native/steam/downloads';
import { useLaunchTransition } from './features/launch/transition';
import { NativeReleaseCatalog } from './features/native/release-catalog';
import { NativeWorkshopCatalog } from './features/native/workshop';
import { NativePacks } from './features/native/packs';

const destinations: { id: Page; symbol: string }[] = [
  { id: 'home', symbol: 'home' },
  { id: 'games', symbol: 'game' },
  { id: 'mods', symbol: 'mod' },
  { id: 'patches', symbol: 'patch' },
  { id: 'settings', symbol: 'settings' },
];
const help: Record<Page, string> = {
  home: '添加 Terraria 资源和 tModLoader，检查运行环境后选择配置启动。支持导入 Steam ZIP 和 GOG Linux .sh；Steam 资源启动前需要登录并验证游戏所有权，GOG 导入无需登录。',
  games:
    '管理 Terraria 资源、tModLoader 版本和商店账户。已安装配置从右侧版本选择器打开；下载新版本与本地导入在这里进行。',
  mods: '已安装模组支持搜索、启停、依赖联动、删除和批量操作。下载模组支持浏览、筛选、更新及连同依赖下载；模组包保存启用清单。管理时只读取文件元信息，无需加载模组。在线目录与下载在此原型中为示例。',
  patches:
    '内置适配随启动器提供，属于必需的运行环境，无法关闭。可选补丁按游戏版本管理，导入后校验依赖和兼容性。',
  settings: '更改启动器外观主题、界面UI、自定义背景、运行选项、触控和存储。',
};
export function App() {
  const { toast, motionEnabled, nativeWorkspace } = useLauncher();
  return (
    <>
      <div
        className={`app-shell ${nativeWorkspace ? 'has-native-workspace' : ''} ${isResourceWorkspace(nativeWorkspace) ? 'resource-workspace' : ''}`}
      >
        <Navigation />
        <main className={`main ${nativeWorkspace ? 'native-workspace' : ''}`}>
          <Header />
          <PageContent />
        </main>
        {!nativeWorkspace && <LaunchDock />}
      </div>
      <div id="overlay-root">
        <OverlayHost />
      </div>
      <PanelGlass />
      <motion.div
        id="toast"
        className={`toast ${toast ? 'show' : ''}`}
        role="status"
        aria-live="polite"
        initial={false}
        animate={{ opacity: toast ? 1 : 0, y: toast ? 0 : 8 }}
        transition={{ duration: motionEnabled ? 0.18 : 0 }}
      >
        {toast}
      </motion.div>
    </>
  );
}
function Navigation() {
  const { state, navigate, tasks, nativeMode, nativeState, nativeWorkspace, openWorkspace } =
    useGameActions();
  const resource = isResourceWorkspace(nativeWorkspace);
  const items = resource
    ? resourceDestinations.map((item) => ({ ...item, resource: true as const }))
    : destinations.map((item) => ({
        ...item,
        label: pageNames[item.id],
        resource: false as const,
      }));
  return (
    <aside className="sidebar">
      <a
        className="brand"
        href="#home"
        aria-label="tML Pocket Launcher 首页"
        onClick={(event) => {
          event.preventDefault();
          navigate('home');
        }}
      >
        <img src="/pocket-launcher.png" alt="" width="38" height="38" />
      </a>
      <BottomNavigation
        value={resource ? nativeWorkspace : state.page}
        onValueChange={(page) =>
          resource
            ? openWorkspace(page as (typeof resourceDestinations)[number]['id'])
            : navigate(page as Page)
        }
        className="launcher-navigation"
        aria-label={resource ? '下载分类' : '主导航'}
      >
        <div className="nav-highlight-container">
          <BottomNavigationHighlight
            mode="parent"
            hover={false}
            className="nav-lens animate-nav-lens"
          >
            <ul className="main-nav">
              {items.map(({ id, symbol, label, resource: resourceItem }) => (
                <li key={id}>
                  <BottomNavigationHighlightItem value={id} asChild>
                    <BottomNavigationItem value={id} asChild>
                      <button
                        type="button"
                        className={`nav-item ${(resource ? nativeWorkspace : state.page) === id ? 'active' : ''}`}
                        data-page={resourceItem ? undefined : id}
                        data-resource-page={resourceItem ? id : undefined}
                      >
                        <Icon name={symbol} />
                        <BottomNavigationLabel show="always" className="navigation-label">
                          {label}
                        </BottomNavigationLabel>
                      </button>
                    </BottomNavigationItem>
                  </BottomNavigationHighlightItem>
                </li>
              ))}
            </ul>
          </BottomNavigationHighlight>
        </div>
      </BottomNavigation>
      <div className="sidebar-bottom">
        <Button className="sidebar-task" data-action="tasks" onClick={tasks}>
          <Icon name="download" />
          <span>
            <strong>下载与任务</strong>
            <small id="task-summary">
              {nativeMode
                ? nativeState?.busy
                  ? nativeState.message
                  : '没有正在进行的任务'
                : state.task
                  ? state.task.paused
                    ? '1 项任务已暂停'
                    : '1 项下载任务（示例）'
                  : '没有正在进行的任务'}
            </small>
          </span>
          <span className="tiny-dot" />
        </Button>
        <div className="sidebar-foot">
          <span className="online-dot" /> 本地工作空间 <span>v0.1</span>
        </div>
      </div>
    </aside>
  );
}
function Header() {
  const {
    state,
    notice,
    tasks,
    importInfo,
    addMods,
    getTerraria,
    navigate,
    update,
    navigationPending,
    nativeMode,
    nativeState,
    nativeWorkspace,
    closeWorkspace,
  } = useGameActions();
  const resource = isResourceWorkspace(nativeWorkspace);
  const primary = nativeWorkspace
    ? null
    : state.page === 'games' && !nativeMode
      ? { label: '导入资源', action: 'get-terraria', run: getTerraria }
      : state.page === 'mods'
        ? nativeMode
          ? state.modTab === 'packs'
            ? { label: '导入 JSON', action: 'import-pack', run: () => importInfo('pack') }
            : { label: '添加模组', action: 'add-mod', run: addMods }
          : { label: '导入模组', action: 'import-mod', run: () => importInfo('mod') }
        : state.page === 'patches'
          ? { label: '导入补丁', action: 'import-patch', run: () => importInfo('patch') }
          : null;
  return (
    <header className="topbar">
      {nativeWorkspace && (
        <Button className="workspace-back" aria-label="返回上一页" onClick={closeWorkspace}>
          <Icon name="arrow" />
        </Button>
      )}
      {resource && <IconButton symbol="house" label="返回首页" onClick={() => navigate('home')} />}
      <h1 className="screen-title" id="screen-title">
        {nativeWorkspace ? workspaceNames[nativeWorkspace] : pageNames[state.page]}
      </h1>
      {!nativeWorkspace && state.page === 'home' && state.preferences.theme === 'tml' && (
        <img
          className="tml-wordmark"
          src="/tml-pocket-wordmark.svg"
          alt=""
          width="160"
          height="28"
        />
      )}
      <div className="topbar-actions" inert={navigationPending}>
        <span id="screen-action">
          {primary && (
            <Button
              className="screen-primary"
              data-action={primary.action}
              aria-label={primary.label}
              title={primary.label}
              onClick={primary.run}
            >
              <Icon name="plus" />
              <span>{primary.label}</span>
            </Button>
          )}
        </span>
        {!nativeWorkspace && (
          <IconButton
            symbol="info"
            label={pageNames[state.page] + '使用说明'}
            data-action="page-help"
            onClick={() =>
              notice(
                pageNames[state.page] + '使用说明',
                nativeMode
                  ? state.page === 'mods'
                    ? '导入和管理 .tmod 元信息、启用清单与模组包。创意工坊部分文件需要 Steam 客户端获取后导入。'
                    : state.page === 'games'
                      ? '从 Steam / GOG 下载已购 Terraria 资源，导入本地资源包，或选择官方 tModLoader 发行版本。'
                      : help[state.page]
                  : help[state.page],
                <DemoControl />,
              )
            }
          />
        )}
        {((!nativeWorkspace && (!nativeMode || state.page !== 'games')) || resource) && (
          <Button
            className="icon-button portrait-account"
            aria-label="管理 Steam 和 GOG 账户"
            data-action="accounts"
            onClick={() => {
              update((current) => ({ ...current, gameTab: nativeMode ? 'sources' : 'accounts' }));
              navigate('games');
            }}
          >
            <Icon name="user" />
          </Button>
        )}
        <Button
          className={resource ? 'resource-download-action' : 'icon-button'}
          aria-label="打开下载任务"
          data-action="tasks"
          onClick={tasks}
        >
          <Icon name="download" />
          {resource && <span>下载</span>}
          <span id="task-badge" hidden={nativeMode ? !nativeState?.busy : !state.task}>
            1
          </span>
        </Button>
        {resource && (
          <IconButton symbol="settings" label="打开设置" onClick={() => navigate('settings')} />
        )}
      </div>
    </header>
  );
}
function PageContent() {
  const { state, motionEnabled, navigationPending, nativeMode, nativeWorkspace } = useLauncher();
  const content = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const key =
    nativeWorkspace ||
    [
      state.page,
      state.page === 'games'
        ? state.gameTab
        : state.page === 'mods'
          ? state.modTab
          : state.page === 'patches'
            ? state.patchTab
            : state.page === 'settings'
              ? state.settingsTab
              : '',
    ].join(':');
  const committed = useRef(key);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const changed = committed.current !== key;
    // Input modality changes motion settings, but must not restore stale scroll
    // positions between pointerdown and click.
    if (changed || !mounted.current) element.scrollTop = positions.current.get(key) || 0;
    if (changed && (nativeWorkspace || committed.current.split(':')[0] !== state.page))
      content.current?.focus({ preventScroll: true });
    committed.current = key;
    mounted.current = true;
  }, [key, motionEnabled, state.page, nativeWorkspace]);
  const pages: Record<Page, React.ReactNode> = {
    home: nativeMode ? <NativeHomePage /> : <HomePage />,
    games: nativeMode ? <NativeGamesPage /> : <GamesPage />,
    mods: nativeMode ? <NativeModsPage /> : <ModsPage />,
    patches: nativeMode ? <NativePatchesPage /> : <PatchesPage />,
    settings: <SettingsPage />,
  };
  return (
    <div
      className="page-content"
      id="page-content"
      tabIndex={-1}
      aria-labelledby="screen-title"
      inert={navigationPending}
      ref={content}
    >
      <div className="page-tabs" id="page-tabs" />
      <div
        className="page-scroll"
        ref={scroller}
        onScroll={(event) =>
          positions.current.set(committed.current, event.currentTarget.scrollTop)
        }
      >
        <PageTransition
          pageKey={nativeWorkspace || state.page}
          effect="push"
          className="page-frame"
        >
          {nativeWorkspace === 'steam-login' ? (
            <SteamLoginPage />
          ) : nativeWorkspace === 'steam-library' ? (
            <SteamLibraryPage />
          ) : nativeWorkspace === 'downloads' ? (
            <NativeDownloadsPage />
          ) : nativeWorkspace === 'resource-versions' ? (
            <NativeReleaseCatalog />
          ) : nativeWorkspace === 'resource-mods' ? (
            <NativeWorkshopCatalog />
          ) : nativeWorkspace === 'resource-packs' ? (
            <NativePacks catalog />
          ) : (
            pages[state.page]
          )}
        </PageTransition>
      </div>
    </div>
  );
}
function LaunchDock() {
  const launchTransition = useLaunchTransition();
  const { state, navigate, update, instances, notice, showInfo, nativeMode, nativeState } =
    useGameActions();
  const ready = nativeMode ? nativeState?.ready === true : state.demo;
  const compact = nativeMode && state.page === 'games';
  const accounts = () => {
    update((current) => ({ ...current, gameTab: nativeMode ? 'sources' : 'accounts' }));
    navigate('games');
  };
  return (
    <aside
      className={`game-dock ${compact ? 'game-library-dock' : ''}`}
      aria-label="当前游戏与启动操作"
    >
      {!compact && (
        <Button className="dock-account" data-action="accounts" onClick={accounts}>
          <span className="dock-avatar">
            <Icon name="user" />
          </span>
          <span>
            <strong>{nativeMode ? '正版资源来源' : '未连接账户'}</strong>
            <small>Steam / GOG</small>
          </span>
          <Icon name="chevron" />
        </Button>
      )}
      <footer className="launch-bar" id="launch-bar" aria-label="游戏启动控制">
        <Button
          className="instance-picker"
          data-action="instances"
          aria-label="选择游戏版本与配置"
          title={state.demo ? profileTitle(state.profile) : '选择游戏版本与配置'}
          onClick={instances}
        >
          <span className="instance-icon">
            <img src="/tmodloader.png" alt="" />
          </span>
          <span>
            <small>
              {nativeMode
                ? nativeState?.tml
                  ? '已安装'
                  : '尚未安装'
                : state.demo
                  ? '已安装 · 示例配置'
                  : '尚未安装'}
            </small>
            <strong>
              {nativeMode
                ? nativeState?.tml || '选择版本'
                : state.demo
                  ? profileTitle(state.profile)
                  : '选择版本'}
            </strong>
          </span>
          <Icon name="chevron" />
          <LiquidGlassSurface />
        </Button>
        <div className="launch-group">
          <LiquidGlassSurface tone="launch" />
          <RippleButton
            type="button"
            className="launch-button"
            disabled={launchTransition.active || (nativeMode && nativeState?.busy)}
            data-action={ready ? 'launch' : 'prepare'}
            onClick={(event) =>
              nativeMode && ready
                ? launchTransition.start(event.currentTarget)
                : state.demo
                  ? notice(
                      '游戏启动流程',
                      '准备运行环境 → 应用兼容配置 → 加载游戏 → 显示游戏画面。',
                      <div className="info-strip dialog-spaced">
                        当前是框架原型；这里展示启动入口，未启动真实游戏。
                      </div>,
                    )
                  : navigate('games')
            }
          >
            <Icon name="play" />
            <span>{ready ? '启动游戏' : '准备游戏'}</span>
            <RippleButtonRipples className="launch-ripple" scale={16} aria-hidden="true" />
          </RippleButton>
        </div>
        <Button className="launch-utility" data-action="logs" onClick={() => showInfo('logs')}>
          <Icon name="file" />
          <span>启动日志</span>
        </Button>
      </footer>
    </aside>
  );
}
