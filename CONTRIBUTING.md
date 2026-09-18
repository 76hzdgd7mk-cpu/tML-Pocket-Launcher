# Contributing

## 开发流程

1. 从 `master` 创建功能分支，例如 `feat/update-runtime` 或 `fix/asset-bootstrap`。
2. 保持 `app`、`native`、`sample` 和 `scripts` 的职责边界，不把构建产物加入源码目录。
3. 修改第三方依赖时，同时更新 `third_party/THIRD_PARTY_NOTICES.md` 和对应许可证文件。
4. 提交前运行 README 中的构建和 APK 资产检查命令。
5. 提交信息使用简短的 Conventional Commits 风格，例如 `feat: update CoreCLR runtime`。

## 变更检查

- Android 工程能通过 `:app:assembleDebug`。
- 示例能通过 `dotnet build sample/FnaSample.csproj -c Release`。
- APK 至少包含 `libmain.so`、`libSDL2.so`、`assets/runtime/dotnet.tar.xz` 和入口程序集。
- 涉及运行时启动、JNI 或原生库的变更，需要在 arm64 Android 设备上检查 logcat。
- 不提交签名文件、密钥、机器相关路径或构建输出。

## 分支合并

合并请求请说明变更范围、验证命令和设备验证结果。若无法进行真机验证，请明确写出未验证的部分。
