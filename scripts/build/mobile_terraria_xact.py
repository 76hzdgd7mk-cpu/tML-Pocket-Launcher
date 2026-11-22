"""Rebuild a Terraria streaming XACT wave bank with mobile music."""

import io
import re
import struct
import wave


BANK_NAME = "Wave Bank"
SETTINGS = "TerrariaMusic.xgs"
SOUND_BANK = "Sound Bank.xsb"
WAVE_BANK = "Wave Bank.xwb"
MUSIC_FILES = (SETTINGS, SOUND_BANK, WAVE_BANK)
ALIGNMENT = 2048
WAVE_HEADER = struct.Struct("<4s12I")
BANK_HEADER = struct.Struct("<II64sIIIIQ")
ENTRY = struct.Struct("<6I")


def music_cue_order(sound_bank):
    # Mirrors the simple-cue and single-wave records in FAudio's FACT parser.
    if len(sound_bank) < 138 or struct.unpack_from("<4sHH", sound_bank) != (b"SDBK", 46, 43):
        raise ValueError("Unsupported XACT sound bank header")
    simple, complex_ = struct.unpack_from("<HH", sound_bank, 19)
    bank_count, sound_count = struct.unpack_from("<BH", sound_bank, 27)
    cue_offset, _, _, _, _, _, bank_offset, _, names_offset, sounds_offset = (
        struct.unpack_from("<10I", sound_bank, 34)
    )
    if not simple or complex_ or bank_count != 1 or simple != sound_count:
        raise ValueError("Expected a single wave bank with simple music cues")
    if sound_bank[bank_offset:bank_offset + 64].split(b"\0", 1)[0] != BANK_NAME.encode("ascii"):
        raise ValueError("Unexpected XACT wave bank name")
    if not (138 <= bank_offset <= sounds_offset <= cue_offset <= names_offset <= len(sound_bank)
            and cue_offset + 5 * simple <= names_offset
            and names_offset + 6 * simple <= len(sound_bank)):
        raise ValueError("Invalid XACT sound bank offsets")
    order = [0] * simple
    for index in range(simple):
        cue_flags, sound_offset = struct.unpack_from("<BI", sound_bank, cue_offset + 5 * index)
        name_offset, = struct.unpack_from("<I", sound_bank, names_offset + 6 * index)
        name_end = sound_bank.find(b"\0", name_offset)
        name = sound_bank[name_offset:name_end] if name_end >= name_offset else b""
        match = re.fullmatch(rb"Music_([1-9][0-9]*)", name)
        if (cue_flags != 4 or not match or not sounds_offset <= sound_offset <= cue_offset - 12
                or sound_bank[sound_offset] & 1):
            raise ValueError(f"Unsupported XACT music cue at index {index}")
        slot, bank = struct.unpack_from("<HB", sound_bank, sound_offset + 9)
        if bank != 0 or slot >= simple or order[slot]:
            raise ValueError(f"Invalid XACT wave slot for {name!r}")
        order[slot] = int(match[1])
    if len(set(order)) != simple:
        raise ValueError("Duplicate XACT music cue names")
    return order


def read_music(pointer, decode_audio):
    with wave.open(io.BytesIO(decode_audio(pointer.read())), "rb") as audio:
        channels = audio.getnchannels()
        rate = audio.getframerate()
        frames = audio.getnframes()
        if channels not in (1, 2) or audio.getsampwidth() != 2 or not (
            0 < rate < 1 << 18 and 0 < frames < 1 << 28
        ):
            raise ValueError("Unsupported music PCM format")
        pcm = audio.readframes(frames)
    if len(pcm) != frames * channels * 2:
        raise ValueError("Truncated music PCM data")
    return channels, rate, frames, pcm


def align(size):
    return (size + ALIGNMENT - 1) // ALIGNMENT * ALIGNMENT


def build_music_bank(assets, reference, content, decode_audio, progress):
    settings = (reference / SETTINGS).read_bytes()
    sound_bank = (reference / SOUND_BANK).read_bytes()
    if len(settings) < 77 or struct.unpack_from("<4sHH", settings) != (b"XGSF", 46, 42):
        raise ValueError("Unsupported XACT settings header")
    tracks = music_cue_order(sound_bank)
    missing = [number for number in tracks if f"content/music/music_{number}" not in assets]
    if missing:
        raise ValueError(f"Mobile APK has no audio for music cues {missing}")

    metadata_end = WAVE_HEADER.size + BANK_HEADER.size + len(tracks) * ENTRY.size
    data_start = align(metadata_end)
    content.mkdir(parents=True, exist_ok=True)
    with (content / WAVE_BANK).open("wb") as bank:
        bank.seek(data_start)
        entries = []
        for index, number in enumerate(tracks):
            progress("music", index, len(tracks))
            try:
                channels, rate, frames, pcm = read_music(assets[f"content/music/music_{number}"], decode_audio)
            except (ValueError, RuntimeError, wave.Error, EOFError) as error:
                raise ValueError(f"Music_{number}: {error}") from error
            offset = bank.tell() - data_start
            if offset + align(len(pcm)) >= (1 << 32) - data_start:
                raise ValueError("Streaming wave bank exceeds the XACT size limit")
            # PCM, channel count, sample rate, byte alignment, then 16-bit flag.
            audio_format = channels << 2 | rate << 5 | (channels * 2) << 23 | 1 << 31
            entries.append(ENTRY.pack(frames << 4, audio_format, offset, len(pcm), 0, frames))
            bank.write(pcm)
            bank.write(bytes(align(len(pcm)) - len(pcm)))

        data_length = bank.tell() - data_start
        bank.seek(0)
        bank.write(WAVE_HEADER.pack(
            b"WBND", 46, 44, WAVE_HEADER.size, BANK_HEADER.size,
            WAVE_HEADER.size + BANK_HEADER.size, len(entries) * ENTRY.size,
            metadata_end, 0, 0, 0, data_start, data_length,
        ))
        bank.write(BANK_HEADER.pack(
            1, len(entries), BANK_NAME.encode("ascii"), ENTRY.size, 64, ALIGNMENT, 0, 0,
        ))
        for entry in entries:
            bank.write(entry)
    (content / SETTINGS).write_bytes(settings)
    (content / SOUND_BANK).write_bytes(sound_bank)
    return len(tracks)
