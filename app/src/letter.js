// letter.js — the lockup and the poster furniture.
//
// The hard rule here: no two glyphs touch, and every gap is the same width.
// No line of display type is ever drawn as a string. Each character is measured
// with measureText's actualBoundingBoxLeft/Right — the ink box, not the advance
// box — and the next pen is placed at
//
//     previous ink right + gap + next ink left
//
// so the visible gap is a fixed distance whatever sidebearings the font carries.
// The outline stroke eats half its width off each side of a gap, so it is added
// back into the gap: an outline of s px means stepping s px further.
//
// All placement is in final pixels of the squeezed line. The font is measured
// once at a probe size and every ink box scales linearly from there, which is
// what keeps a 30 px lockup and a 300 px lockup identical in rhythm.

import { GRADES } from './ink.js';

/** Heavy condensed stacks, all system faces: the squeeze does the rest. */
export const DISPLAY =
  '"Haettenschweiler", "Arial Narrow", Impact, "Franklin Gothic Heavy", "DejaVu Sans Condensed", "Liberation Sans Narrow", "Noto Sans", "DejaVu Sans", system-ui, sans-serif';
export const TEXT = 'system-ui, -apple-system, "Segoe UI", "DejaVu Sans", Arial, sans-serif';

/** How far the display face is condensed horizontally. */
export const SQUEEZE = 0.8;

/** The probe size the ink boxes are measured at. */
const PROBE = 1000;

const displayFont = (size) => `900 ${size}px ${DISPLAY}`;

/** Sets the display font at the probe size and caches each character's signed ink offsets, in em. */
const INK = new Map();
function inkBox(ctx, ch) {
  const key = ctx.font;
  let table = INK.get(key);
  if (!table) {
    table = new Map();
    INK.set(key, table);
  }
  let box = table.get(ch);
  if (box) return box;
  const m = ctx.measureText(ch);
  // Signed: the ink's left and right edges relative to the glyph's origin.
  box = {
    left: -(m.actualBoundingBoxLeft || 0) / PROBE,
    right: (m.actualBoundingBoxRight || 0) / PROBE,
  };
  table.set(ch, box);
  return box;
}

/**
 * Places a line of characters at `size` px. Every glyph's ink box lands where
 * its own outline actually is: the next origin is the previous ink right plus
 * the gap minus the next glyph's ink left. gapEm is the visible white gap in em,
 * strokePx the outline width; both are added so the stroke cannot close the gap.
 *
 * Returns pens and boxes in pixels, the line's ink width, and where a space fell.
 */
export function placeLine(ctx, text, size, gapEm = 0.1, strokePx = 0) {
  ctx.font = displayFont(PROBE);
  const S = size * SQUEEZE;
  // The outline pushes out by up to strokePx on each side of a glyph, so the
  // gap has to absorb both sides; otherwise the strokes of two neighbours meet.
  const gap = gapEm * size + strokePx * 2;
  const chars = [...text];
  const pens = [];
  const boxes = [];
  let prevRight = null;
  for (const ch of chars) {
    if (ch === ' ') {
      const space = 0.26 * S;
      pens.push(prevRight === null ? 0 : prevRight + gap);
      boxes.push(null);
      prevRight = (prevRight === null ? 0 : prevRight + gap) + space;
      continue;
    }
    const ink = inkBox(ctx, ch);
    const l = ink.left * S;
    const r = ink.right * S;
    let pen;
    if (prevRight === null) pen = -l; // the first glyph's ink starts at x = 0
    else pen = prevRight + gap - l;
    pens.push(pen);
    boxes.push({ left: pen + l, right: pen + r });
    prevRight = pen + r;
  }
  const width = prevRight === null ? 0 : prevRight;
  return { chars, pens, boxes, width };
}

/** Splits a caption into display lines: 1 or 2, balanced, never a one-word orphan. */
export function splitTitle(text, maxLines = 2) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['UNTITLED'];
  const clean = words.map((w) => w.toUpperCase());
  if (clean.length === 1 || maxLines <= 1) return [clean.join(' ')];
  if (clean.length === 2) return [clean[0], clean[1]];
  let best = 1;
  let bestDiff = Infinity;
  for (let k = 1; k < clean.length; k++) {
    const a = clean.slice(0, k).join(' ').length;
    const b = clean.slice(k).join(' ').length;
    if (Math.abs(a - b) < bestDiff) {
      bestDiff = Math.abs(a - b);
      best = k;
    }
  }
  return [clean.slice(0, best).join(' '), clean.slice(best).join(' ')];
}

/** The cap height of the display face, in em. */
export function capEm(ctx) {
  ctx.font = displayFont(PROBE);
  return (ctx.measureText('H').actualBoundingBoxAscent || PROBE * 0.72) / PROBE;
}

/**
 * Picks between a one-line and a two-line setting: whichever gives the taller
 * capital letters. A short caption on a wide poster wants one big line; a long
 * one needs two. Both are fitted to the band, never squeezed past it.
 *
 * Returns { lines, size, cap, leading, stackH, widest }.
 */
export function fitTitle(ctx, text, band, opts = {}) {
  const gapEm = opts.gap ?? 0.1;
  const leading = opts.leading ?? 1.0;
  const cap = capEm(ctx);
  const maxLines = opts.maxLines ?? 2;

  const measure = (lines) => {
    const widest = Math.max(...lines.map((line) => placeLine(ctx, line, 1, gapEm, 0).width));
    const stackEm = cap + (lines.length - 1) * leading;
    const byWidth = band.w / Math.max(0.08, widest);
    const byHeight = (band.h * (opts.lineFactor ?? 0.97)) / stackEm;
    return { lines, widest, size: Math.min(byWidth, byHeight), cap, leading, stackH: Math.min(byWidth, byHeight) * stackEm };
  };

  const two = splitTitle(text, 2);
  const single = measure([two.join(' ')]);
  const pair = measure(two.length === 1 ? [two[0]] : two);
  const oneSize = Math.min(single.size, band.w / Math.max(0.08, single.widest));
  const best = maxLines > 1 && pair.lines.length === 2 && pair.cap * pair.size >= oneSize * cap * 0.72 ? pair : single;
  return { ...best, size: best === single ? oneSize : best.size };
}

/** Draws a placed line onto a context: origin at the line's ink left, baseline at 0. */
function paintLine(target, line, size, colour, ox, oy, strokePx, mode = 'fill') {
  target.font = displayFont(size);
  target.fillStyle = colour;
  target.strokeStyle = colour;
  target.lineJoin = 'round';
  target.lineCap = 'round';
  target.miterLimit = 2;
  for (let k = 0; k < line.chars.length; k++) {
    const ch = line.chars[k];
    if (ch === ' ') continue;
    target.save();
    target.translate(ox + line.pens[k], oy);
    target.scale(SQUEEZE, 1);
    if (strokePx > 0 && (mode === 'both' || mode === 'stroke')) {
      target.lineWidth = (strokePx * 2) / SQUEEZE;
      target.strokeText(ch, 0, 0);
    }
    if (mode !== 'stroke') target.fillText(ch, 0, 0);
    target.restore();
  }
}

/**
 * The lockup. Draws `text` to fill `rect` (cover pixels), and returns the ink
 * box plus the type size so furniture can be placed against real glyph bounds.
 *
 * opts: { align, maxLines, gap, fillA, fillB, warmFrom, strokeScale }
 */
export function drawLockup(ctx, rect, text, gradeId, opts = {}) {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  const gapEm = opts.gap ?? 0.11;
  const fit = fitTitle(ctx, text, rect, { gap: gapEm, leading: opts.leading ?? 1.0, lineFactor: 0.99, maxLines: opts.maxLines ?? 2 });
  const size = Math.max(10, fit.size);
  const stroke = Math.max(1.5, size * (opts.strokeScale ?? 0.028));

  // Place again at the real size, with the outline's width added to every gap.
  const placed = fit.lines.map((line) => placeLine(ctx, line, size, gapEm, stroke));
  const widest = Math.max(...placed.map((l) => l.width));
  const lineH = size * fit.leading;

  const plateW = Math.ceil(widest + stroke * 4 + size * 0.16);
  const plateH = Math.ceil(size * fit.cap + (placed.length - 1) * lineH + stroke * 4 + size * 0.16);
  const plate = document.createElement('canvas');
  plate.width = Math.max(4, plateW);
  plate.height = Math.max(4, plateH);
  const p = plate.getContext('2d');

  const padX = stroke * 2 + size * 0.08;
  const padY = stroke * 2 + size * 0.08;
  const baseY = padY + size * fit.cap;

  // 1. The drop: the same glyphs pushed down and right, in ink.
  const drop = size * 0.05;
  for (let i = 0; i < placed.length; i++) {
    paintLine(p, placed[i], size, grade.ink, padX + drop, baseY + i * lineH + drop, stroke * 0.55, 'both');
  }
  // 2. Each glyph: ink outline first, ink fill, then the cream it will be carved into.
  for (let i = 0; i < placed.length; i++) {
    paintLine(p, placed[i], size, grade.ink, padX, baseY + i * lineH, stroke, 'both');
  }
  // 3. Two-tone fill clipped to the glyphs: paper above, warm below, per line.
  p.globalCompositeOperation = 'source-atop';
  p.fillStyle = opts.fillA ?? grade.paper;
  p.fillRect(0, 0, plate.width, plate.height);
  p.fillStyle = opts.fillB ?? grade.warm;
  const split = baseY - size * fit.cap; // top of the cap block
  const band = (size * fit.cap) * (opts.warmFrom ?? 0.58);
  p.fillRect(0, split + band, plate.width, plate.height - split - band);
  p.globalCompositeOperation = 'source-over';

  // Blit: the ink block is centred in the band on both axes.
  const inkW = widest;
  const inkH = size * fit.cap + (placed.length - 1) * lineH;
  const destX =
    opts.align === 'left' ? rect.x - padX : opts.align === 'right' ? rect.x + rect.w - plate.width + padX : rect.x + (rect.w - plate.width) / 2;
  const destY = rect.y + (rect.h - inkH) / 2 - padY;
  ctx.drawImage(plate, Math.round(destX), Math.round(destY));

  return {
    ink: { x: destX + padX, y: destY + padY, w: inkW, h: inkH },
    plate: { x: destX, y: destY, w: plate.width, h: plate.height },
    size,
    cap: size * fit.cap,
    lines: placed.length,
    gapPx: gapEm * size + stroke,
  };
}

// ------------------------------------------------------------------- furniture

/** Letterspaced small caps, measured so the tracking is even. Returns the width. */
export function tracked(ctx, text, x, y, size, colour, tracking = 0.16, align = 'left') {
  ctx.save();
  ctx.font = `700 ${size}px ${TEXT}`;
  ctx.fillStyle = colour;
  ctx.textBaseline = 'alphabetic';
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + size * tracking);
  const total = widths.reduce((a, b) => a + b, 0) - size * tracking;
  let pen = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], pen, y);
    pen += widths[i];
  }
  ctx.restore();
  return total;
}

/** The rating plate: a bordered box with a certificate letter. */
export function drawRating(ctx, x, y, w, h, gradeId, letter = 'M') {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  const lw = Math.max(1, h * 0.05);
  ctx.save();
  ctx.fillStyle = grade.paper;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = grade.ink;
  ctx.lineWidth = lw;
  ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  ctx.fillStyle = grade.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${h * 0.58}px ${DISPLAY}`;
  ctx.fillText(letter, x + w / 2, y + h * 0.42);
  ctx.font = `700 ${Math.max(4, h * 0.12)}px ${TEXT}`;
  ctx.fillText('MATURE', x + w / 2, y + h * 0.79);
  ctx.fillText('17+', x + w / 2, y + h * 0.92);
  ctx.restore();
}

/** The price plate. */
export function drawPrice(ctx, x, y, w, h, gradeId, amount = '$69.99') {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  ctx.save();
  ctx.fillStyle = grade.warm;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = grade.ink;
  let size = h * 0.62;
  ctx.font = `900 ${size}px ${DISPLAY}`;
  const tw = ctx.measureText(amount).width;
  if (tw > w * 0.86) {
    size *= (w * 0.86) / tw;
    ctx.font = `900 ${size}px ${DISPLAY}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(amount, x + w / 2, y + h * 0.54);
  ctx.restore();
}

/**
 * The billing block: three credit lines, each fitted and centred. Never
 * justified — a stretched credit line reads as columns of nonsense, which is the
 * one thing a billing block must not do.
 */
export function drawBilling(ctx, x, y, w, h, gradeId, lines) {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  ctx.save();
  ctx.fillStyle = grade.paper;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const rows = lines.slice(0, 3);
  const rowH = h / rows.length;
  rows.forEach((line, i) => {
    let size = Math.max(4, rowH * 0.5);
    ctx.font = `600 ${size}px ${TEXT}`;
    const tw = ctx.measureText(line).width;
    if (tw > w) {
      size *= w / tw;
      ctx.font = `600 ${size}px ${TEXT}`;
    }
    ctx.fillText(line, x + w / 2, y + rowH * (i + 0.55));
  });
  ctx.restore();
}

/** A deterministic barcode from a string. */
export function drawBarcode(ctx, x, y, w, h, gradeId, seedText) {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  let h1 = 2166136261;
  for (const ch of String(seedText)) {
    h1 ^= ch.charCodeAt(0);
    h1 = Math.imul(h1, 16777619);
  }
  ctx.save();
  ctx.fillStyle = grade.paper;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = grade.ink;
  let hx = h1 >>> 0;
  const bars = Math.max(16, Math.round(w / Math.max(2, h * 0.09)));
  const bw = w / bars;
  for (let i = 0; i < bars; i++) {
    hx = (Math.imul(hx, 1664525) + 1013904223) >>> 0;
    const r = hx / 4294967296;
    if (r < 0.46) {
      const tall = r < 0.24 ? 1 : 0.74;
      ctx.fillRect(x + i * bw + bw * 0.16, y + h * 0.08, Math.max(1, bw * 0.62), h * 0.62 * tall);
    }
  }
  const label = String(seedText).replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase() || '000000';
  ctx.font = `600 ${Math.max(4, h * 0.16)}px ${TEXT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x + w / 2, y + h * 0.98);
  ctx.restore();
}

/** The series stamp: the label rotated up the poster's right edge. */
export function drawSeriesStamp(ctx, W, H, text, gradeId, opts = {}) {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  const size = Math.max(7, Math.round(H * 0.0146));
  ctx.save();
  ctx.translate(W - Math.max(10, H * 0.019), H * (opts.from ?? 0.07));
  ctx.rotate(Math.PI / 2);
  tracked(ctx, String(text).toUpperCase(), 0, 0, size, opts.colour ?? grade.paper, 0.36, 'left');
  ctx.restore();
}

/** A thin printed rule. */
export function drawRule(ctx, x, y, w, gradeId, weight = 1, colour) {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  ctx.fillStyle = colour ?? grade.paper;
  ctx.fillRect(x, y, w, Math.max(1, Math.round(weight)));
}
