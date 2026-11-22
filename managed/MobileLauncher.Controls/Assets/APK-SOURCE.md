# 移动版素材来源与重新生成

启动器基于 MobileJoystick 0.1.6 的 `e2b1df8` 适配。Android 资源转换器读取已安装的 Terraria APK，按 `APK-SPRITES.json` 生成预乘透明度的 `.rawimg`，与游戏资源一同保存到 `mobile-controls` 目录。默认控件纹理包的映射、偏移和缩放来自 `TexturePacks/AndroidMobileControls.json`。

## 上游素材说明（2026-11-18）

控件素材改为独立的 `TexturePacks/AndroidMobileControls.zip`，保留全部逻辑名称并按内容去重。旧 `MobileControls/` 及松散包目录不再存放在项目中。其余界面相同 PNG 通过 `asset-aliases.json` 共用；原 `APK-SPRITES.json` 保留所有语义名的原始生成配方与来源。`sync_apk_assets.py` 现在识别别名并在应用后重新去重，不会重建旧控件目录。控件 ZIP 用 `tools/import_control_texture_pack.py` 从 Android 素材目录生成，详见项目 README。以下数量是素材核对时的历史统计。

本轮核对 `Assets` 下全部 **276 张 PNG**，其中 **219 张更新、57 张原样保留**。来源为用户提供的 `tailaruiya.apk`，原始图像属于 Terraria 及移动版的相应权利人。

## 本轮更新

- 摇杆底座、摇杆头、瞄准模式、跳跃、抓钩、坐骑、药水、缩放等按钮以原生像素尺寸输出，替代截图裁切和预先放大的版本。
- 暂停菜单与设置页签使用原始精灵或原始底板与图标的组合，移除截入的菜单背景。相应精灵映射和组合规则覆盖全部 PNG。
- 背包、物品栏、地图、聊天与编辑器素材按 APK 中的精灵哈希重新定位，保留选中、收藏、按下等状态。防御图标只保留首个盾牌，排除相邻状态。
- 所有输出按 `RGB * alpha // 255` 预乘透明度，避免 tModLoader 的 `AlphaBlend` 出现亮边或不透明角落。
- 按下的圆形按钮与普通按钮使用同为 52×52 的原始材质。瞄准模式按钮的运行时绘制只叠加图标。

**更新数量包含颜色、透明像素、尺寸和组合方式的变化，不代表 219 张素材都各自存在可见错误。**

## 提取

依赖 Python、UnityPy、numpy 和 Pillow：

```powershell
python tools/extract_apk_ui.py D:/Downloads/tailaruiya.apk D:/Downloads/tailaruiya-extracted
```

输出包含完整的 `apk/` 解包目录、`ui-high/` 和 `ui-low/` 各 46 张解码后的 UI 图集，以及精灵元数据和校验清单。高分辨率有 1700 条精灵记录，低分辨率有 1699 条。图集输出为普通直通透明度 PNG。

提取脚本使用 APK `ResourceManager` 的完整资源路径选择对应分辨率，避免同名图集或调色板混淆。索引色与独立 alpha 的解码遵循 APK 的 `XNA/EffectSprite` GLES 着色器；其中的 `.99` 调色板 UV 上限属于原版算法。

资源 bundle 的 SHA-256：

```text
82189edb50c84944f23267a9de724ccb440c690f5313f99747714956f45dbe21
```

## 重建与验证

```powershell
# 写入原始精灵及分层组合，统一预乘透明度
python tools/sync_apk_assets.py D:/Downloads/tailaruiya-extracted --apply

# 只核对，发现任何缺失或像素差异就以非零状态退出
python tools/sync_apk_assets.py D:/Downloads/tailaruiya-extracted
```

`APK-SPRITES.json` 是所有素材的唯一生成映射，包括精灵哈希、相对裁切区域、底板和图标组合、状态色和少量派生蒙版。原始精灵颜色保持来源值；选中金边、灰色聊天面板、不同菜单状态色属于明确记录的派生组合。

`MobileInventory/SlotShop` 从普通 `Slot` 的同一精灵 `3251BC48` 派生，只将边框／填充替换为深橄榄色／黄绿色。尺寸、透明轮廓和边框宽度完全相同；商店不再使用装备格 `SlotGreen` 的高光斜面。商品、购买、出售和关闭商店按钮共用该配色，其他绿色装备格保持原样。

报告默认位于 `obj/apk-textures/comparison/`，包含像素校验、尺寸和更改前后对比图。APK、原始图集和报告留在提取目录或 `obj`，不会进入正式模组包。四个旧 `prepare_*_assets.py` 入口也使用同一映射，接受相同参数。
