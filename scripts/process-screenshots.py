#!/usr/bin/env python3
"""Import landing screenshots at native resolution and redact private email."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
CURSOR_ASSETS = Path(
    "/Users/ivan/.cursor/projects/Users-ivan-MEGA-Work-TRINITY-trinity-landing/assets"
)

EMAIL = "ivan.tyulkin@yahoo.com"


def assert_no_email(path: Path) -> None:
    """Best-effort check: rasterized email must not remain as raw ASCII in PNG."""
    data = path.read_bytes()
    if EMAIL.encode() in data:
        raise SystemExit(f"Email still found in {path.name}")


def redact_session_bar(img: Image.Image) -> Image.Image:
    """Replace session email on the multi-strategy dashboard."""
    from PIL import ImageFont

    w, _h = img.size
    bar_rgb = (232, 245, 238)
    y0, y1 = 121, 144
    x_keep = 928  # preserve «Выйти» button on the right

    out = img.copy()
    logout = img.crop((x_keep, y0, w, y1))

    draw = ImageDraw.Draw(out)
    draw.rectangle((0, y0, x_keep, y1), fill=bar_rgb)

    font = None
    for path in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/Library/Fonts/Arial.ttf",
    ):
        try:
            font = ImageFont.truetype(path, 13)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()

    draw.text(
        (14, y0 + 4),
        "Сессия: operator@trinity.trading — API с Bearer JWT",
        fill=(40, 70, 48),
        font=font,
    )
    out.paste(logout, (x_keep, y0))
    return out


def import_dashboard() -> None:
    src = CURSOR_ASSETS / (
        "________________2026-09-02___17.34.06-c8abc57e-045c-415b-abeb-255a15aeaa93.png"
    )
    img = Image.open(src).convert("RGB")
    img = redact_session_bar(img)
    img.save(ASSETS / "product-dashboard.png", optimize=True)
    print(f"product-dashboard.png -> {img.size[0]}x{img.size[1]}")


def import_proof_desk() -> None:
    src = CURSOR_ASSETS / (
        "____________-85438770-3569-4729-8601-7cf83364cb26.png"
    )
    img = Image.open(src).convert("RGB")
    img.save(ASSETS / "proof-desk.png", optimize=True)
    print(f"proof-desk.png -> {img.size[0]}x{img.size[1]}")


def main() -> None:
    import_dashboard()
    import_proof_desk()
    for name in ("product-dashboard.png", "proof-desk.png"):
        assert_no_email(ASSETS / name)


if __name__ == "__main__":
    main()
