"""Export the user-selected gear/tree artwork for Android, the UI and GitHub."""

from collections import deque
from pathlib import Path
import argparse
import shutil

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "docs/branding/tml-pocket-launcher/current"


def centered(art, canvas_size, art_size, background):
    canvas = Image.new("RGBA", (canvas_size, canvas_size), background)
    scaled = art.resize((art_size, art_size), Image.Resampling.NEAREST)
    offset = (canvas_size - art_size) // 2
    canvas.alpha_composite(scaled, (offset, offset))
    return canvas


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    BRAND.mkdir(parents=True, exist_ok=True)
    original = BRAND / "gear-tree-original.jpg"
    if args.source.resolve() != original.resolve():
        shutil.copyfile(args.source, original)
    art = Image.open(original).convert("RGBA")
    if art.width != art.height:
        raise ValueError("The selected gear/tree artwork must be square")

    # Remove only the connected exterior white surround. The black outline,
    # gear highlights and enclosed white center retain the supplied pixels.
    pixels = art.load()
    visited = set()
    queue = deque([(0, 0)])
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or not (0 <= x < art.width and 0 <= y < art.height):
            continue
        visited.add((x, y))
        red, green, blue, _ = pixels[x, y]
        if min(red, green, blue) < 225 or max(red, green, blue) - min(red, green, blue) > 22:
            continue
        pixels[x, y] = (red, green, blue, 0)
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    art = art.crop(art.getbbox())
    art.save(BRAND / "gear-tree-cutout.png")

    # 64dp artwork on the 108dp adaptive canvas fits Android's circular safe
    # area. White backing preserves the user's supplied appearance.
    foreground = centered(art, 864, 512, (0, 0, 0, 0))
    foreground.save(ROOT / "android/app/src/main/res/drawable-nodpi/pocket_launcher_foreground.png")
    icon = centered(art, 1024, 896, "white").convert("RGB")
    icon.save(BRAND / "pocket-launcher-1024.png")
    for size in (512, 192, 96, 48):
        icon.resize((size, size), Image.Resampling.NEAREST).save(BRAND / f"pocket-launcher-{size}.png")
    icon.resize((256, 256), Image.Resampling.NEAREST).save(ROOT / "ui/launcher/public/pocket-launcher.png")

    sheet = Image.new("RGB", (840, 320), "#e9ecef")
    adaptive = Image.new("RGBA", (864, 864), "white")
    adaptive.alpha_composite(foreground)
    viewport = adaptive.crop((144, 144, 720, 720))
    for x, size, round_mask in ((24, 256, False), (308, 256, True), (640, 80, True)):
        preview = viewport.resize((size, size), Image.Resampling.NEAREST)
        mask = Image.new("L", (size, size))
        draw = ImageDraw.Draw(mask)
        if round_mask:
            draw.ellipse((0, 0, size - 1, size - 1), fill=255)
        else:
            draw.rounded_rectangle((0, 0, size - 1, size - 1), size // 5, fill=255)
        sheet.paste(preview.convert("RGB"), (x, (320 - size) // 2), mask)
    sheet.save(BRAND / "android-icon-preview.png")
    print("Exported gear/tree artwork, adaptive foreground, UI icon, README icons and mask preview.")


if __name__ == "__main__":
    main()
