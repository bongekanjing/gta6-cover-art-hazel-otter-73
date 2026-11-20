// ink.js — the poster art.
//
// One photo in, one flat screen-printed panel out. The whole look comes from
// four things, in this order:
//
//   1. Normalise. Every photo is stretched to the same black and white points
//      (2% / 98% percentiles), so a turquoise pier and a red car end up in the
//      same light. This is what lets panels from different photos sit together.
//   2. Posterise. Luminance folded into four flat plates, no smooth ramps.
//   3. Light. A blurred copy of the luminance is the "base light"; the
//      difference is local detail. Detail on the sun side gains a warm rim
//      plate, detail on the shade side drops a plate and cools. Same sun on
//      every panel, every grade.
//   4. Print. A diagonal stipple in the dark plates and a deterministic grain
//      so the flats don't look like vector fills.
//
// Everything is one getImageData / putImageData pass at panel resolution, so a
// slider drag costs a few milliseconds and no network.

/** Dither matrix: breaks the plate joins up like a coarse halftone screen. */
const BAYER = [
  [0.0, 0.5],
  [0.75, 0.25],
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** '#rrggbb' to [r, g, b]. */
function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A deterministic 0..1 noise value for a pixel, the same on every render. */
function noise(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 69069) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h & 1023) / 1023;
}

// --------------------------------------------------------------------- grades

/**
 * The grades. Each is a light, not a filter: four plates from shadow to
 * highlight, a warm rim colour, a cool shade colour, plus the backdrop palette
 * the cover paints behind the panels.
 */
export const GRADES = {
  dusk: {
    id: 'dusk',
    label: 'Dusk',
    note: 'violet + tangerine',
    plates: ['#1b0f33', '#40205a', '#8b2f6c', '#d9556a'],
    highlight: '#f6a067',
    rim: '#ffd9a6',
    shade: '#2b2472',
    ink: '#0b0518',
    paper: '#f4e5cd',
    warm: '#ffb37c',
    cool: '#5f7bd6',
    sky: ['#140a2b', '#22103a', '#3a1246', '#5e164c', '#8a2050', '#c23f55'],
    sun: ['#ffd6a0', '#ffae6e', '#ef7a5c', '#b9426f'],
  },
  neon: {
    id: 'neon',
    label: 'Neon',
    note: 'cyan + hot pink',
    plates: ['#07122b', '#103050', '#8d1f6e', '#ff5c8f'],
    highlight: '#ffd0e2',
    rim: '#ffc4a8',
    shade: '#123f63',
    ink: '#04060f',
    paper: '#eaf6f7',
    warm: '#ff9f8a',
    cool: '#4fe3f0',
    sky: ['#050a1e', '#0a1733', '#131f4d', '#3a1a5e', '#7a1a63', '#c11a5e'],
    sun: ['#ffe3f0', '#ff9fc9', '#ff5c9c', '#7a2fb0'],
  },
  heat: {
    id: 'heat',
    label: 'Heat',
    note: 'amber + rust',
    plates: ['#1d0c09', '#4c1a0f', '#9c3c17', '#e09438'],
    highlight: '#ffdc93',
    rim: '#ffeec0',
    shade: '#3a2a5e',
    ink: '#120603',
    paper: '#f7e6c6',
    warm: '#ffc46a',
    cool: '#6d5fb0',
    sky: ['#1a0709', '#2e0d0c', '#4a1410', '#6d2411', '#a03c16', '#d0691f'],
    sun: ['#fff0bc', '#ffcb72', '#f2933c', '#a3411f'],
  },
  chrome: {
    id: 'chrome',
    label: 'Chrome',
    note: 'steel + ice',
    plates: ['#081220', '#1c3444', '#4c7384', '#b6cdd0'],
    highlight: '#eef8f6',
    rim: '#ffe2b8',
    shade: '#122a44',
    ink: '#04090f',
    paper: '#e7eef1',
    warm: '#ffd0a0',
    cool: '#7fd8e8',
    sky: ['#050c17', '#0a1626', '#122436', '#1c3646', '#2b5060', '#4d7787'],
    sun: ['#f2fbff', '#cfeaf0', '#9fc9d6', '#5f8ea3'],
  },
};

/** The grades in the order the rail shows them. */
export const GRADE_ORDER = ['dusk', 'neon', 'heat', 'chrome'];

// ---------------------------------------------------------------------- crops

/**
 * The source rectangle a panel shows: cover-fit at `zoom`, panned by fx/fy in
 * -1..1 across the slack. Returned in source pixels.
 */
export function panFactor(srcW, srcH, panelW, panelH, crop = {}) {
  const zoom = Math.max(1, crop.zoom ?? 1);
  const fit = Math.max(panelW / Math.max(1, srcW), panelH / Math.max(1, srcH));
  const scale = fit * zoom;
  const winW = Math.min(srcW, panelW / scale);
  const winH = Math.min(srcH, panelH / scale);
  const slackX = Math.max(0, srcW - winW);
  const slackY = Math.max(0, srcH - winH);
  const fx = Math.max(-1, Math.min(1, crop.fx ?? 0));
  const fy = Math.max(-1, Math.min(1, crop.fy ?? 0));
  return {
    sx: clamp01((slackX / 2 + (fx * slackX) / 2) / srcW) * srcW,
    sy: clamp01((slackY / 2 + (fy * slackY) / 2) / srcH) * srcH,
    sw: winW,
    sh: winH,
  };
}

// --------------------------------------------------------------------- blur

/** Separable box blur over a Float32 luminance field. */
function boxBlur(src, w, h, radius) {
  const r = Math.max(1, radius | 0);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * norm;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * norm;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** The 2% and 98% luminance percentiles of a sample, for the shared value curve. */
function percentiles(luma, count, stride) {
  const sample = [];
  for (let i = 0; i < count; i += stride) sample.push(luma[i]);
  sample.sort((a, b) => a - b);
  const at = (p) => sample[Math.min(sample.length - 1, Math.max(0, Math.round(p * (sample.length - 1))))];
  return { black: at(0.02), white: at(0.985) };
}

// ------------------------------------------------------------------ process

/**
 * Turns a photo into a flat, screen-printed panel canvas.
 *
 * options: { grade, crop, width, height, seed }
 * Returns a canvas of exactly width x height, or null when there is no source.
 */
export function processPhoto(source, options = {}) {
  const grade = GRADES[options.grade] ?? GRADES[GRADE_ORDER[0]];
  const w = Math.max(16, Math.round(options.width ?? 420));
  const h = Math.max(16, Math.round(options.height ?? 420));
  const crop = options.crop ?? { zoom: 1, fx: 0, fy: 0 };
  const seed = options.seed ?? 7;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!source) {
    // No photo yet: a flat plate with the sun's bands, so the shell still reads.
    ctx.fillStyle = grade.plates[1];
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = grade.plates[2];
    ctx.fillRect(0, h * 0.55, w, h * 0.16);
    ctx.fillStyle = grade.plates[0];
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    return canvas;
  }

  const srcW = source.naturalWidth || source.width;
  const srcH = source.naturalHeight || source.height;
  const rect = panFactor(srcW, srcH, w, h, crop);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const n = w * h;

  // 1. Luminance, held in a plain array for the two passes below.
  const luma = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    luma[i] = (px[p] * 0.2126 + px[p + 1] * 0.7152 + px[p + 2] * 0.0722) / 255;
  }

  // 2. One value curve for every photo: stretch to shared black and white.
  const { black, white } = percentiles(luma, n, Math.max(1, Math.floor(n / 4096)));
  const span = Math.max(0.16, white - black);

  const base = boxBlur(
    (() => {
      const v = new Float32Array(n);
      for (let i = 0; i < n; i++) v[i] = clamp01((luma[i] - black) / span);
      return v;
    })(),
    w,
    h,
    Math.max(2, Math.round(Math.min(w, h) * 0.035)),
  );

  const plates = grade.plates.map(rgbOf);
  const rim = rgbOf(grade.rim);
  const shade = rgbOf(grade.shade);
  const hot = rgbOf(grade.highlight);
  const ink = rgbOf(grade.ink);

  const invW = 1 / Math.max(1, w - 1);
  const dither = Math.min(3, Math.max(1, Math.round(w / 160)));

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      // 3. Value curve: stretch, then a gentle S so the mid plates hold shape.
      let v = clamp01((luma[i] - black) / span);
      v = v * v * (3 - 2 * v) * 0.34 + v * 0.66;

      const detail = v - base[i];
      // +1 at the sun side (left), -1 at the shade side.
      const side = 1 - 2 * x * invW;

      let plate = Math.floor((v + (BAYER[y & 1][x & 1] - 0.5) * 0.055) * 4.0);
      plate = plate < 0 ? 0 : plate > 3 ? 3 : plate;

      let mixRim = Math.max(0, side) * 0.10;
      let mixShade = Math.max(0, -side) * 0.12;

      // Warm rim: local light catching the sun-facing edge of the figure.
      if (detail > 0.006) {
        const k = Math.min(1, detail * 9);
        if (side > -0.1) {
          mixRim = Math.min(0.78, mixRim + k * 0.7);
          plate = Math.min(3, plate + 1);
        }
      }
      // Cool shade: the far side and the recesses drop a plate and go blue.
      if (detail < -0.006) {
        const k = Math.min(1, -detail * 7);
        if (side < 0.25) {
          mixShade = Math.min(0.62, mixShade + k * 0.55);
          plate = Math.max(0, plate - 1);
        }
      }
      // A last warm kick on true speculars, so highlights read as sun.
      if (v > 0.95) mixRim = Math.min(0.85, mixRim + 0.45);

      let [r, g, b] = plates[plate];
      if (mixRim > 0) {
        const k = mixRim;
        r += (hot[0] - r) * k * 0.62 + (rim[0] - r) * k * 0.38;
        g += (hot[1] - g) * k * 0.62 + (rim[1] - g) * k * 0.38;
        b += (hot[2] - b) * k * 0.62 + (rim[2] - b) * k * 0.38;
      }
      if (mixShade > 0) {
        r += (shade[0] - r) * mixShade;
        g += (shade[1] - g) * mixShade;
        b += (shade[2] - b) * mixShade;
      }

      // 4. Print: a diagonal stipple through the two dark plates.
      if (plate <= 1 && ((x + y) & 3) === 0) {
        r = r * 0.9 + ink[0] * 0.1;
        g = g * 0.9 + ink[1] * 0.1;
        b = b * 0.9 + ink[2] * 0.1;
      }

      const grain = (noise(x, y, seed) - 0.5) * dither * 7;
      const p = i * 4;
      px[p] = r + grain;
      px[p + 1] = g + grain;
      px[p + 2] = b + grain;
      px[p + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}
