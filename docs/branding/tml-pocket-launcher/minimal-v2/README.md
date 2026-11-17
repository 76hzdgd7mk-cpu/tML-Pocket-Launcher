# tML Pocket Launcher · 简约掌机图标

针对用户桌面截图中的问题重做：原图是扁长掌机，内部包含多层边框和小徽章，缩小后树形难以辨认。简约版用竖向掌机扩大视觉面积，将树形直接融入屏幕，移除齿轮、材质、阴影和多层外框。

采用用户指定的 [icon-design 技能](https://github.com/Damond-Fung/icon-design-skill/blob/main/SKILL.md)，结合 S1 现代极简和 S7 双色规范。直接绘制可编辑 SVG，PNG 从相同 SVG 渲染；没有调用图像生成模型。

- 主色：深绿 `#173D34`、浅绿 `#D2ECA8`。
- 图形：24×24 viewBox；圆角掌机、大面积屏幕、阶梯树冠和精简控制键。
- `icon-pocket-handheld.svg`：透明底矢量图形，使用 `currentColor`。
- `icon-pocket-handheld-square.svg`：含品牌底色的完整图标。
- `pocket-handheld-transparent-1024.png`：透明图形。
- `pocket-handheld-{size}.png`：1024、512、192、144、96、72、48、32、24px。
- `pocket-handheld-round-512.png`：圆形裁切预览。
- `design-preview.png` / `index.html`：与旧版在相同尺寸下比较。

执行 `node scripts/design/generate-minimal-icon.cjs` 可重新导出。此目录为设计预览，尚未替换设备上的 0.1.12 图标。
