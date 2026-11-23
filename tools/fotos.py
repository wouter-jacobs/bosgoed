"""Maakt de foto's van de site lichter, zonder dat ze er anders uitzien.

- Voor elke foto in fotos/ komt er een kleine WebP-versie in klein/,
  die de galerij gebruikt. Bij het aanklikken blijft de grote foto zichtbaar.
- Grote JPG-foto's (fotos/ en beeld/) worden één keer opnieuw opgeslagen
  met een iets efficiëntere compressie, alleen als dat echt scheelt.
- Kleine versies van foto's die niet meer bestaan worden opgeruimd.

Draait automatisch via .github/workflows/bouw.yml.
"""
import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageOps

BASIS = Path(__file__).resolve().parent.parent
FOTOS = BASIS / "fotos"
BEELD = BASIS / "beeld"
KLEIN = BASIS / "klein"
LOGBOEK = KLEIN / "klaar.json"
SOORTEN = {".jpg", ".jpeg", ".png", ".webp"}
KLEIN_BREEDTE = 900       # galerij is max. 440px breed, x2 voor scherpe schermen
KLEIN_KWALITEIT = 74
JPG_MAX = 1600
JPG_KWALITEIT = 82
MIN_WINST = 0.15          # alleen opnieuw opslaan als het minstens 15% scheelt


def vingerafdruk(pad):
    return hashlib.sha1(pad.read_bytes()).hexdigest()


def maak_klein(bron, doel):
    with Image.open(bron) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        if im.width > KLEIN_BREEDTE:
            im = im.resize((KLEIN_BREEDTE, round(im.height * KLEIN_BREEDTE / im.width)), Image.LANCZOS)
        doel.parent.mkdir(parents=True, exist_ok=True)
        im.save(doel, "WEBP", quality=KLEIN_KWALITEIT, method=6)


def maak_jpg_lichter(pad):
    oud = pad.stat().st_size
    tijdelijk = pad.with_name(pad.name + ".tmp")
    with Image.open(pad) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if max(im.size) > JPG_MAX:
            im.thumbnail((JPG_MAX, JPG_MAX), Image.LANCZOS)
        im.save(tijdelijk, "JPEG", quality=JPG_KWALITEIT, optimize=True, progressive=True)
    nieuw = tijdelijk.stat().st_size
    if nieuw < oud * (1 - MIN_WINST):
        os.replace(tijdelijk, pad)
        return oud, nieuw
    tijdelijk.unlink()
    return oud, oud


def main():
    logboek = json.loads(LOGBOEK.read_text()) if LOGBOEK.exists() else {}
    nieuw_logboek = {}
    voor = na = 0

    bronnen = [p for p in sorted(FOTOS.iterdir()) if p.suffix.lower() in SOORTEN]
    extra = [p for p in sorted(BEELD.iterdir()) if p.suffix.lower() in {".jpg", ".jpeg"} and p.name != "delen.jpg"]

    for pad in bronnen + extra:
        sleutel = str(pad.relative_to(BASIS))
        afdruk = vingerafdruk(pad)
        if logboek.get(sleutel) != afdruk:
            if pad.suffix.lower() in {".jpg", ".jpeg"}:
                o, n = maak_jpg_lichter(pad)
                voor += o
                na += n
            afdruk = vingerafdruk(pad)
        nieuw_logboek[sleutel] = afdruk

    bewaard = set()
    for pad in bronnen:
        doel = KLEIN / (pad.name + ".webp")
        bewaard.add(doel.name)
        sleutel = "klein:" + pad.name
        if not doel.exists() or logboek.get(sleutel) != nieuw_logboek[str(pad.relative_to(BASIS))]:
            try:
                maak_klein(pad, doel)
            except Exception as fout:  # kapotte upload: overslaan, de site valt terug op het origineel
                print("Overgeslagen:", pad.name, fout)
                continue
        nieuw_logboek[sleutel] = nieuw_logboek[str(pad.relative_to(BASIS))]

    if KLEIN.exists():
        for pad in KLEIN.glob("*.webp"):
            if pad.name not in bewaard:
                pad.unlink()

    KLEIN.mkdir(exist_ok=True)
    LOGBOEK.write_text(json.dumps(nieuw_logboek, indent=1, sort_keys=True) + "\n")
    if voor:
        print(f"JPG's: {voor // 1024} KB -> {na // 1024} KB")


if __name__ == "__main__":
    main()
