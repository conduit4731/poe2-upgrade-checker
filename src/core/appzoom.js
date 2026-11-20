'use strict';

// How big the app's own windows (the main window, the results window) draw their pages.
// The pages are laid out in fixed pixels, which reads well around 1300-1500 px wide but is tiny on
// a maximised 1440p or 4K window at 100% Windows scaling. 'auto' (the default) grows the page with
// the window, between 1x and MAX; a number is a fixed size the player picked.
const BASE = 1500; // window width (in Windows' device-independent pixels) that draws at 1x
const MAX = 1.45;  // 2560 px wide -> 1.45x, which still leaves the pages ~1760 px of layout

function appZoom(setting, widthDip) {
  const n = Number(setting);
  if (setting !== 'auto' && setting != null && setting !== '' && Number.isFinite(n) && n >= 0.8 && n <= 2) return n;
  const w = Number(widthDip) || 0;
  return Math.round(Math.min(MAX, Math.max(1, w / BASE)) * 100) / 100;
}

module.exports = { appZoom, BASE, MAX };
