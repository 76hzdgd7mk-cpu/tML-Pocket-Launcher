# 当前启动器图标

用户选定的像素齿轮与树木图案，统一用于 Android 桌面图标、启动器品牌区域、关于页面、网页标签页和 GitHub 中英文 README。

- `gear-tree-original.jpg`：用户提供的原图，保留原样。
- `gear-tree-cutout.png`：仅移除外侧连通的白色背景，保留图案和内部白色区域。
- `pocket-launcher-{size}.png`：白底完整图标，提供 1024、512、192、96、48px。
- `android-icon-preview.png`：Android 方形、圆形及小尺寸裁切预览。

Android 使用白色背景和独立透明前景，齿轮置于自适应图标安全区域内，避免圆形裁切截掉轮齿。导出使用最近邻缩放以保留像素边缘。

在仓库根目录重新导出（需要 Python 和 Pillow）：

```powershell
python scripts/design/prepare-gear-icon.py docs/branding/tml-pocket-launcher/current/gear-tree-original.jpg
```

本图由用户提供；相关游戏标志及元素仍归其权利人所有，不因放入本仓库而获得新的许可。
