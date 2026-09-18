# FNA Android CoreCLR Template

单个 FNA 游戏 Android 工程模板。模板使用 .NET 10 CoreCLR 加载普通 IL 程序集，并通过 SDL2、FNA3D 和 FAudio 提供窗口、输入、图形与音频支持。

## 项目名称

- 展示名：`FNA Android CoreCLR Template`
- Git 仓库名：`fna-android-coreclr-template`
- Android 包名：`com.example.fnatemplate`（模板占位名，发布前请替换为自己的反向域名）

## 功能范围

- Android API 28 及以上
- `arm64-v8a`
- .NET 10 CoreCLR / hostfxr
- SDL2 Android host、FNA3D OpenGL ES 3、FAudio
- 一个 `net10.0` FNA C# 示例：`sample/FnaSample.csproj`
- Gradle 构建时自动发布示例程序集并打包到 APK

该仓库是单游戏模板，不是多游戏启动器。替换 `sample` 项目及其资源后，可继续沿用同一套 Android host 和 CoreCLR 启动流程。

## 目录结构

```text
app/                    Android 工程、SDL Activity 和运行时启动代码
native/                 JNI、hostfxr bridge 和 CMake 配置
sample/                 FNA C# 示例游戏源码
scripts/                资产准备、runtime 校验和 APK 检查脚本
runtime/                CoreCLR runtime 版本记录
third_party/            FNA、SDL2、FNA3D、FAudio 和 dotnethost 源码
docs/                   设计说明和集成记录
```

`app/src/main/assets/runtime/dotnet.tar.xz` 是运行所需的 Android arm64 CoreCLR 归档。`app/src/main/assets/game/` 是由构建生成的目录，已加入 `.gitignore`，不会把派生 DLL、PDB 和 deps 文件当作源码提交。

## 环境要求

在 Windows 上构建需要：

- .NET SDK `10.0.101` 或兼容的 .NET 10 SDK
- JDK 21
- Android SDK Platform 37
- Android NDK `30.0.14904198 rc1`
- CMake `3.22.1`
- Android Studio 自带的 Gradle/JDK 环境或可用的 `adb`

`global.json` 固定了 .NET SDK 版本；`app/build.gradle.kts` 固定了 Android 编译 SDK、NDK 和 Java 版本。

## 构建

在仓库根目录执行：

```powershell
dotnet build sample/FnaSample.csproj -c Release
.\gradlew.bat clean :app:assembleDebug
.\scripts\check-apk-assets.ps1 -ApkPath app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

Gradle 的 `preBuild` 会运行 `scripts/prepare-game.ps1`，执行以下步骤：

1. 发布 `sample/FnaSample.csproj` 为 `linux-arm64`、框架依赖部署的 `net10.0` 程序集。
2. 复制程序集、依赖文件和 runtimeconfig 到 `app/src/main/assets/game/`。
3. 写入 `manifest.json`，供 Android host 找到入口程序集。
4. 由 Gradle 将游戏资产和 CoreCLR runtime 打包进 APK。

## 安装与运行

```powershell
adb install -r app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
adb shell am start -n com.example.fnatemplate/.MainActivity
adb logcat -s FnaAndroidCoreClr SDL
```

设备需要是 Android 9/API 28 或更高版本的 arm64 设备。首次启动会把 runtime 和游戏资产解压到应用私有目录；CoreCLR 在独立的 `:game` 进程中初始化。

## 替换为自己的 FNA 游戏

1. 用自己的游戏源码替换 `sample/`，保持 `net10.0` 和 `FNA.NetStandard.csproj` 兼容关系。
2. 在 `scripts/prepare-game.ps1` 中更新项目路径、程序集名称和 manifest 内容。
3. 在 `scripts/check-apk-assets.ps1` 中同步更新入口程序集检查项。
4. 重新执行 Gradle 构建并在 arm64 设备上验证 SDL、CoreCLR、FNA3D 和音频初始化日志。

游戏是普通 IL 程序集，不使用 NativeAOT。需要的原生库必须通过 FNA/SDL2/FNA3D/FAudio 的 Android 兼容方式提供。

## 第三方代码与许可

第三方源码及其版本记录位于 `third_party/THIRD_PARTY_NOTICES.md`。更新第三方源码时，请保留对应目录中的原始许可证文件，并在发布应用前复核 .NET runtime 和各原生库的再分发要求。

## 贡献规范

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。提交改动前至少运行示例构建、APK 构建和资产检查；不要提交 `build/`、`sample/bin/`、`sample/obj/` 或生成的 `app/src/main/assets/game/`。
