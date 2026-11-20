[![gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/bongekanjing/gta6-cover-art-hazel-otter-73/rank.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/bongekanjing/gta6-cover-art-hazel-otter-73/reward.svg)](https://make.fun/bounty/gta6-cover-art-01)

# Vice Ledger

A GTA 6-style cover art maker that runs entirely in your browser. Drop in your own
photos, type a caption, and it letters a multi-panel poster cover — the key-art
idiom of the Vice City relaunch — then exports it as a PNG at the size you need.

Nothing leaves the machine: no upload, no server call, no account, no watermark.
The photos are decoded locally into canvas and every pixel of the export is drawn
by the page itself.

## What it does

- **Multi-panel posters.** Three layouts (`classic`, `triptych`, `grid5`) fill each
  plate from a different photo and crop, framed by the genre's hairline gutters.
- **Three grades.** `dusk`, `neon` and `heat`. Each is applied as a whole-cover
  grade so every panel of one poster sits in the same light instead of reading as
  three unrelated photographs glued together.
- **Screen-print ink.** Each plate is posterised onto a small set of flat ink
  plates with a shared value curve, a consistent sun direction and a fine screen,
  so the panels read as one printed object.
- **Lettering that survives reduction.** The title is set with the same ink gap
  between every pair of glyph edges, measured with each glyph's real bounding box,
  so it holds from thumbnail to billboard. Poster furniture — rating box, tagline,
  billing block, barcode — is drawn on the same grid.
- **Per-panel crop.** Pan, zoom and re-frame each plate independently.
- **One-step export** at 1080 × 1080, 1080 × 1350 and 1920 × 1080.

## Run it

```sh
node serve.ts          # then open http://localhost:8080
```

Any static file server works. The app is plain HTML, CSS and ES modules: no
dependencies, no build step, no network requests.

## Hand the entry in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `app/` and `screenshots/` beside the program and writes `dossier.json`,
the summary the judge reads, using the vendored make.fun library.

## Licence

MIT — see `LICENSE`.
