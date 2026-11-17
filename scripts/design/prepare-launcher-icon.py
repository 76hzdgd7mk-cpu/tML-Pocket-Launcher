"""Export the user-selected handheld artwork for Android and the launcher UI."""

from pathlib import Path
import argparse
import shutil

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "docs/branding/tml-pocket-launcher/selected"
BACKGROUND = "#192637"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    BRAND.mkdir(parents=True, exist_ok=True)
    saved_source = BRAND / "handheld-original.png"
    if args.source.resolve() != saved_source.resolve():
        shutil.copyfile(args.source, saved_source)
    source = Image.open(saved_source).convert("RGBA")
    if source.size != (1536, 1536):
        raise ValueError("The selected artwork must be the original 1536x1536 image")

    # Trace the outside of the supplied device only; preserve all interior pixels.
    # This excludes the generated white surround, baked corner mask and watermark.
    outline = [
        (194, 548), (200, 516), (212, 488), (240, 462), (278, 447),
        (442, 447), (442, 440), (464, 440), (464, 435), (530, 435),
        (530, 441), (568, 447), (1236, 447), (1280, 460), (1310, 486),
        (1334, 520), (1345, 558), (1345, 978), (1334, 1012),
        (1310, 1042), (1280, 1063), (1244, 1076), (282, 1076),
        (246, 1066), (218, 1044), (202, 1016), (194, 982),
    ]
    mask = Image.new("L", source.size)
    ImageDraw.Draw(mask).polygon(outline, fill=255)
    source.putalpha(mask)
    device = source.crop(mask.getbbox())
    device.save(BRAND / "handheld-cutout.png")

    # Android adaptive icons use a 108dp canvas. The 64dp-wide device fits
    # the central safe area with room for both circular and squircle masks.
    foreground = Image.new("RGBA", (864, 864))
    device_width = 512
    device_height = round(device.height * device_width / device.width)
    scaled = device.resize((device_width, device_height), Image.Resampling.NEAREST)
    foreground.alpha_composite(scaled, ((864 - device_width) // 2, (864 - device_height) // 2))
    foreground.save(ROOT / "android/app/src/main/res/drawable-nodpi/pocket_launcher_foreground.png")

    icon = Image.new("RGBA", (1024, 1024), BACKGROUND)
    device_width = 820
    device_height = round(device.height * device_width / device.width)
    icon.alpha_composite(
        device.resize((device_width, device_height), Image.Resampling.NEAREST),
        ((1024 - device_width) // 2, (1024 - device_height) // 2),
    )
    icon.convert("RGB").save(BRAND / "pocket-launcher-1024.png")
    icon.resize((256, 256), Image.Resampling.NEAREST).save(ROOT / "ui/launcher/public/pocket-launcher.png")

    sheet = Image.new("RGB", (1000, 400), "#eef0ed")
    for index, kind in enumerate(["square", "round", "small"]):
        size = 288 if kind != "small" else 96
        preview = Image.new("RGBA", (864, 864), BACKGROUND)
        preview.alpha_composite(foreground)
        # Typical adaptive icon viewport is the center 72 of the 108dp canvas.
        preview = preview.crop((144, 144, 720, 720)).resize((size, size), Image.Resampling.NEAREST)
        clip = Image.new("L", (size, size))
        draw = ImageDraw.Draw(clip)
        if kind == "round":
            draw.ellipse((0, 0, size - 1, size - 1), fill=255)
        else:
            draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=255)
        preview.putalpha(clip)
        sheet.paste(preview, (28 + index * 330, (360 - size) // 2), preview)
    sheet.save(BRAND / "android-icon-preview.png")
    print("Exported original, cutout, adaptive foreground, UI icon and mask previews.")


if __name__ == "__main__":
    main()
