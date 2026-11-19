<div align="center">

<img src="docs/branding/tml-pocket-launcher/current/pocket-launcher-192.png" width="112" alt="tML Pocket Launcher 像素齿轮与树木图标" />

# tML Pocket Launcher

**把 tModLoader 装进口袋。**

面向 Android 的 tModLoader 启动与管理工具：导入正版 Terraria 资源，选择 tML 版本，管理模组，然后在手机上启动游戏。

[English](README.en.md) · [安装使用](docs/getting-started.md) · [构建开发](docs/development.md) · [文档目录](docs/README.md) · [反馈问题](https://github.com/FireworkSky/tML-Pocket-Launcher/issues)

![Platform](https://img.shields.io/badge/Android-9%2B%20%7C%20arm64-3DDC84?logo=android&logoColor=white)
![Status](https://img.shields.io/badge/status-experimental-orange)
![Runtime](https://img.shields.io/badge/runtime-.NET%2010-512BD4?logo=dotnet&logoColor=white)
![UI](https://img.shields.io/badge/UI-React%20%2B%20TypeScript-3178C6?logo=typescript&logoColor=white)

</div>

> **项目处于开发阶段。** 已在 arm64 Android 真机上使用 tML `2026.09.3.1` 和 Terraria `1.4.4.9` 资源进入主菜单并加载内置触控模组。其他版本、设备 GPU、完整世界游玩与多人联机仍需要单独验证。该项目为社区工具，与 Re-Logic、tModLoader、Valve、GOG 无官方隶属关系。

## 项目定位

tML Pocket Launcher 为桌面版 tModLoader 提供 Android 启动环境。游戏通过 SDL、FNA 原生后端和 Android CoreCLR 运行，启动器提供资源安装、账号授权、版本获取、模组管理和移动端适配。

**构建本项目会编译启动器、自有补丁和内置触控模组；不会编译 tModLoader 或托管 FNA。** tML 与 `FNA.dll` 来自用户下载或导入的预编译发行包，Terraria 游戏资源单独获取。APK 不包含 Terraria Content、`tModLoader.dll` 或托管 `FNA.dll`。

## 功能概览

| 模块     | 当前能力                                                                   |
| -------- | -------------------------------------------------------------------------- |
| 游戏资源 | 自定义文件浏览器；导入 Steam ZIP、GOG Linux `.sh`；安装校验与事务回滚      |
| tML 版本 | 浏览官方 GitHub Releases、选择下载版本、导入本地发行 ZIP、读取真实安装版本 |
| Steam    | 使用 SteamKit2 登录、Steam Guard 验证、Terraria 所有权检查与资源下载       |
| GOG      | 官方网页登录授权、资源版本选择与 Linux 安装包下载                          |
| 模组管理 | 读取 `.tmod` 元信息、搜索、启停、依赖检查、删除和批量管理；无需加载游戏    |
| 模组包   | 保存启用清单、导入／导出 JSON、应用预设与缺失依赖检查                      |
| 模组获取 | 浏览官方创意工坊；按项目编号获取公开元信息和可用 CDN 文件                  |
| 触控     | 内置 MobileJoystick `0.1.4`；双摇杆、触摸菜单、物品栏和游戏内布局编辑      |
| 补丁     | 内置触摸、全屏、渲染缩放与兼容补丁；可选帧率显示、120 FPS 和实验性房间托管 |
| 外观     | 默认横屏、可选竖屏；主题、玻璃效果、自定义背景、动效和减少动态效果         |
| 启动诊断 | 分阶段启动动画、首帧反馈、启动日志与错误提示                               |

Steam 登录已获真机验证；**GOG 登录与完整付费资源传输尚未完成自有账号实测**。实现状态、浏览器演示和真机验证范围见 [Android 功能说明](docs/android-launcher.md)。

## 开始使用

1. 准备 **Android 9 / API 28 及以上的 arm64-v8a 设备**，安装 APK。硬件和 GPU 兼容性仍取决于实际设备。
2. 在“游戏”页导入 Steam Terraria ZIP 或 GOG Linux `.sh`，也可通过商店账号获取资源。请使用自己拥有的游戏。
3. 从官方发行列表下载 tModLoader，或导入包含依赖及 Content 的完整发行 ZIP。GitHub 的源码 ZIP 不能作为游戏发行包。
4. 检查资源和版本，按需导入其他 `.tmod` 模组。MobileJoystick 由启动器维护并保持启用。
5. 点击“启动游戏”。触控布局在游戏内的 MobileJoystick 设置中调整。

Steam 资源在**每次启动前需要联网登录并验证 Terraria 所有权**；GOG 资源导入后启动无需登录。更详细的步骤、包结构和数据保护建议见 [安装使用指南](docs/getting-started.md)。

APK 构建产物位于 `android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk`。仓库保存源码和必要运行依赖，APK 不随源码提交；可检查 [Releases](https://github.com/FireworkSky/tML-Pocket-Launcher/releases) 是否已有发布包，或按下文自行构建。

## 已知边界

- 当前管理一个活动 tML 发行版；切换安装会事务性替换发行文件，并保留独立的用户数据。
- 下载支持取消与重试，暂不支持跨进程的断点续传。
- 创意工坊中需要认证 UGC 传输的模组暂不能直接下载，可从 Steam 获取后导入 `.tmod`。
- GOG 分卷安装包暂不支持。
- 120 FPS 和实验性房间托管默认关闭；启用选项不保证设备持续达到目标帧率或实际联网兼容性。
- 浏览器普通模式是交互预览，包含示例数据；Android 模式使用设备真实状态。
- 构建、单元测试或进入主菜单不等于所有模组、存档、版本和联机方式均兼容。

## 从源码构建

推荐使用 **Windows + PowerShell**；当前脚本按该环境组织，其他主机环境尚未完整验证。

### 环境

| 工具        | 要求                                                           |
| ----------- | -------------------------------------------------------------- |
| .NET SDK    | 10，具体策略见 [`global.json`](global.json)                    |
| Java        | JDK 21 或兼容的 Android Studio JBR                             |
| Android SDK | Platform 37                                                    |
| Android NDK | `30.0.14904198 rc1`，见 Gradle 配置                            |
| CMake       | `3.22.1`                                                       |
| Node.js     | 22+，配合 npm                                                  |
| Git         | 支持子模块；首次克隆需要 `--recurse-submodules`                |
| 编译参考    | 已安装的预编译 Terraria `1.4.4.9` / tML `2026.09.3.1` 发行目录 |

```powershell
git clone --recurse-submodules https://github.com/FireworkSky/tML-Pocket-Launcher.git tML-Pocket-Launcher
Set-Location tML-Pocket-Launcher

# 路径替换成自己的本地安装目录；只准备编译引用，不打包游戏本体。
.\scripts\build\prepare-game-references.ps1 -TmlRoot '<预编译 tModLoader 安装目录>'

# 配置 JAVA_HOME、ANDROID_HOME，或在 android/local.properties 中设置 sdk.dir。
.\scripts\checks\verify.ps1 -Android -Assemble
```

首次构建需要下载 Gradle、Maven、NuGet 和 npm 依赖。详见 [开发指南](docs/development.md)，不要把本机 SDK 路径、账号凭据或游戏资源加入仓库。

### 单独预览界面

```powershell
Set-Location ui/launcher
npm ci
npm run dev
```

打开 `http://127.0.0.1:8769/preview.html` 可查看横竖屏手机预览。生产 APK 离线内嵌 React + TypeScript 界面，游戏渲染在独立 SDL/CoreCLR 进程中运行。

### 验证

```powershell
# 布局、命名规范、托管构建及测试
.\scripts\checks\verify.ps1

# UI 类型检查、构建和七组浏览器回归测试
Push-Location ui/launcher
npm test
npm run format:check
Pop-Location

# APK 的必要文件与游戏本体排除检查
.\scripts\checks\check-apk.ps1 -ApkPath android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

浏览器测试默认使用 Microsoft Edge，可通过 `PLAYWRIGHT_CHANNEL` 调整。真机启动、账号资源传输和触控游玩需另外验证。

## 项目结构

```text
tML-Pocket-Launcher/
├── android/                  Android 应用、Gradle、JNI 与原生运行宿主
│   └── app/src/              Android Kotlin/Java 源码与 JVM 测试
├── managed/                  C# 宿主、平台兼容、Steam/GOG 服务与测试
│   ├── MobileLauncher.Bootstrap/、Host/Stores/ 启动器托管组件
├── ui/launcher/              React + TypeScript 启动器界面
├── scripts/
│   ├── build/                启动器构建准备脚本
│   ├── checks/               结构、运行时、测试与 APK 校验
│   └── design/               图标源文件与导出工具
├── external/                 SDL、FNA3D、FAudio、补丁与模组源码子模块及 MonoMod 依赖
│   ├── tML-Pocket-Patches/   移动端补丁独立项目
│   └── tML-Pocket-Mods/      MobileJoystick 等模组独立项目
├── docs/                     使用、架构、开发与设计文档
└── MobileLauncher.slnx       C# 解决方案入口
```

Android、C# 与 Web UI 源码分别归位；`build/`、`bin/`、`obj/` 和缓存不上传。架构与数据目录见 [架构说明](docs/architecture.md)。

## 文档与反馈

- [安装使用与备份](docs/getting-started.md)
- [开发与构建](docs/development.md)
- [架构与模块职责](docs/architecture.md)
- [Android 功能和验证边界](docs/android-launcher.md)
- [代码规范](docs/code-style.md) · [贡献指南](CONTRIBUTING.md)
- [常见问题](docs/troubleshooting.md) · [安全问题](SECURITY.md)

提交问题时请提供启动器版本、设备型号、Android 版本、GPU、tML 版本、Terraria 资源来源、复现步骤和脱敏日志。不要提交密码、验证码、令牌、完整资源包或个人存档。

## 致谢与授权

感谢 [tModLoader](https://github.com/tModLoader/tModLoader)、[FNA](https://github.com/FNA-XNA/FNA)、Re-Logic、[RotatingArtDev](https://github.com/RotatingArtDev)、SteamKit、SDL、FNA3D、FAudio、MonoMod、MobileJoystick 作者 **yu**，以及 React、Animate UI、Inspira UI、Lucide 等依赖的贡献者。

各组件保留自己的授权；**不能将整个仓库视作统一 MIT 授权**。迁移补丁的 GPL-3.0、SteamKit2 的 LGPL-2.1、Animate UI 的 MIT + Commons Clause 等条款见 [第三方声明](THIRD_PARTY_NOTICES.md)。MobileJoystick 源码未附独立 LICENSE，不能由本项目替上游授予新的许可。Terraria 资源和官方标志归其权利人所有。

启动器和 README 使用用户选定的像素齿轮与树木图标。当前图标原图、各尺寸导出和 Android 裁切预览见 [`docs/branding/tml-pocket-launcher/current`](docs/branding/tml-pocket-launcher/current)；其他方案保留为历史设计。
