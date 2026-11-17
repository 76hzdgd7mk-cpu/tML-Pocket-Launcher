# 已选掌机图标

用户提供并要求用于设备试装的掌机像素图。原图包含 tModLoader 齿轮与树木参考元素。

- `handheld-original.png`：用户上传原图，保留原样。
- `handheld-cutout.png`：提取掌机主体，保留设备内部原始图像像素。
- `pocket-launcher-1024.png`：使用纯色底的完整图标。
- `android-icon-preview.png`：方形、圆形、小尺寸预览。

Android 使用独立纯色背景和透明前景，避免原图外侧白边、原有圆角和水印出现在桌面图标中。掌机放在中央安全区域，适配系统裁切。页面品牌和“关于”页使用同款图标；游戏版本、游戏启动状态仍使用 tModLoader 图标。

重新导出：`python scripts/design/prepare-launcher-icon.py docs/branding/tml-pocket-launcher/selected/handheld-original.png`。
