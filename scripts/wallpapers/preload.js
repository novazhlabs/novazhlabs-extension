/**
 * preload.js — Immediately loads the last-used wallpaper from localStorage.
 *
 * This is a classic (non-module) script placed right after the <video>
 * element so it runs before any async bootstrapping. Chrome's new-tab CSP
 * blocks inline scripts, so this must live in its own file.
 */
(function () {
  try {
    var url = localStorage.getItem('glass:active-wallpaper');
    if (!url) return;
    var v = document.getElementById('wallpaper-video');
    if (!v) return;
    var layer = document.getElementById('background-layer');
    if (layer) layer.classList.add('has-wallpaper');
    v.src = url;
    v.classList.add('is-preloaded');
    v.addEventListener('canplay', function () {
      v.classList.add('is-loaded');
    }, { once: true });
    if (v.readyState >= 3) v.classList.add('is-loaded');
  } catch (e) {}
})();
