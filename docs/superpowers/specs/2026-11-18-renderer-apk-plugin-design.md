# 渲染器 APK 插件设计

## 背景

启动器当前在 `GameRuntime` 中固定设置 SDL2、FNA3D 和 OpenGL ES 3 环境。设置页能调整渲染比例，但没有渲染器目录、选择或外部插件发现流程。

`D:\RotatingartLauncher` 的 `RendererRegistry` 管理应用自身的 native library 与内部 `runtime_libs`，不扫描外部 APK，也没有可供第三方插件使用的 APK 协议。目标项目的 SDL Android loader 已识别 `native`、`gl4es`、`angle`、`mobileglues`、`zink` 和 `dxvk` 名称，并可从 `RALCORE_NATIVEDIR` 指定的目录加载其固定命名的 EGL/GLES 库。`SDL_androidvideo.c` 将 `FNA3D_OPENGL_DRIVER` 作为 renderer name 传入 loader；`RALCORE_RENDERER` 的别名映射不覆盖所有 backend。当前 tML 启动链路使用 SDL2 和 OpenGL FNA3D，因此 SDL3 Vulkan 与 DXVK 后端不属于 v1 能力。

## 目标

- 安装符合协议的渲染器 APK 后，启动器可在 Android 11+ 的包可见性规则下发现它。
- 只展示 ABI、Android API、资源校验和当前游戏后端均兼容的渲染器。
- 用户可在“游戏与运行”设置选择渲染器；选择在安装器进程重启后仍然有效。
- 启动游戏时，将所选插件的 native libraries 安全暂存到应用私有目录，并通过现有 SDL Android renderer loader 加载。
- 插件卸载、更新损坏、资源缺失或校验失败时回退到系统原生 OpenGL ES 3，不让游戏启动因失效选择而失败。
- 不把插件 APK 或其 native libraries 打入启动器 APK。

## 非目标

- 不扫描任意已安装应用，也不请求 `QUERY_ALL_PACKAGES`。
- 不把渲染器 APK 当作现有 `.tpatch`/补丁 ZIP 导入；它是由 Android Package Manager 安装和管理的独立应用。
- v1 不迁移来源项目的 SDL3 Vulkan、DXVK、Zink/OSMesa 或所有图形依赖。
- 不执行插件 APK 的 Activity/Service，也不要求插件提供 Binder 接口。
- 不声称描述符里的 SHA-256 能验证发布者身份；它只验证从 APK 资源复制出的字节未损坏。

## 方案与取舍

1. **协议化 APK 插件（推荐）**：按专用 intent action 发现插件，按版本化 JSON 描述符验证兼容性，并从 APK assets 复制 native libraries。Android 包可见性范围明确，插件无须开放跨应用文件 Provider，启动器也不依赖读取另一个应用的私有 native library 目录。
2. 扫描所有安装包：需要广泛包可见性声明，受 Android/应用商店政策约束，而且任意 APK 没有可靠的渲染器身份和库布局约定。
3. 固定包名白名单：能识别有限应用，但无法扩展到新插件，也无法验证其后端、ABI 或库文件。

## 插件协议 v1

### 包发现

启动器 Manifest 声明针对以下 action 的 `<queries>`：

```text
dev.tml.mobilelauncher.action.RENDERER_PLUGIN
```

渲染器 APK 在 Manifest 声明一个 `exported=true` 的 marker service，并添加相同 action 的 intent filter。启动器通过 `PackageManager.queryIntentServices()` 查询匹配项，再通过显式 package context 读取其固定 assets 路径。启动器只查询和读取描述符，不绑定、不启动该 service。

### 描述符和库资源

APK 将清单放在 `assets/tml-renderer/manifest.json`。清单结构为：

```json
{
  "protocolVersion": 1,
  "renderers": [
    {
      "id": "gl4es",
      "displayName": "GL4ES",
      "description": "OpenGL compatibility renderer",
      "backend": "gl4es",
      "minAndroidApi": 28,
      "abis": ["arm64-v8a"],
      "libraries": [
        {
          "fileName": "libGL_gl4es.so",
          "assetPath": "tml-renderer/arm64-v8a/libGL_gl4es.so",
          "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
        },
        {
          "fileName": "libEGL_gl4es.so",
          "assetPath": "tml-renderer/arm64-v8a/libEGL_gl4es.so",
          "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
        }
      ]
    }
  ]
}
```

示例中的全零摘要只表示字段格式，实际插件必须填入每个库文件真实的小写 SHA-256。插件身份由 `(packageName, rendererId)` 组成；`rendererId` 在同一 APK 内唯一。`displayName`、`description`、路径和摘要都是不可信输入，必须经过校验。资源路径必须限制在 `assets/tml-renderer/` 下，不得包含 `..`，并且必须匹配当前设备 ABI。描述符必须使用后端固定的 native loader 文件名列出所需库，不允许提供任意环境变量名或 native loader 命令。

v1 后端白名单为 `gl4es`、`angle` 和 `mobileglues`，并且必须包含该后端要求的全部库。内置 `native` 选项始终可用。当前 FNA3D/SDL2 链路完成真机验证前隐藏 `zink`。当前启动器构建没有 DXVK/Vulkan 所需的运行时后端，因此拒绝这两类后端。

### Discovery and staging

`RendererPluginRepository` 在启动器状态刷新或主 Activity 恢复时扫描查询 action。它校验协议版本、包启用状态、渲染器 ID 唯一性、最低 Android API、当前 ABI、后端白名单、必需库名称、资源存在性和声明的 SHA-256。

启动时仓库会重新读取所选包和描述符，防止卸载或更新后仍信任过期设置。它将必需的 `.so` 资源复制到 `filesDir/renderers/` 下按版本隔离的应用私有目录，复制时校验 SHA-256，先写入临时暂存目录，全部通过后才提升为可用目录。复制失败或中断的目录不能被当作有效渲染器。缓存键包括包名、包版本号、渲染器 ID 和描述符摘要，更新插件后不会复用旧文件。

native 插件代码会在启动器的 `:game` 进程中执行，并拥有该进程的权限。用户通过安装并选择外部渲染器明确表示信任；设置列表必须标出插件包名和版本。摘要校验只检查文件完整性，不验证发布者身份。

### 选择与游戏启动

启动器状态快照包含兼容的渲染器选项和已保存的选择。`settings.save` 接受经过校验的 `rendererPlugin` 身份；未设置或身份无效时使用 `native`。

`GameRuntime` 在 `NativeCoreClr.nativeLaunch` 之前解析并暂存所选渲染器。外部后端有效时，将白名单中的 backend 名称写入 `FNA3D_OPENGL_DRIVER`，并将暂存目录写入 `RALCORE_NATIVEDIR`。现有的 `FNA3D_FORCE_DRIVER=OpenGL`、GLES 3 shader profile 和渲染比例设置保持不变。SDL Android renderer loader 从 `FNA3D_OPENGL_DRIVER` 取得 backend 名称，并按固定库文件名预加载 GLES/EGL；托管游戏代码不负责加载插件库。

如果重新校验或暂存失败，启动流程改用系统原生 OpenGL ES 3，当前启动不使用插件选择，并在启动器日志和启动状态中记录插件包名及失败原因。未经校验的路径或 backend 字符串不得传入 JNI/native 代码。

### UI 与 bridge

原生设置页将固定的 `OpenGL ES 3` 徽标改为选择控件。选项包含系统内置渲染器和当前兼容的外部渲染器。界面显示渲染器名称、插件包名和版本，通过 `settings.save` 保存选择，并在应用恢复时刷新列表。已安装但不兼容的插件不出现在可选列表中；诊断日志记录跳过原因。

浏览器预览仍使用示例数据，不模拟 Android 已安装包。新快照字段是可选项，旧 UI 会忽略未知字段，因此 bridge 协议版本保持为 1。

## 错误处理与兼容性

- 未知协议版本、JSON 格式错误、身份重复、路径越界、不支持的后端、ABI 不匹配、缺少库、摘要不符、应用包被停用或卸载，都会使对应渲染器不可用。
- 单个无效插件不能阻止其他插件或内置渲染器显示。
- 安装包变化会在下次启动器恢复/刷新时体现。不需要安装包权限或运行时存储权限。
- 已保存选择向后兼容：现有安装没有渲染器设置时使用内置渲染器。
- 不增加包签名白名单。Android 安装器负责 APK 安装，用户选择插件即表示信任该插件。

## 计划涉及的代码

- `android/app/src/main/AndroidManifest.xml`：声明包可见性查询 action。
- `android/app/src/main/java/app/com/tmlpocket/feature/renderers/`：描述符模型、插件发现、兼容性检查和私有缓存暂存。
- `android/app/src/main/java/app/com/tmlpocket/feature/launcher/LauncherController.kt` 与 `LauncherSettings.kt`：状态选项、刷新和选择校验。
- `android/app/src/main/java/app/com/tmlpocket/core/runtime/GameRuntime.kt`：在 CoreCLR 启动前解析选择并设置 backend/缓存环境。
- `ui/launcher/src/native/models.ts` 与 `ui/launcher/src/features/native/settings.tsx`：renderer 状态模型和选择控件。
- `docs/renderer-plugin.md`：v1 制作协议、Manifest 示例、JSON schema、ABI 资源布局和最小插件示例。
- Android 测试：描述符/schema 校验、兼容性过滤、摘要/暂存失败、保存/回退，以及验证包发现和跨应用资源访问的插件 fixture APK。

The implementation should first exercise the `gl4es` path with a fixture plugin on a connected arm64 Android device. Additional backends should remain unavailable until their library mapping and a real game launch are validated.

## Acceptance criteria

1. 安装 fixture 渲染器 APK 后，它会出现在原生设置选择器中；无需重启设备，也不授予广泛包可见性。
2. fixture 库会经摘要校验后暂存到应用私有目录；路径越界和摘要变更会被拒绝。
3. 重启启动器后保留渲染器选择，并在每次启动游戏前重新校验。
4. 卸载所选 APK 或破坏描述符后，启动流程回退到 OpenGL ES 3 并生成可诊断日志。
5. 支持的渲染器 APK 能以预期的 `FNA3D_OPENGL_DRIVER` 和 `RALCORE_NATIVEDIR` 到达 SDL Android loader，并在 arm64 真机验证游戏启动。
6. 除非显式选择兼容插件，现有渲染比例、启动参数、补丁设置、游戏文件和默认渲染行为保持不变。
