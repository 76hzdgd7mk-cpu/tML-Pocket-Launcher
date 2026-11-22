"""Convert Terraria Android images, fonts and sound effects to desktop XNB files."""

import argparse
import csv
import io
import json
from collections import Counter
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import struct
import tempfile
import wave
from zipfile import ZipFile
from zlib import crc32

import UnityPy
from PIL import Image, ImageMath
from mobile_terraria_xact import MUSIC_FILES, build_music_bank


DATA_DIR = "assets/bin/Data"
UNITY_FILES = ("data.unity3d", "resources.resource", "unity default resources")
DESKTOP_EFFECTS = ("PixelShader.xnb", "ScreenShader.xnb", "TileShader.xnb")
XNA_READER = "Microsoft.Xna.Framework.Content."


@dataclass(frozen=True)
class SpriteRegion:
    sheet: str
    bounds: tuple[int, int, int, int]
    divisor: int
    frame_size: tuple[int, int] | None = None
    frames: tuple[tuple[int, ...], ...] = ()


def no_progress(stage, current, total):
    pass


@contextmanager
def unity_data(source, workspace=None, progress=no_progress):
    if isinstance(source, Path) and source.is_dir():
        for candidate in (source, source / DATA_DIR, source / "apk" / DATA_DIR):
            if (candidate / UNITY_FILES[0]).is_file() and (candidate / UNITY_FILES[1]).is_file():
                yield candidate
                return
        raise ValueError("Could not locate the Unity bundle and resource stream in the extracted APK")

    archives = (source,) if isinstance(source, Path) else source
    with tempfile.TemporaryDirectory(prefix="terraria-unity-", dir=workspace) as temp, ExitStack() as stack:
        apks = [stack.enter_context(ZipFile(archive)) for archive in archives]
        root = Path(temp)
        for index, name in enumerate(UNITY_FILES):
            progress("extract", index, len(UNITY_FILES))
            entry = f"{DATA_DIR}/{name}"
            apk = next((archive for archive in apks if entry in archive.namelist()), None)
            if apk is None:
                if index < 2:
                    raise ValueError(f"APK is missing {name}") from None
                continue
            with apk.open(entry) as src, (root / name).open("wb") as dst:
                while chunk := src.read(1024 * 1024):
                    progress("extract", index, len(UNITY_FILES))
                    dst.write(chunk)
        yield root


def seven_bit(value):
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return result


def write_xnb(path, readers, payload):
    header = seven_bit(len(readers))
    for reader in readers:
        name = reader.encode("ascii")
        header += seven_bit(len(name)) + name + bytes(4)
    # Zero shared resources, and a root object of reader type 1.
    body = header + b"\x00\x01" + payload
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"XNBw\x05\x00" + struct.pack("<I", 10 + len(body)) + body)


def texture_payload(image):
    image = image.convert("RGBA")
    red, green, blue, alpha = image.split()
    # UnityPy returns straight alpha. FNA's AlphaBlend uses premultiplied RGBA.
    mask = alpha.convert("I")
    channels = [
        ImageMath.lambda_eval(
            lambda args: args["channel"] * args["alpha"] / 255,
            channel=band.convert("I"),
            alpha=mask,
        ).convert("L")
        for band in (red, green, blue)
    ]
    pixels = Image.merge("RGBA", (*channels, alpha)).tobytes()
    return struct.pack("<5I", 0, image.width, image.height, 1, len(pixels)) + pixels


def atlas_regions(assets):
    regions = {}
    record = struct.Struct("<I9H")
    for path, pointer in assets.items():
        if not path.startswith("content/packedimages/") or pointer.type.name != "TextAsset":
            continue
        metadata = pointer.read().m_Script.encode("utf-8", "surrogateescape")
        version, layout, sheet_count = struct.unpack_from("<3H", metadata)
        if version != 0 or layout not in (2, 3):
            continue
        count_offset = 6 + sheet_count * (4 if layout == 2 else 6)
        count, = struct.unpack_from("<I", metadata, count_offset)
        offset = count_offset + 4
        for _ in range(count):
            if offset + record.size > len(metadata):
                break
            sprite, sheet, _, width, height, x, y, divisor, frame_width, frame_height = (
                record.unpack_from(metadata, offset)
            )
            offset += record.size
            if sheet >= sheet_count or divisor not in (1, 2, 4) or not width or not height:
                break
            sheet_path = f"{path}{sheet + 1}"
            frame_size = None
            frames = ()
            if (frame_width, frame_height) != (65535, 65535):
                mode = metadata[offset:offset + 1]
                if not frame_width or not frame_height or mode not in (b"\x00", b"\x01"):
                    break
                columns = (width * divisor + frame_width - 1) // frame_width
                rows = (height * divisor + frame_height - 1) // frame_height
                frame = struct.Struct("<2h4H" if mode == b"\x01" else "<2h2H")
                offset += 1
                end = offset + frame.size * rows * columns
                if end > len(metadata):
                    break
                frames = tuple(frame.iter_unpack(metadata[offset:end]))
                frame_size = frame_width, frame_height
                offset = end
            regions.setdefault(sprite, []).append(
                SpriteRegion(sheet_path, (x, y, width, height), divisor, frame_size, frames)
            )
    return regions


def atlas_image(assets, path):
    image = assets[path].read().image.convert("RGBA")
    palette_asset = assets.get(path + "_p")
    alpha_asset = assets.get(path + "_a")
    if palette_asset:
        palette = palette_asset.read().image.convert("RGBA")
        indices = image.getchannel("A")
        columns = (image.width + 255) // 256
        rows = (image.height + 255) // 256

        def apply_palette(indexed, row):
            colors = palette.crop((0, row, 256, row + 1)).split()
            return Image.merge("RGBA", tuple(indexed.point(list(band.tobytes())) for band in colors))

        if palette.size == (256, 1):
            image = apply_palette(indices, 0)
        elif palette.size == (256, rows * columns):
            for row in range(rows):
                for col in range(columns):
                    x, y = col * 256, row * 256
                    tile = indices.crop((x, y, min(x + 256, image.width), min(y + 256, image.height)))
                    image.paste(apply_palette(tile, row * columns + columns - 1 - col), (x, y))
        else:
            raise ValueError(f"Unsupported atlas palette size for {path}")
    if alpha_asset:
        image.putalpha(alpha_asset.read().image.getchannel("A"))
    return image


def unpack_sprite(image, region):
    x, y, width, height = region.bounds
    divisor = region.divisor
    size = width * divisor, height * divisor
    if region.frame_size is None:
        if x + width > image.width or y + height > image.height:
            raise ValueError(f"Out-of-range atlas crop in {region.sheet}")
        cropped = image.crop((x, y, x + width, y + height))
        return cropped.resize(size, Image.Resampling.NEAREST) if divisor > 1 else cropped

    output = Image.new("RGBA", size)
    frame_width, frame_height = region.frame_size
    columns = (size[0] + frame_width - 1) // frame_width
    for index, (dx, dy, sx, sy, *edge) in enumerate(region.frames):
        if (dx, dy) == (-100, -100):
            continue
        if edge:
            right, bottom = edge
        else:
            right = sx + (frame_width + divisor - 1) // divisor
            bottom = sy + (frame_height + divisor - 1) // divisor
        if not (sx < right <= image.width - x and sy < bottom <= image.height - y):
            raise ValueError(f"Out-of-range atlas frame in {region.sheet}")
        frame = image.crop((x + sx, y + sy, x + right, y + bottom))
        if divisor > 1:
            frame = frame.resize((frame.width * divisor, frame.height * divisor), Image.Resampling.NEAREST)
        col, row = index % columns, index // columns
        left, top = col * frame_width - dx, row * frame_height - dy
        # Edge cells can be partial. Keep each blit inside its own logical frame.
        crop_left = max(0, col * frame_width - left)
        crop_top = max(0, row * frame_height - top)
        crop_right = min(frame.width, min((col + 1) * frame_width, size[0]) - left)
        crop_bottom = min(frame.height, min((row + 1) * frame_height, size[1]) - top)
        if crop_left < crop_right and crop_top < crop_bottom:
            output.paste(frame.crop((crop_left, crop_top, crop_right, crop_bottom)),
                         (left + crop_left, top + crop_top))
    return output


def font_payload(assets, path):
    blob = assets[path].read().m_Script.encode("utf-8", "surrogateescape")
    pages, count = struct.unpack_from("<BI", blob)
    glyph = struct.Struct("<8iH3fB")
    if not pages or len(blob) != 5 + count * glyph.size + 11:
        raise ValueError("Unsupported font metadata")
    line_spacing, spacing, has_default, fallback = struct.unpack_from("<if?H", blob, len(blob) - 11)
    glyphs = [[] for _ in range(pages)]
    for entry in glyph.iter_unpack(blob[5:-11]):
        if entry[-1] >= pages:
            raise ValueError("Font glyph references a missing page")
        glyphs[entry[-1]].append(entry)
    payload = bytearray(struct.pack("<fi", spacing, line_spacing))
    payload.extend(chr(fallback if has_default else 0).encode("utf-8"))
    payload.extend(struct.pack("<I", pages))
    for index, entries in enumerate(glyphs, 1):
        alpha = assets[f"{path}_{index}_a"].read().image.getchannel("A")
        for x, y, width, height, *_ in entries:
            if min(x, y, width, height) < 0 or x + width > alpha.width or y + height > alpha.height:
                raise ValueError("Font glyph exceeds its atlas page")
        # The mobile fonts store white glyphs in their full-resolution alpha maps.
        payload.extend(b"\x02" + texture_payload(Image.merge("RGBA", (
            Image.new("L", alpha.size, 255), Image.new("L", alpha.size, 255),
            Image.new("L", alpha.size, 255), alpha,
        ))))
        for reader_index, items in (
            (3, (struct.pack("<4i", *entry[:4]) for entry in entries)),
            (3, (struct.pack("<4i", *entry[4:8]) for entry in entries)),
            (4, (chr(entry[8]).encode("utf-8") for entry in entries)),
            (5, (struct.pack("<3f", *entry[9:12]) for entry in entries)),
        ):
            payload.extend(bytes((reader_index,)) + struct.pack("<I", len(entries)))
            for item in items:
                payload.extend(item)
    return payload


def desktop_audio(clip):
    samples = list(clip.samples.values())
    if len(samples) != 1:
        raise ValueError(f"Expected one PCM sample, found {len(samples)}")
    return samples[0]


def sound_payload(clip, decode_audio):
    with wave.open(io.BytesIO(decode_audio(clip)), "rb") as audio:
        channels, rate, sample_width, frames = (
            audio.getnchannels(), audio.getframerate(), audio.getsampwidth(), audio.getnframes()
        )
        if channels not in (1, 2) or sample_width != 2:
            raise ValueError(f"Unsupported PCM format ({channels} channels, {sample_width * 8} bits)")
        pcm = audio.readframes(frames)
    block_align = channels * sample_width
    fmt = struct.pack("<IHHIIHH", 16, 1, channels, rate, rate * block_align, block_align, 16)
    return fmt + struct.pack("<I", len(pcm)) + pcm + struct.pack("<III", 0, 0, frames * 1000 // rate)


def read_image_layout(path):
    with path.open("rb") as stream:
        utf16 = stream.read(2) in (b"\xff\xfe", b"\xfe\xff")
    layout = {}
    with path.open(encoding="utf-16" if utf16 else "utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            asset = Path(row["Path"] + ".xnb")
            if not asset.parts or asset.parts[0] != "Images" or ".." in asset.parts:
                raise ValueError(f"Invalid texture path in layout: {asset}")
            layout[asset] = int(row["Width"]), int(row["Height"])
    if not layout:
        raise ValueError("The tModLoader image layout is empty")
    return layout


def convert(source, reference, output, image_layout, texture_fallback=None, tml_content=None):
    image_dimensions = read_image_layout(image_layout) if image_layout else {}
    files = {
        folder: [file.relative_to(reference) for file in (reference / folder).rglob("*.xnb")]
        for folder in ("Images", "Sounds", "Fonts")
    }
    if not all(files.values()):
        raise ValueError("The reference must be a desktop Terraria Content directory")
    required = sorted([
        *(image_dimensions or files["Images"]),
        *files["Sounds"],
        *files["Fonts"],
    ])
    return convert_content(source, reference, output, required, image_dimensions,
                           texture_fallback, tml_content, image_layout=image_layout)


def convert_content(source, reference, output, required, image_dimensions, texture_fallback=None,
                    tml_content=None, *, decode_audio=desktop_audio, progress=no_progress, image_layout=None,
                    workspace=None, sheet_cache=16):
    with unity_data(source, workspace, progress) as data, ExitStack() as files:
        fallback = files.enter_context(ZipFile(texture_fallback)) if texture_fallback else None
        fallback_names = set(fallback.namelist()) if fallback else set()
        environment = UnityPy.Environment()
        for name in UNITY_FILES:
            file = data / name
            if file.is_file():
                environment.load_file(files.enter_context(file.open("rb")), name=name)
        manager = next(obj.read() for obj in environment.objects if obj.type.name == "ResourceManager")
        assets = {name: pointer for name, pointer in manager.m_Container if pointer.m_PathID}
        regions = atlas_regions(assets)

        @lru_cache(maxsize=sheet_cache)
        def sheet(path):
            return atlas_image(assets, path)

        converted = Counter()
        image_sources = Counter()
        filled_textures = []
        missing = []
        desktop_effects = []
        music_tracks = 0
        for index, path in enumerate(required):
            progress("assets", index, len(required))
            name = path.as_posix()
            mobile_path = "content/" + path.with_suffix("").as_posix().lower()
            asset = assets.get(mobile_path)
            try:
                if path.parts[0] == "Images":
                    if asset and asset.type.name == "Texture2D":
                        image = asset.read().image
                        image_source = "direct"
                    else:
                        relative_name = path.relative_to("Images").with_suffix(".png").as_posix()
                        relative_id = crc32(relative_name.lower().encode("utf-8"))
                        basename_id = crc32((path.stem.lower() + ".png").encode("utf-8"))
                        entries = regions.get(relative_id) or regions.get(basename_id, [])
                        expected = image_dimensions.get(path)
                        if len(entries) > 1 and expected:
                            entries = [entry for entry in entries if (
                                entry.bounds[2] * entry.divisor, entry.bounds[3] * entry.divisor
                            ) == expected]
                        if len(entries) != 1:
                            raise ValueError("No unique atlas entry with a supported layout")
                        region = entries[0]
                        image = unpack_sprite(sheet(region.sheet), region)
                        image_source = "atlas"
                    expected = image_dimensions.get(path)
                    if expected and image.size != expected:
                        raise ValueError(f"Texture dimensions {image.size} do not match {expected}")
                    write_xnb(output / "Content" / path, [XNA_READER + "Texture2DReader"], texture_payload(image))
                    image_sources[image_source] += 1
                elif path.parts[0] == "Sounds" and asset and asset.type.name == "AudioClip":
                    write_xnb(output / "Content" / path, [XNA_READER + "SoundEffectReader"],
                              sound_payload(asset.read(), decode_audio))
                elif path.parts[0] == "Fonts" and asset and asset.type.name == "TextAsset":
                    readers = [
                        "ReLogic.Graphics.DynamicSpriteFontReader, ReLogic",
                        XNA_READER + "Texture2DReader",
                        XNA_READER + "ListReader`1[[Microsoft.Xna.Framework.Rectangle, FNA]]",
                        XNA_READER + "ListReader`1[[System.Char, mscorlib]]",
                        XNA_READER + "ListReader`1[[Microsoft.Xna.Framework.Vector3, FNA]]",
                        XNA_READER + "RectangleReader",
                        XNA_READER + "CharReader",
                        XNA_READER + "Vector3Reader",
                    ]
                    write_xnb(output / "Content" / path, readers, font_payload(assets, mobile_path))
                else:
                    missing.append({"path": name, "reason": "no compatible direct conversion"})
                    continue
                converted[path.parts[0]] += 1
            except (ValueError, RuntimeError, wave.Error, EOFError, NotImplementedError, KeyError) as error:
                if path.parts[0] == "Images" and name in fallback_names:
                    data = fallback.read(name)
                    if len(data) < 10 or data[:3] != b"XNB" or int.from_bytes(data[6:10], "little") != len(data):
                        raise ValueError(f"Invalid XNB fallback texture: {name}") from error
                    destination = output / "Content" / path
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(data)
                    filled_textures.append(name)
                    continue
                missing.append({"path": name, "reason": str(error)})

        sheet.cache_clear()
        content = output / "Content"
        for name in DESKTOP_EFFECTS:
            effect = (tml_content or reference) / name
            if not effect.is_file():
                missing.append({"path": name, "reason": "Target installation has no compiled effect"})
                continue
            data = effect.read_bytes()
            if len(data) < 10 or data[:3] != b"XNB" or int.from_bytes(data[6:10], "little") != len(data):
                raise ValueError(f"Invalid compiled effect: {effect}")
            content.mkdir(parents=True, exist_ok=True)
            (content / name).write_bytes(data)
            desktop_effects.append(str(effect))

        try:
            music_tracks = build_music_bank(assets, reference, content, decode_audio, progress)
        except (FileNotFoundError, ValueError) as error:
            for name in MUSIC_FILES:
                (content / name).unlink(missing_ok=True)
                missing.append({"path": name, "reason": str(error)})

    report = {
        "source": str(source),
        "reference": str(reference),
        "image_layout": str(image_layout) if image_layout else None,
        "required_files": len(required) + len(DESKTOP_EFFECTS) + len(MUSIC_FILES),
        "converted": dict(converted),
        "image_sources": dict(image_sources),
        "fallback_textures": filled_textures,
        "desktop_effects": desktop_effects,
        "music_tracks_from_apk": music_tracks,
        "xact_metadata_from_reference": list(MUSIC_FILES[:2]) if music_tracks else [],
        "missing": missing,
        "complete": not missing,
    }
    (output / "conversion-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Terraria APK or extracted APK directory")
    parser.add_argument("reference", type=Path, help="Desktop Terraria Content directory used as a file inventory")
    parser.add_argument("output", type=Path, help="New directory for converted content and report")
    parser.add_argument("--image-layout", type=Path, help="Target tModLoader ResourcePacksDefaultInfo.tsv")
    parser.add_argument("--texture-fallback", type=Path, help="ZIP of missing desktop XNB textures")
    parser.add_argument("--tml-content", type=Path, help="Target tModLoader Content directory for compiled effects")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() or not output.parent.is_dir():
        parser.error("Output must be a new directory under an existing parent")
    with tempfile.TemporaryDirectory(prefix=".mobile-content-", dir=output.parent) as temp:
        staged = Path(temp) / "result"
        staged.mkdir()
        report = convert(args.source.resolve(), args.reference.resolve(), staged, args.image_layout,
                         args.texture_fallback, args.tml_content.resolve() if args.tml_content else None)
        staged.rename(output)
    print(f"Converted {report['converted']}, filled {len(report['fallback_textures'])} textures, "
          f"rebuilt {report['music_tracks_from_apk']} music tracks, missing {len(report['missing'])}.")
    print(output / "conversion-report.json")
    return 0 if report["complete"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
