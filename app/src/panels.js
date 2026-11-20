// panels.js — the layout arithmetic and the printed chrome behind the panels.
//
// A layout is a list of rectangles in a normalised cover space (0..1 on both
// axes), so the same numbers describe a 1080 square and a 1920 wide poster.
// Nothing here knows about pixels until a caller multiplies by the canvas size.
//
// One gutter value governs every layout, so no cover has two competing rhythms.

import { GRADES } from './ink.js';

/** The margin the frame keeps inside its printed edge. */
const M = 0.018;
/** The one gutter. Every gap between panels, on either axis, is this. */
const G = 0.013;
/** Where the panel field stops and the title band begins. */
const FIELD = 0.612;

/** Three equal columns between the margins. */
const COL3 = (1 - M * 2 - G * 2) / 3;
/** The classic layout's hero column. */
const HERO = 0.402;

/**
 * The layouts. `title` is the band the lockup and furniture are fitted to;
 * `overlay` layouts paint their panels full bleed and lay the title on a scrim.
 */
export const LAYOUTS = {
  classic: {
    id: 'classic',
    label: 'Classic',
    note: 'hero + 3',
    overlay: false,
    panels: [
      { x: M, y: M, w: HERO, h: FIELD - M },
      { x: M + HERO + G, y: M, w: 1 - M * 2 - HERO - G, h: (FIELD - M - G) / 2 },
      { x: M + HERO + G, y: M + (FIELD - M - G) / 2 + G, w: (1 - M * 2 - HERO - G - G) / 2, h: (FIELD - M - G) / 2 },
      { x: M + HERO + G + (1 - M * 2 - HERO - G - G) / 2 + G, y: M + (FIELD - M - G) / 2 + G, w: (1 - M * 2 - HERO - G - G) / 2, h: (FIELD - M - G) / 2 },
    ],
    title: { x: M, y: 0.628, w: 1 - M * 2, h: 0.322 },
  },
  triptych: {
    id: 'triptych',
    label: 'Triptych',
    note: 'three columns',
    overlay: true,
    panels: [
      { x: M, y: M, w: COL3, h: 1 - M * 2 },
      { x: M + COL3 + G, y: M, w: COL3, h: 1 - M * 2 },
      { x: M + (COL3 + G) * 2, y: M, w: COL3, h: 1 - M * 2 },
    ],
    title: { x: M, y: 0.60, w: 1 - M * 2, h: 0.352 },
  },
  grid5: {
    id: 'grid5',
    label: 'Grid',
    note: 'six windows',
    overlay: false,
    panels: [
      { x: M, y: M, w: COL3, h: (0.302 - M - G) / 1 },
      { x: M + COL3 + G, y: M, w: COL3, h: 0.284 },
      { x: M + (COL3 + G) * 2, y: M, w: COL3, h: 0.284 },
      { x: M, y: 0.315, w: COL3, h: FIELD - 0.315 },
      { x: M + COL3 + G, y: 0.315, w: COL3, h: FIELD - 0.315 },
      { x: M + (COL3 + G) * 2, y: 0.315, w: COL3, h: FIELD - 0.315 },
    ],
    title: { x: M, y: 0.628, w: 1 - M * 2, h: 0.322 },
  },
  solo: {
    id: 'solo',
    label: 'Solo',
    note: 'one hero',
    overlay: true,
    panels: [{ x: 0, y: 0, w: 1, h: 1 }],
    title: { x: 0, y: 0.552, w: 1, h: 0.40 },
  },
};

/** The layouts in rail order. */
export const LAYOUT_ORDER = ['classic', 'triptych', 'grid5', 'solo'];

/** A layout by id, falling back to the first. */
export function layoutOf(id) {
  return LAYOUTS[id] ?? LAYOUTS[LAYOUT_ORDER[0]];
}

/** The panel rectangles of a layout, in normalised cover space. */
export function panelsOf(id) {
  return layoutOf(id).panels;
}

/** The title band of a layout, in normalised cover space. */
export function titleRectOf(id) {
  return layoutOf(id).title;
}

/** Whether a layout paints its panels full bleed under the title. */
export function isOverlay(id) {
  return layoutOf(id).overlay === true;
}

// ------------------------------------------------------------------ backdrop

/**
 * Paints the poster's sky: hard-edged bands from grade.sky, a sun disc in flat
 * concentric plates, a horizon rule, then a screen of ink dots. No smooth
 * gradients: it has to read as ink on paper.
 */
export function drawBackdrop(ctx, W, H, gradeId, opts = {}) {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  const sky = grade.sky;
  const horizon = opts.horizon ?? 0.62;

  ctx.fillStyle = sky[0];
  ctx.fillRect(0, 0, W, H);

  const bands = 10;
  for (let i = 1; i < bands; i++) {
    const t = i / bands;
    const y = Math.pow(t, 1.3) * horizon * H;
    const y2 = Math.pow((i + 1) / bands, 1.3) * horizon * H;
    ctx.fillStyle = sky[Math.min(sky.length - 1, Math.floor((i / bands) * sky.length))];
    ctx.fillRect(0, Math.round(y), W, Math.max(1, Math.round(y2 - y) + 1));
  }

  // The sun, low over the horizon, as flat concentric plates.
  const sunX = opts.sunX ?? W * 0.74;
  const sunY = horizon * H;
  const sunR = Math.min(W, H) * (opts.sunSize ?? 0.19);
  const sun = grade.sun;
  for (let i = sun.length - 1; i >= 0; i--) {
    ctx.fillStyle = sun[i];
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * (0.42 + (i + 1) * 0.145), 0, Math.PI * 2);
    ctx.fill();
  }
  // Hard stripes cut across the disc: the classic sunset print.
  ctx.fillStyle = sky[2];
  for (let i = 0; i < 6; i++) {
    const y = sunY - sunR * 0.55 + i * sunR * 0.2;
    ctx.globalAlpha = 0.34 + i * 0.1;
    ctx.fillRect(sunX - sunR * 1.4, y, sunR * 2.8, Math.max(1, sunR * 0.05));
  }
  ctx.globalAlpha = 1;

  // The sea: one flat plate, then the sun's reflection in broken bars.
  ctx.fillStyle = sky[1];
  ctx.fillRect(0, horizon * H, W, H - horizon * H);
  for (let i = 0; i < 24; i++) {
    const t = i / 24;
    const y = horizon * H + Math.pow(t, 1.45) * (H - horizon * H);
    const w = sunR * (0.14 + t * 0.62) * (0.5 + 0.5 * Math.abs(Math.sin(i * 2.3)));
    ctx.globalAlpha = 0.5 - t * 0.22;
    ctx.fillStyle = sun[1];
    ctx.fillRect(sunX - w / 2, y, w, Math.max(1, H * 0.0035));
  }
  ctx.globalAlpha = 1;

  // A screen of ink dots so the flats have tooth.
  ctx.fillStyle = grade.ink;
  const step = Math.max(4, Math.round(Math.min(W, H) / 160));
  ctx.globalAlpha = 0.09;
  for (let y = 0, row = 0; y < H; y += step, row++) {
    for (let x = row % 2 === 0 ? 0 : step / 2; x < W; x += step) ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
}

/**
 * A scrim behind the title: the poster's ink, fading out upward, plus a hard
 * printed bar at its solid edge, so an overlay layout keeps the photograph and
 * the type still reads. `dir` is 'up' or 'down'.
 */
export function drawScrim(ctx, rect, gradeId, dir = 'up') {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  const { x, y, w, h } = rect;
  const down = dir === 'down';

  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(down ? 0 : 1, grade.ink);
  grad.addColorStop(0.5, `${grade.ink}c8`);
  grad.addColorStop(down ? 1 : 0, `${grade.ink}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // A hard ink plate at the solid edge: a printed bar, not only a fade.
  ctx.fillStyle = grade.ink;
  const barH = Math.max(2, Math.round(h * 0.10));
  ctx.fillRect(x, down ? y : y + h - barH, w, barH);
}

// -------------------------------------------------------------------- panels

/**
 * Draws one processed panel into a rectangle given in cover pixels: the art,
 * a flat shade plate at its foot, and a thin ink rule inside its edge so the
 * gutters read as paper between printed plates.
 */
export function drawPanel(ctx, rect, art, gradeId, fx = {}) {
  const grade = GRADES[gradeId] ?? GRADES.dusk;
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.round(rect.w);
  const h = Math.round(rect.h);
  if (w <= 0 || h <= 0 || !art) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(art, 0, 0, art.width, art.height, x, y, w, h);

  // Two flat plates at the foot: a shade band, then a deeper one. Ink, not a gradient.
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = grade.shade;
  ctx.fillRect(x, y + h * 0.84, w, h * 0.16);
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = grade.ink;
  ctx.fillRect(x, y + h * 0.94, w, h * 0.06);
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.strokeStyle = grade.ink;
  const lw = Math.max(1, Math.round(Math.min(w, h) * 0.011));
  ctx.lineWidth = lw;
  ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);

  if (fx.corners) {
    const s = Math.round(Math.min(w, h) * 0.05);
    ctx.fillStyle = grade.paper;
    ctx.fillRect(x, y, s, Math.max(1, Math.round(s * 0.15)));
    ctx.fillRect(x, y, Math.max(1, Math.round(s * 0.15)), s);
  }
}
