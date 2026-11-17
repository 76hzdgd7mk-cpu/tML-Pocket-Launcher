// Original pixel artwork for tML Pocket Launcher. Run from any working directory.
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("../../ui/launcher/node_modules/playwright");

const output = path.resolve(
    __dirname,
    "../../docs/branding/tml-pocket-launcher",
);
const background = "#111c26";
const rect = (x, y, w, h, color) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`;
const shape = (d, color) => `<path d="${d}" fill="${color}"/>`;
const color = (name, fallback) => `var(--${name}, ${fallback})`;
const green = color("leaf", "#9cdb70");
const light = color("light", "#edffd8");
const teal = color("body", "currentColor");
const shadow = color("shadow", "#245457");
const blue = color("blue", "#7fb9e9");
const play = (x, y, fill = light) =>
    shape(`M${x} ${y}h4v4h8v4h8v8h-8v4h-8v4h-4z`, fill);

const concepts = [
    {
        id: "01-pocket-world",
        name: "口袋世界",
        tag: "主推 · Pocket × Terraria",
        description:
            "草地方块收进口袋，中央像素启动符号对应 Launcher。轮廓简洁，小尺寸仍能认出。",
        art:
            shape("M20 36h60v28h-4v8h-8v4h-8v4H40v-4h-8v-4h-8v-8h-4z", teal) +
            shape(
                "M20 36h8v28h4v8h8v4h20v-4h8v-8h4V36h8v28h-4v8h-8v4h-8v4H40v-4h-8v-4h-8v-8h-4z",
                shadow,
            ) +
            shape(
                "M20 28h8v-4h8v4h28v-4h8v4h8v12H68v-4H56v4H40v-4H28v4h-8z",
                green,
            ) +
            rect(28, 28, 8, 4, light) +
            rect(40, 28, 16, 4, light) +
            play(44, 44) +
            rect(76, 16, 4, 4, green),
    },
    {
        id: "02-pocket-p",
        name: "像素 P",
        tag: "字母标 · Pocket",
        description:
            "用厚实的像素 P 形成口袋开口，字腔藏入启动符号。更接近独立工具品牌。",
        art:
            shape("M24 20h40v4h8v4h4v28h-4v8h-8v4H40v12H24z", green) +
            shape("M40 32h20v4h4v16h-4v4H40z", background) +
            shape("M24 60h16v20H24z", teal) +
            play(44, 32) +
            rect(28, 24, 4, 28, light),
    },
    {
        id: "03-pocket-sapling",
        name: "随身树苗",
        tag: "生长 · 探索",
        description:
            "一棵方块树从蓝色口袋里生长，保留 Terraria 的自然气息，形象更亲切。",
        art:
            shape("M44 16h16v4h12v8h4v12h-8v4H36v-4h-8V28h4v-8h12z", green) +
            shape("M36 24h8v-4h12v4H44v8h-8z", light) +
            shape("M48 36h8v24H44v-8h4z", color("wood", "#b78b64")) +
            shape("M24 52h52v16h-4v8H60v4H40v-4H28v-8h-4z", blue) +
            shape("M24 52h52v8H24z", color("blue-lip", "#3f6892")) +
            shape(
                "M32 64h4v8h8v4h16v-4h8v-8h4v8h-4v4h-8v4H40v-4h-8z",
                color("blue-shade", "#4e80ac"),
            ),
    },
    {
        id: "04-mod-tile",
        name: "模组拼片",
        tag: "模组 · 拼接",
        description:
            "阶梯式拼片与启动键合成一个图形，突出 tModLoader 的模组组合能力。",
        art:
            shape(
                "M24 24h20v-8h16v8h16v20h8v16h-8v16H56v8H40v-8H24V56h-8V40h8z",
                teal,
            ) +
            shape("M24 24h20v-8h16v8h16v8H32v12H16v-4h8z", green) +
            shape("M68 44h8v16h-8v8H56v8H40v-8h20v-8h8z", shadow) +
            play(44, 40),
    },
    {
        id: "05-pocket-portal",
        name: "像素传送门",
        tag: "启动 · 进入世界",
        description:
            "像素门框围绕启动键，底部草地承接游戏世界。偏冒险感，紫绿配色更醒目。",
        art:
            shape(
                "M36 20h28v4h8v8h4v40H64V36h-4v-4H40v4h-4v36H24V32h4v-8h8z",
                color("portal", "#ac99e4"),
            ) +
            shape(
                "M36 20h28v4H36v8h-4v32h-4V32h4V24h4z",
                color("portal-light", "#e1d4ff"),
            ) +
            shape("M64 32h8v40h-8z", color("portal-shade", "#6c599e")) +
            play(44, 40) +
            shape("M20 72h16v-4h8v4h16v-4h8v4h12v8H20z", green),
    },
    {
        id: "06-mod-vault",
        name: "口袋模组箱",
        tag: "收藏 · 管理",
        description:
            "口袋化的像素收纳箱，容纳模组和版本。暖铜外框搭配青绿启动键，更有装备感。",
        art:
            shape(
                "M32 20h36v4h8v8h4v40h-4v8H24v-8h-4V32h4v-8h8z",
                color("copper", "#b98b5f"),
            ) +
            shape("M28 32h44v36h-4v4H32v-4h-4z", color("cavity", "#245457")) +
            shape(
                "M32 20h36v4H32v8h-8v-8h8z",
                color("copper-light", "#efcb8b"),
            ) +
            rect(20, 40, 12, 12, color("copper-light", "#efcb8b")) +
            rect(68, 40, 12, 12, color("copper-light", "#efcb8b")) +
            play(44, 36, green) +
            rect(36, 64, 28, 4, teal),
    },
];

function svg(concept, transparent = false) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024" color="#3d8d83" shape-rendering="crispEdges" role="img" aria-label="tML Pocket Launcher · ${concept.name}"><title>tML Pocket Launcher · ${concept.name}</title>${transparent ? "" : rect(0, 0, 100, 100, background)}<g>${concept.art}</g></svg>\n`;
}

const styles = `
:root{color-scheme:dark;--bg:#0c1218;--panel:#131d26;--ink:#eef3f1;--muted:#96a6ae;--line:#29373e;--accent:#b5e78b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.65 'Segoe UI','Microsoft YaHei',sans-serif}
main{max-width:1280px;margin:auto;padding:44px 40px}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:28px}
.eyebrow{font:11px/1.5 Consolas,monospace;letter-spacing:2px;color:var(--accent);margin:0 0 12px}h1{font-size:34px;line-height:1.2;letter-spacing:-1px;font-weight:600;margin:0 0 12px}header p{color:var(--muted);margin:0}.controls{display:flex;gap:6px;flex-wrap:wrap;max-width:250px;justify-content:flex-end}
button,a{font:inherit}button{min-height:44px;padding:0 14px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer}button[aria-pressed=true]{color:var(--accent);border-color:var(--accent)}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:28px}.logo-card{border:1px solid var(--line);background:var(--panel);border-radius:16px;padding:20px;transition:border-color .18s,transform .18s}.logo-card.selected{border-color:#709455}.card-top{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--muted)}.number{font-family:Consolas,monospace}.pick{min-height:36px;padding:0 10px;font-size:11px}
.logo-canvas{display:flex;align-items:center;justify-content:center;height:210px}.app-icon{width:172px;height:172px;border-radius:38px;overflow:hidden;display:block}.app-icon svg{width:100%;height:100%;display:block}.size-previews{display:flex;gap:13px;align-items:center;justify-content:center;height:56px;margin-bottom:12px}.size-previews svg{display:block;width:100%;height:100%;flex-shrink:0}.size-previews span{display:flex;align-items:center;gap:5px;color:var(--muted);font:10px Consolas,monospace}.mini{border-radius:10px;overflow:hidden}.mini.tiny{border-radius:7px}h2{font-size:17px;margin:8px 0 3px;font-weight:600}.tag{font-size:11px;color:var(--accent);margin:0 0 8px}.rationale{font-size:12px;color:var(--muted);margin:0;min-height:60px}.downloads{border-top:1px solid var(--line);margin-top:14px;padding-top:10px;display:flex;gap:20px}a{color:var(--ink);text-decoration:none;font-size:11px;min-height:32px;align-content:center}.downloads a:hover{color:var(--accent)}footer{margin-top:26px;display:flex;justify-content:space-between;gap:18px;color:var(--muted);font-size:11px}
body.light{color-scheme:light;--bg:#f3f3ed;--panel:#fffef9;--ink:#182b2a;--muted:#5e6d70;--line:#d9dfd5;--accent:#436e32}body.round .app-icon,body.round .mini{border-radius:50%}body.mono .logo-canvas svg,body.mono .size-previews svg{--leaf:#e9f2e6;--light:#111c26;--body:#e9f2e6;--shadow:#e9f2e6;--blue:#e9f2e6;--wood:#e9f2e6;--blue-lip:#111c26;--blue-shade:#e9f2e6;--portal:#e9f2e6;--portal-light:#e9f2e6;--portal-shade:#e9f2e6;--copper:#e9f2e6;--copper-light:#e9f2e6;--cavity:#111c26}
@media(hover:hover){.logo-card:hover{transform:translateY(-3px)}}@media(max-width:900px){main{padding:28px 20px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}header{flex-direction:column}.controls{justify-content:flex-start;max-width:none}.rationale{min-height:80px}}@media(max-width:520px){.grid{grid-template-columns:1fr}.rationale{min-height:0}h1{font-size:28px}footer{flex-direction:column}.logo-canvas{height:220px}}@media(prefers-reduced-motion:reduce){.logo-card{transition:none}}
`;

function showcase() {
    const cards = concepts
        .map(
            (
                c,
                index,
            ) => `<article class="logo-card ${index === 0 ? "selected" : ""}" data-id="${c.id}">
    <div class="card-top"><span class="number">0${index + 1} / PIXEL MARK</span><button class="pick" aria-pressed="${index === 0}">${index === 0 ? "当前主推" : "选择此款"}</button></div>
    <div class="logo-canvas"><span class="app-icon">${svg(c)}</span></div>
    <div class="size-previews"><span><span class="mini" style="width:48px;height:48px">${svg(c)}</span>48</span><span><span class="mini tiny" style="width:32px;height:32px">${svg(c)}</span>32</span></div>
    <h2>${c.name}</h2><p class="tag">${c.tag}</p><p class="rationale">${c.description}</p>
    <div class="downloads"><a href="concepts/${c.id}.svg" download>SVG 源文件 ↗</a><a href="exports/${c.id}-1024.png" download>PNG · 1024 ↗</a><a href="concepts/${c.id}-mark.svg" download>透明图形 ↗</a></div>
  </article>`,
        )
        .join("\n");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>tML Pocket Launcher · 像素图标提案</title><style>${styles}</style></head><body><main>
  <header><div><p class="eyebrow">TML POCKET / IDENTITY EXPLORATION</p><h1>把游戏世界，装进口袋。</h1><p>tML Pocket Launcher · 六款原创像素图标 · 4 单位网格</p></div><nav class="controls" aria-label="预览样式"><button id="theme" aria-pressed="false">浅色背景</button><button id="mask" aria-pressed="false">圆形裁切</button><button id="mono" aria-pressed="false">单色对比</button></nav></header>
  <section class="grid" aria-label="六款图标方案">${cards}</section><footer><span id="selection" role="status">推荐：01 口袋世界 · Pocket、像素草地与启动符号。</span><span>SVG + PNG / 离线预览 / 32–1024 px</span></footer></main>
  <script>
  for(const [id,cls] of [['theme','light'],['mask','round'],['mono','mono']])document.getElementById(id).addEventListener('click',function(){const active=document.body.classList.toggle(cls);this.setAttribute('aria-pressed',String(active))});
  document.querySelectorAll('.pick').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.logo-card').forEach(card=>{const active=card.contains(button);card.classList.toggle('selected',active);card.querySelector('.pick').setAttribute('aria-pressed',String(active));card.querySelector('.pick').textContent=active?'已选中':'选择此款'});const card=button.closest('.logo-card');document.getElementById('selection').textContent='当前选择：'+card.querySelector('h2').textContent+' · 可下载 SVG 和 PNG。'}));
  </script></body></html>`;
}

async function main() {
    await fs.mkdir(path.join(output, "concepts"), { recursive: true });
    await fs.mkdir(path.join(output, "exports"), { recursive: true });
    for (const concept of concepts) {
        await fs.writeFile(
            path.join(output, "concepts", `${concept.id}.svg`),
            svg(concept),
        );
        await fs.writeFile(
            path.join(output, "concepts", `${concept.id}-mark.svg`),
            svg(concept, true),
        );
    }
    await fs.writeFile(path.join(output, "index.html"), showcase());
    const browser = await chromium.launch({
        headless: true,
        channel: "msedge",
    });
    try {
        const page = await browser.newPage({ deviceScaleFactor: 1 });
        for (const concept of concepts) {
            for (const size of concept === concepts[0]
                ? [1024, 512, 192, 96, 48, 32]
                : [1024]) {
                await page.setViewportSize({ width: size, height: size });
                await page.setContent(
                    `<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg(concept)}`,
                );
                await page.screenshot({
                    path: path.join(
                        output,
                        "exports",
                        `${concept.id}-${size}.png`,
                    ),
                });
            }
        }
        await page.setViewportSize({ width: 1024, height: 1024 });
        await page.setContent(
            `<style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>${svg(concepts[0], true)}`,
        );
        await page.screenshot({
            path: path.join(
                output,
                "exports",
                "01-pocket-world-transparent.png",
            ),
            omitBackground: true,
        });
        await page.setViewportSize({ width: 1440, height: 1240 });
        await page.setContent(showcase());
        await page.screenshot({
            path: path.join(output, "concept-sheet.png"),
            fullPage: true,
        });
        for (const width of [390, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            if (
                !(await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ))
            )
                throw new Error(`Showcase overflows at ${width}px`);
        }
        for (const id of ["theme", "mask", "mono"]) {
            await page.locator(`#${id}`).click();
            if (
                (await page.locator(`#${id}`).getAttribute("aria-pressed")) !==
                "true"
            )
                throw new Error(`${id} toggle failed`);
        }
        await page.locator(".pick").nth(2).click();
        if (
            (await page.locator(".logo-card.selected").count()) !== 1 ||
            !(await page
                .locator("#selection")
                .textContent()
                .then((text) => text.includes("随身树苗")))
        )
            throw new Error("Concept selection failed");
    } finally {
        await browser.close();
    }
    console.log(
        `Created six SVG concepts, PNG exports and responsive showcase: ${output}`,
    );
    console.log(
        "Verified: 390/768/1440px layouts, preview toggles and concept selection.",
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
