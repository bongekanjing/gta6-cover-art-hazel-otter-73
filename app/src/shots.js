// shots.js — the ?shot= harness.
//
// A screenshot has to be reproducible from a URL alone, so the page can be
// captured headless without a single click. Two scenes:
//
//   ?shot=poster   the exported cover, edge to edge, at the requested size
//   ?shot=editor   the editor shell, seeded with sample photos and a caption
//
// Both wait two animation frames after painting and then raise window.__shotReady,
// which is what a capture script polls before it takes the picture.

import { createState } from './state.js';
import { renderToCanvas, renderCover } from './cover.js';

/** The samples that ship with the app, in tray order. */
export const SAMPLES = [
  { id: 'pier', label: 'Pier', src: 'samples/pier.jpg' },
  { id: 'boulevard', label: 'Boulevard', src: 'samples/boulevard.jpg' },
];

/** Loads an image element from a URL; resolves once it can be drawn. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/** Loads sample photos by id (or every sample for an empty list). */
export async function loadSamples(ids = []) {
  const wanted = ids.length > 0 ? ids.map((id) => SAMPLES.find((s) => s.id === id)).filter(Boolean) : SAMPLES;
  const list = await Promise.all(
    wanted.map(async (sample, i) => {
      const image = await loadImage(sample.src);
      return {
        id: `sample-${sample.id}`,
        label: sample.label,
        image,
        w: image.naturalWidth,
        h: image.naturalHeight,
        slot: i,
      };
    }),
  );
  return list;
}

/** Parses the query into a scene description. Unknown values fall back to defaults. */
export function parseShot(query) {
  const size = /^(\d{2,4})x(\d{2,4})$/.exec(String(query.get('size') || '').toLowerCase());
  return {
    shot: query.get('shot') || '',
    w: size ? Number(size[1]) : 1920,
    h: size ? Number(size[2]) : 1080,
    layout: query.get('layout') || 'classic',
    grade: query.get('grade') || 'dusk',
    photos: (query.get('photo') || '').split(',').map((s) => s.trim()).filter(Boolean),
    caption: query.get('caption') || 'Vice Ledger',
  };
}

/**
 * Puts the photos in the tray and points every panel at one, so no panel is
 * ever empty in a shot. `spread` rotates the tray so neighbouring panels differ.
 */
export function seedPanels(state, photos, opts = {}) {
  if (photos.length === 0) return state;
  state.photos = photos.map((photo, i) => ({ ...photo, id: photo.id ?? `photo-${i}` }));
  state.photos.forEach((photo, i) => {
    if (photo.slot === undefined) photo.slot = i;
  });
  const spread = opts.spread ?? true;
  state.crops.forEach((crop, i) => {
    crop.photo = spread ? i % state.photos.length : 0;
    // A slight pan per panel keeps a mosaic from looking like one photo sliced.
    crop.zoom = 1.03 + (i % 3) * 0.03;
    crop.fx = spread ? (((i % 3) - 1) * 0.24) : 0;
    crop.fy = spread ? (i % 2 === 0 ? -0.18 : 0.14) : 0;
  });
  return state;
}

/** A state seeded for the harness. */
export function shotState(config, photos) {
  const state = createState({
    caption: config.caption,
    layout: config.layout,
    grade: config.grade,
    size: config.w === config.h ? 'square' : config.h > config.w ? 'tall' : 'wide',
    series: 'Vice Ledger',
  });
  seedPanels(state, photos);
  return state;
}

/**
 * Runs the shot. `host.renderPoster(state, w, h)` paints the full-viewport
 * cover; `host.accept(state)` hands an editor scene to the shell. Resolves with
 * the state and the scene name after the ready flag is up.
 */
export async function runShot(query, host = {}) {
  const config = parseShot(query);
  const photos = await loadSamples(config.photos);
  const state = shotState(config, photos);

  if (config.shot === 'poster') {
    const canvas = document.createElement('canvas');
    canvas.width = config.w;
    canvas.height = config.h;
    canvas.id = 'shot-poster';
    canvas.setAttribute('aria-label', 'Cover art');
    const ctx = canvas.getContext('2d');
    renderCover(ctx, config.w, config.h, state, { detail: 1 });
    document.body.classList.add('shot-poster');
    document.body.appendChild(canvas);
    document.documentElement.dataset.shot = 'poster';
    if (typeof host.onPoster === 'function') host.onPoster(state, canvas);
  } else if (config.shot === 'editor') {
    document.body.classList.add('shot-editor');
    document.documentElement.dataset.shot = 'editor';
    if (typeof host.accept === 'function') await host.accept(state);
  }

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  // A second pass once fonts are known, then the flag a capture script waits on.
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* no font set: the system stack already resolved */
    }
  }
  if (typeof host.after === 'function') await host.after(state);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
  return { state, scene: config.shot || 'editor', config };
}

/** Renders a shot state to a PNG blob, for a script that wants the file itself. */
export function shotPng(state, w, h) {
  return new Promise((resolve) => {
    const canvas = renderToCanvas(state, w, h);
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
