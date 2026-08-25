#!/usr/bin/env python3
"""Render the deterministic FilesToAI README banner."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
LOOP_MS = 10_000


def need(name: str) -> str:
    value = shutil.which(name)
    if not value:
        raise SystemExit(f"required tool not found: {name}")
    return value


def capture(frames: Path, theme: str, fps: int, phase: float) -> None:
    frames.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.setdefault("CHROME_PATH", "/usr/bin/google-chrome")
    subprocess.run(
        [
            need("node"),
            str(HERE / "capture.js"),
            str(HERE / "banner.html"),
            str(frames),
            theme,
            str(fps),
            str(phase),
        ],
        check=True,
        env=env,
    )


def encode(frames: Path, destination: Path, fps: int, colors: int) -> None:
    palette = frames.parent / f"palette-{destination.stem}.png"
    raw = frames.parent / f"raw-{destination.name}"
    subprocess.run(
        [
            need("ffmpeg"), "-v", "error", "-y", "-framerate", str(fps),
            "-i", str(frames / "frame-%04d.png"),
            "-vf", f"palettegen=max_colors={colors}:stats_mode=full", str(palette),
        ],
        check=True,
    )
    subprocess.run(
        [
            need("ffmpeg"), "-v", "error", "-y", "-framerate", str(fps),
            "-i", str(frames / "frame-%04d.png"), "-i", str(palette),
            "-lavfi", "paletteuse=dither=none:diff_mode=rectangle",
            "-loop", "0", str(raw),
        ],
        check=True,
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([need("gifsicle"), "-O3", str(raw), "-o", str(destination)], check=True)


def verify(gif: Path) -> str:
    from PIL import Image, ImageSequence

    duration = 0
    count = 0
    with Image.open(gif) as image:
        for frame in ImageSequence.Iterator(image):
            duration += frame.info.get("duration", 0)
            count += 1
    result = "ok" if duration == LOOP_MS else "mismatch"
    return f"{count} frames, {duration} ms ({result})"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--theme", choices=["light", "dark", "both"], default="both")
    parser.add_argument("--fps", type=int, default=20)
    parser.add_argument("--phase", type=float, default=8.15)
    parser.add_argument("--colors", type=int, default=192)
    parser.add_argument("--work", type=Path)
    args = parser.parse_args()

    themes = ["light", "dark"] if args.theme == "both" else [args.theme]
    holder = None
    if args.work:
        work = args.work
        work.mkdir(parents=True, exist_ok=True)
    else:
        holder = tempfile.TemporaryDirectory(prefix="filestoai-banner-")
        work = Path(holder.name)

    try:
        for theme in themes:
            frames = work / f"frames-{theme}"
            capture(frames, theme, args.fps, args.phase)
            suffix = "-dark" if theme == "dark" else ""
            output = REPO / "docs" / "assets" / f"banner{suffix}.gif"
            poster = REPO / "docs" / "assets" / f"banner{suffix}.png"
            encode(frames, output, args.fps, args.colors)
            shutil.copyfile(frames / "frame-0000.png", poster)
            print(f"{output.relative_to(REPO)}: {output.stat().st_size / 1024:.0f} KiB, {verify(output)}")
    finally:
        if holder:
            holder.cleanup()


if __name__ == "__main__":
    main()
