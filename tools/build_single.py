"""Build uncleanroom_standalone.html: one self-contained file (CSS, JS, data and floor plan inlined).
Usage: python tools/build_single.py   (run build_data.py first if the spreadsheet changed)"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
h = (root / "index.html").read_text(encoding="utf-8")
css = (root / "css" / "style.css").read_text(encoding="utf-8")
h = re.sub(r'<link rel="stylesheet" href="css/style.css">', lambda m: "<style>\n" + css + "\n</style>", h)
for f in ("locations", "floorplan", "app"):
    js = (root / "js" / f"{f}.js").read_text(encoding="utf-8")
    h = re.sub(rf'<script src="js/{f}.js"[^>]*></script>', lambda m: "<script>\n" + js + "\n</script>", h)
(root / "uncleanroom_standalone.html").write_text(h, encoding="utf-8")
print("written", len(h) // 1024, "KB")
