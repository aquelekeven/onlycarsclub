from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "assets" / "images"
NAMES = [
    "cropped-v53-frente", "cropped-v53-costas", "copo-termico-v53",
    "oversized-amarela-frente-v54", "oversized-amarela-costas-v54",
    "streetwear-preta-frente-v52", "streetwear-preta-verso-v52",
    "streetwear-amarela-frente-v52", "streetwear-amarela-verso-v52",
    "streetwear-branca-frente-v52", "streetwear-branca-verso-v52",
    "adesivo-japones-p-v55", "adesivo-japones-m-v55", "adesivo-japones-g-v55",
    "adesivo-mascote-colorido-v59", "adesivo-mascote-branco-v59",
]

before = 0
after = 0
for name in NAMES:
    source = IMAGE_DIR / f"{name}.png"
    target = IMAGE_DIR / f"{name}.webp"
    if not source.exists():
        continue
    before += source.stat().st_size
    with Image.open(source) as image:
        image.save(target, "WEBP", quality=84, method=6, exact=True)
    after += target.stat().st_size

main_js = ROOT / "assets" / "js" / "main.js"
text = main_js.read_text(encoding="utf-8")
for name in NAMES:
    text = text.replace(f'productImage("{name}", "png")', f'productImage("{name}", "webp")')
main_js.write_text(text, encoding="utf-8")

saved = before - after
print(f"Imagens convertidas: {before / 1024 / 1024:.2f} MB -> {after / 1024 / 1024:.2f} MB ({saved / 1024 / 1024:.2f} MB economizados).")
