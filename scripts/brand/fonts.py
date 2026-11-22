"""Embed the project's bundled OFL fonts in standalone SVGs."""
from base64 import b64encode
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = ROOT / "templates" / "fonts"


def face(name, filename, weight="normal"):
    data = b64encode((FONT_DIR / filename).read_bytes()).decode("ascii")
    return f"@font-face{{font-family:{name};src:url(data:font/woff2;base64,{data}) format('woff2');font-weight:{weight}}}"


def licenses():
    return "\n\n".join((FONT_DIR / name).read_text() for name in ("Space-Grotesk-OFL.txt", "IBM-Plex-OFL.txt"))
