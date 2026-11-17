// Original S1/S7 icon-design: a compact handheld silhouette and a geometric tree.
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("../../ui/launcher/node_modules/playwright");

const root = path.resolve(__dirname, "../..");
const output = path.join(root, "docs/branding/tml-pocket-launcher/minimal-v2");
const ink = "#173D34";
const mint = "#D2ECA8";
const artwork = `<g fill="currentColor">
  <path fill-rule="evenodd" d="M8 3h8a3 3 0 0 1 3 3v10a5 5 0 0 1-5 5H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm-.25 2A.75.75 0 0 0 7 5.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-8.5a.75.75 0 0 0-.75-.75Zm.75 11.5v1h-1v1h1v1h1v-1h1v-1h-1v-1Zm5.75 1a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm2-1a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
  <path d="M10 6.5h4v.75h1.25V8H16v3h-.75v.75H13V14h-2v-2.25H8.75V11H8V8h.75v-.75H10Z"/>
</g>`;

function svg({ background = false, monochrome = false } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" color="${monochrome ? ink : mint}" role="img" aria-label="tML Pocket Launcher"><title>tML Pocket Launcher · 掌机与树</title>${background ? `<path fill="${ink}" d="M0 0h24v24H0z"/>` : ""}${artwork}</svg>`;
}

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>tML Pocket Launcher · 简约图标</title><style>
*{box-sizing:border-box}body{margin:0;background:#F3F3EC;color:#173D34;font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif}main{max-width:1140px;padding:44px 40px;margin:auto}.eyebrow{font:11px Consolas,monospace;letter-spacing:2px;color:#57736a}h1{font-size:30px;letter-spacing:-1px;margin:12px 0 8px}.lead{color:#65736b;margin:0 0 30px}.hero{display:grid;grid-template-columns:1.2fr 1fr;border:1px solid #d6ddd2;border-radius:24px;overflow:hidden}.primary{display:flex;align-items:center;justify-content:center;background:#E8EBDD;padding:40px;min-height:380px}.icon{width:280px;height:280px;border-radius:62px;overflow:hidden;display:block;background:${ink}}svg{width:100%;height:100%;display:block}.detail{padding:34px;background:#fffef8}.detail h2{font-size:19px;margin:0 0 12px}.detail p{font-size:13px;color:#65736b}.sizes{display:flex;align-items:center;gap:24px;margin:28px 0}.sizes div{display:flex;flex-direction:column;gap:9px;font:10px Consolas,monospace;color:#65736b}.small{display:block;border-radius:22%;overflow:hidden;background:${ink}}.round{border-radius:50%}.downloads{display:flex;flex-wrap:wrap;gap:12px}a{min-height:44px;display:inline-flex;align-items:center;color:${ink};font-size:12px;padding:0 14px;border:1px solid #b7c8ad;border-radius:9px;text-decoration:none}a:focus-visible{outline:2px solid ${ink};outline-offset:3px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}.sample{background:#e8b479;padding:24px;border-radius:18px;display:flex;align-items:center;gap:22px}.sample .small{flex-shrink:0}.sample p{font-size:12px;margin:4px 0;color:#624b36}.foot{font-size:11px;color:#65736b;margin-top:20px}.monochrome{display:flex;align-items:center;gap:12px;font-size:12px;margin-top:22px}.monochrome svg{width:48px;height:48px}
@media(max-width:650px){main{padding:24px 18px}.hero,.comparison{grid-template-columns:1fr}.primary{min-height:300px;padding:30px}.icon{width:230px;height:230px;border-radius:50px}.detail{padding:24px}h1{font-size:25px}}
</style></head><body><main><div class="eyebrow">TML POCKET / MINIMAL IDENTITY · 02</div><h1>一台掌机，一棵树。</h1><p class="lead">用清晰轮廓代替设备插画，让桌面上的小图标也能认出来。</p>
<section class="hero"><div class="primary"><span class="icon">${svg({ background: true })}</span></div><div class="detail"><h2>tML Pocket Launcher</h2><p>竖向掌机对应 Pocket；屏幕中的几何树形呼应 Terraria。统一浅绿图形与深绿底色，保留树冠的像素阶梯。</p><div class="sizes">${[96, 48, 32, 24].map((size) => `<div><span class="small" style="width:${size}px;height:${size}px">${svg({ background: true })}</span>${size} PX</div>`).join("")}</div><div class="downloads"><a download href="icon-pocket-handheld.svg">SVG 源文件</a><a download href="pocket-handheld-1024.png">PNG · 1024</a><a download href="pocket-handheld-transparent-1024.png">透明 PNG</a></div><div class="monochrome">${svg({ monochrome: true })}<span>单色轮廓仍完整可辨</span></div></div></section>
<section class="comparison" aria-label="桌面尺寸对比"><div class="sample"><img class="small" src="../selected/pocket-launcher-1024.png" width="80" height="80" alt="原掌机图标"><div><strong>原图 · 80px</strong><p>横向主体，屏幕套着小徽章</p></div></div><div class="sample"><span class="small" style="width:80px;height:80px">${svg({ background: true })}</span><div><strong>简约版 · 80px</strong><p>竖向主体，减少层级与细节</p></div></div></section>
<p class="foot">按 icon-design 的 S1 现代极简 + S7 双色原则直接绘制 SVG。圆形裁切和 24–1024px 导出见同目录文件。当前为设计预览。</p></main></body></html>`;

async function main() {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "icon-pocket-handheld.svg"), svg());
    await fs.writeFile(
        path.join(output, "icon-pocket-handheld-square.svg"),
        svg({ background: true }),
    );
    await fs.writeFile(path.join(output, "index.html"), html);
    const browser = await chromium.launch({
        headless: true,
        channel: "msedge",
    });
    try {
        const page = await browser.newPage({ deviceScaleFactor: 1 });
        for (const size of [1024, 512, 192, 144, 96, 72, 48, 32, 24]) {
            await page.setViewportSize({ width: size, height: size });
            await page.setContent(
                `<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg({ background: true })}`,
            );
            await page.screenshot({
                path: path.join(output, `pocket-handheld-${size}.png`),
            });
        }
        await page.setViewportSize({ width: 1024, height: 1024 });
        await page.setContent(
            `<style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>${svg()}`,
        );
        await page.screenshot({
            path: path.join(output, "pocket-handheld-transparent-1024.png"),
            omitBackground: true,
        });
        await page.setViewportSize({ width: 1140, height: 900 });
        await page.goto(
            `file:///${path.join(output, "index.html").replaceAll("\\", "/")}`,
        );
        await page.screenshot({
            path: path.join(output, "design-preview.png"),
            fullPage: true,
        });
        for (const width of [320, 390, 768, 1140]) {
            await page.setViewportSize({ width, height: 900 });
            if (
                !(await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ))
            )
                throw new Error(`Design preview overflows at ${width}`);
        }
        await page.setViewportSize({ width: 512, height: 512 });
        await page.setContent(
            `<style>html,body{margin:0;background:transparent}.mask{width:512px;height:512px;border-radius:50%;overflow:hidden}svg{width:100%;height:100%;display:block}</style><div class="mask">${svg({ background: true })}</div>`,
        );
        await page.screenshot({
            path: path.join(output, "pocket-handheld-round-512.png"),
            omitBackground: true,
        });
    } finally {
        await browser.close();
    }
    console.log(
        "Created minimalist SVG, transparent PNG, nine sizes and round-mask preview.",
    );
    console.log("Verified preview layout at 320, 390, 768 and 1140px.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
