// cover.js — the composition.
//
// Paints the document into any 2D context: the printed frame, the sky, the
// panel mosaic (each panel its own flat plate from ink.js), the title band, the
// lockup, and the furniture. Processed art is cached on every input that shapes
// a panel, so dragging a slider re-inks one panel and typing a caption re-renders
// nothing but type.
//
// The band is laid out once, in fractions of its own height, and handed to
// every part: the tagline sits at 9%, the lockup fills 17%..64%, the credits
// row starts at 75%. Nothing is placed by eye, so nothing can collide.

import { processPhoto, GRADES } from './ink.js';
import { panelsOf, titleRectOf, layoutOf, drawBackdrop, drawPanel, drawScrim } from './panels.js';
import {
  drawLockup, drawRating, drawPrice, drawBilling, drawBarcode, drawSeriesStamp, drawRule, tracked, TEXT,
} from './letter.js';
import { sizeOf } from './state.js';

/** Processed panels, keyed by every input that shapes one. */
const ART = new Map();
const ART_MAX = 64;

/** Drops the cached art (after the tray changes, or on demand). */
export function invalidateArt() {
  ART.clear();
}

/** How many art pixels a panel is worth: enough for the plates, never the source. */
function artSize(rect, scale) {
  return {
    w: Math.max(96, Math.round(Math.min(rect.w * scale, 640))),
    h: Math.max(96, Math.round(Math.min(rect.h * scale, 640))),
  };
}

function artFor(photo, crop, gradeId, w, h) {
  const key = `${photo ? photo.id : 'none'}|${gradeId}|${crop.photo}|${crop.zoom.toFixed(2)}|${crop.fx.toFixed(2)}|${crop.fy.toFixed(2)}|${w}x${h}`;
  const hit = ART.get(key);
  if (hit) return hit;
  const art = processPhoto(photo ? photo.image : null, {
    grade: gradeId,
    crop,
    width: w,
    height: h,
    seed: (crop.photo + 3) * 17,
  });
  if (ART.size >= ART_MAX) ART.delete(ART.keys().next().value);
  ART.set(key, art);
  return art;
}

/** A rect in cover space, scaled into the framed art area. */
function mapRect(rect, area) {
  return {
    x: area.x + rect.x * area.w,
    y: area.y + rect.y * area.h,
    w: rect.w * area.w,
    h: rect.h * area.h,
  };
}

/**
 * The credits row under the lockup. Every plate is placed from the row's own
 * top and height, so the rating box, the credits, the price and the barcode
 * share one baseline and nothing can drift into anything else.
 */
function drawFurniture(ctx, band, state, gradeId) {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  const pad = Math.round(band.w * 0.013);
  const left = band.x + pad;
  const right = band.x + band.w - pad;

  const F = band.h * 0.215;
  const y = band.y + band.h * 0.755;

  // Rating plate, square, at the left.
  const rateW = F * 0.86;
  drawRating(ctx, left, y, rateW, F, gradeId, 'M');

  // Barcode hard right, on the row's baseline.
  const barW = Math.min(band.w * 0.082, F * 0.62);
  drawBarcode(ctx, right - barW, y, barW, F, gradeId, `${state.edition ?? '01'}VICELEDGER`);

  // The price plate, centred beside it.
  const priceW = Math.min(band.w * 0.074, rateW * 0.95);
  const priceH = F * 0.56;
  const priceX = right - barW - pad * 0.8 - priceW;
  drawPrice(ctx, priceX, y + (F - priceH) / 2, priceW, priceH, gradeId, '$69.99');

  // The credits fill what is left, fitted line by line, never justified.
  const billX = left + rateW + pad;
  const billW = priceX - pad - billX;
  if (billW > band.w * 0.2) {
    drawBilling(ctx, billX, y, billW, F, gradeId, [
      'A VICE LEDGER PICTURE  ·  IN ASSOCIATION WITH THE HARBOUR GROUP  ·  CASTING BY R. MENDES',
      'MUSIC BY THE LONG WAVE  ·  EDITED BY J. OKAFOR  ·  PRODUCED BY A. DELACROIX',
      'WRITTEN AND DIRECTED BY M. VICE',
    ]);
  }

  // The rule above the row: the shelf the credits stand on.
  drawRule(ctx, left, y - band.h * 0.055, right - left, gradeId, Math.max(1, Math.round(band.h * 0.006)), grade.paper);
}

/**
 * Paints the whole cover. options.detail scales the per-panel art resolution:
 * 1 for an export, less for a live preview.
 */
export function renderCover(ctx, W, H, state, options = {}) {
  const gradeId = GRADES[state.grade] ? state.grade : 'dusk';
  const grade = GRADES[gradeId];
  const layout = layoutOf(state.layout);
  const detail = options.detail ?? 1;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // The printed edge: solid ink, then the framed art area inside it.
  ctx.fillStyle = grade.ink;
  ctx.fillRect(0, 0, W, H);
  const frame = Math.max(2, Math.round(Math.min(W, H) * (layout.overlay ? 0.007 : 0.024)));
  const area = { x: frame, y: frame, w: W - frame * 2, h: H - frame * 2 };

  // The sky, clipped into the frame.
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.translate(area.x, area.y);
  drawBackdrop(ctx, area.w, area.h, gradeId, {
    horizon: layout.overlay ? 0.70 : 0.60,
    sunX: area.w * 0.75,
    sunSize: layout.overlay ? 0.23 : 0.18,
  });
  ctx.restore();

  // The panels.
  const rects = panelsOf(state.layout);
  for (let i = 0; i < rects.length; i++) {
    const rect = mapRect(rects[i], area);
    const crop = state.cropAt(i);
    const photo = state.photoAt(i);
    const size = artSize(rect, detail * 0.9);
    drawPanel(ctx, rect, artFor(photo, crop, gradeId, size.w, size.h), gradeId, { corners: !layout.overlay });
  }

  const band = mapRect(titleRectOf(state.layout), area);

  if (layout.overlay) {
    // A scrim over the photograph, so the type keeps contrast without a plate.
    drawScrim(ctx, { x: area.x, y: band.y - band.h * 0.26, w: area.w, h: band.h + band.h * 0.28 }, gradeId, 'up');
  } else {
    // The title plate: ink to the foot of the frame, with a warm rule on its lip.
    ctx.fillStyle = grade.ink;
    ctx.fillRect(area.x, band.y, area.w, area.y + area.h - band.y);
    const ruleH = Math.max(2, Math.round(H * 0.0035));
    ctx.fillStyle = grade.warm;
    ctx.fillRect(area.x, band.y - ruleH, area.w, ruleH);
    // A printed dot screen just under the rule: paper tooth on flat ink.
    ctx.fillStyle = grade.paper;
    ctx.globalAlpha = 0.12;
    const step = Math.max(5, Math.round(Math.min(W, H) / 130));
    for (let y = band.y + step * 1.2; y < band.y + band.h * 0.13; y += step) {
      for (let x = area.x + step; x < area.x + area.w - step; x += step) ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
  }

  // The tagline above the lockup.
  tracked(
    ctx,
    (state.tagline || 'The city always collects.').toUpperCase(),
    band.x + band.w / 2,
    band.y + band.h * 0.105,
    Math.max(7, Math.round(band.h * 0.043)),
    grade.warm,
    0.48,
    'center',
  );

  // The lockup: 17%..64% of the band, so the rule above the credits never
  // touches a descender.
  drawLockup(
    ctx,
    { x: band.x + band.w * 0.028, y: band.y + band.h * 0.17, w: band.w * 0.944, h: band.h * 0.47 },
    state.caption,
    gradeId,
    { align: 'center', maxLines: 2, gap: 0.11, lineFactor: 0.99 },
  );

  // The credits row.
  drawFurniture(ctx, band, state, gradeId);

  // The stamp up the right edge, and the edition mark at the top left.
  drawSeriesStamp(ctx, W, H, `${state.series || state.caption}  ·  ${state.edition ?? '01'}`, gradeId, { from: 0.06 });
  ctx.save();
  ctx.fillStyle = grade.paper;
  ctx.globalAlpha = 0.66;
  ctx.font = `700 ${Math.max(7, Math.round(H * 0.0145))}px ${TEXT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`VL · ${state.edition ?? '01'}`, area.x + area.w * 0.014, area.y + area.h * 0.026);
  ctx.restore();

  ctx.restore();
}

/** Renders to a fresh canvas of exactly w x h (the export path). */
export function renderToCanvas(state, w, h, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext('2d');
  renderCover(ctx, canvas.width, canvas.height, state, { detail: 1, ...options });
  return canvas;
}

/** The pixel size an export will produce for a state. */
export function exportSize(state) {
  const size = sizeOf(state);
  return { w: size.w, h: size.h, label: size.note };
}
