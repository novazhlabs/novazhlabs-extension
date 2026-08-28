/**
 * WallpaperEngine — renders the active wallpaper (video OR image) into the
 * background layer.
 *
 * Responsibilities:
 *  - seed the wallpaper store from assets/wallpapers/ on first run
 *  - apply the active wallpaper (src, cover via CSS)
 *  - for videos: pause/resume on visibility changes (CPU saving)
 *  - toggle a "has-wallpaper" state on the background layer so heavy CSS
 *    decorations (blurred blobs) are disabled while a wallpaper is active
 *
 * Supports both video wallpapers (.mp4/.webm/.mov) and image wallpapers
 * (.jpg/.png/.gif/.webp etc.).
 */

import { scanWallpaperFolder } from './wallpaper-source.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

function isImageMedia(mediaType, mimeType) {
  if (mediaType === 'image') return true;
  if (mimeType && mimeType.startsWith('image/')) return true;
  return false;
}

export class WallpaperEngine {
  constructor({ core, video, pauseOnHide = true }) {
    if (!core || !video) {
      throw new TypeError('WallpaperEngine requires { core, video }');
    }
    this.core = core;
    this.video = video;
    this.currentId = null;
    this.pauseOnHide = Boolean(pauseOnHide);
    this.#unsubscribers = [];

    // Create an <img> element alongside the <video> for image wallpapers.
    this.img = document.createElement('img');
    this.img.id = 'wallpaper-image';
    this.img.alt = '';
    this.img.setAttribute('aria-hidden', 'true');
    this.img.setAttribute('tabindex', '-1');
    this.img.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;translateZ(0)';
    video.parentElement?.appendChild(this.img);
  }

  #unsubscribers = [];
  #visible = true;

  async init() {
    this.#applyVideoAttributes();
    this.#bindVideoEvents();
    await this.#ensureWallpapers();
    this.#subscribeToCore();
    this.#applyActive();
    this.#setupLifecycle();
    return this;
  }

  #applyVideoAttributes() {
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.setAttribute('aria-hidden', 'true');

    // If the inline <script> in <head> already set the src, keep it and
    // skip a redundant load cycle — the video is either playing or buffering.
    if (!this.video.currentSrc) {
      // No preload — will be set by #applyActive()
    }
  }

  /**
   * On a fresh store, discover wallpapers from the folder and seed them.
   * The loader auto-activates the first item. Never throws: a failed scan
   * just leaves the store empty (the UI still works).
   */
  async #ensureWallpapers() {
    if (this.core.wallpapers.getCount() > 0) return;
    let found = [];
    try {
      found = await scanWallpaperFolder();
    } catch (error) {
      console.warn('[WallpaperEngine] scan failed', error);
    }
    for (const wallpaper of found) {
      try {
        await this.core.wallpapers.add(wallpaper);
      } catch (error) {
        console.warn('[WallpaperEngine] skipped wallpaper', wallpaper.name, error);
      }
    }
  }

  #bindVideoEvents() {
    this.video.addEventListener('loadeddata', () => {
      this.video.classList.add('is-loaded');
      this.#toggleBackgroundState(true);
    });

    this.video.addEventListener('error', () => {
      this.video.classList.remove('is-loaded');
      // Only toggle off if no image is showing.
      if (this.img.style.display === 'none') {
        this.#toggleBackgroundState(false);
      }
    });

    // If video was preloaded by the inline <script> in <head>, it may already
    // have data before we reach here — detect that and apply immediately.
    if (this.video.readyState >= 2 && this.video.currentSrc) {
      this.video.classList.add('is-loaded');
      this.#toggleBackgroundState(true);
    }
  }

  #subscribeToCore() {
    this.#unsubscribers.push(
      this.core.wallpapers.subscribe(() => this.#applyActive())
    );
  }

  /**
   * Render whatever wallpaper is currently active.
   */
  #applyActive() {
    const active = this.core.wallpapers.getActive();
    if (!active) {
      this.video.removeAttribute('src');
      this.video.load();
      this.video.classList.remove('is-loaded');
      this.img.removeAttribute('src');
      this.img.style.display = 'none';
      this.video.style.display = '';
      this.#toggleBackgroundState(false);
      this.currentId = null;
      this.#persistActiveUrl(null);
      return;
    }

    if (active.id === this.currentId) return;

    this.currentId = active.id;
    const url = active.blobUrl || active.url;
    const useImage = isImageMedia(active.mediaType, active.mimeType);

    this.#persistActiveUrl(url);

    if (useImage) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.classList.remove('is-loaded');
      this.video.style.display = 'none';

      this.img.src = url;
      this.img.style.display = '';
      this.#toggleBackgroundState(true);
    } else {
      this.img.removeAttribute('src');
      this.img.style.display = 'none';
      this.video.style.display = '';

      // Resolve both URLs so relative paths like "assets/wallpapers/x.mp4"
      // compare correctly against the browser-resolved absolute currentSrc.
      const resolvedUrl = new URL(url, location.href).href;
      if (this.video.currentSrc !== resolvedUrl) {
        this.video.src = url;
        this.video.load();
      }
      this.video.play().catch(() => {});
    }
  }

  #setupLifecycle() {
    const onVisibility = () => {
      if (!this.pauseOnHide) return;
      if (document.hidden) {
        this.#visible = false;
        this.pause();
      } else {
        this.#visible = true;
        this.resume();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onBlur = () => {
      if (this.pauseOnHide) this.pause();
    };
    const onFocus = () => {
      if (this.#visible && this.pauseOnHide) this.resume();
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    this.#unsubscribers.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    });
  }

  /**
   * Toggle the CPU-saving pause when the tab becomes inactive.
   */
  setPauseOnHide(value) {
    this.pauseOnHide = Boolean(value);
  }

  /**
   * Pause video playback (tab hidden / window blurred). Images need no pause.
   */
  pause() {
    if (!this.video.paused) {
      this.video.pause();
    }
  }

  /**
   * Resume video playback when the tab becomes active again.
   */
  resume() {
    if (this.video.paused && this.video.currentSrc) {
      this.video.play().catch(() => {});
    }
  }

  setLoop(value) {
    this.video.loop = Boolean(value);
  }

  setMuted(value) {
    this.video.muted = Boolean(value);
    if (this.video.muted) this.resume();
  }

  #toggleBackgroundState(hasWallpaper) {
    const layer = document.getElementById('background-layer');
    layer?.classList.toggle('has-wallpaper', hasWallpaper);
  }

  /**
   * Persist the active wallpaper URL to localStorage (synchronous) so the
   * inline <script> in <head> can start loading the video immediately.
   */
  #persistActiveUrl(url) {
    try {
      if (url) {
        localStorage.setItem('glass:active-wallpaper', url);
      } else {
        localStorage.removeItem('glass:active-wallpaper');
      }
    } catch { /* quota or private mode — ignore */ }
  }

  destroy() {
    this.#unsubscribers.forEach((unsub) => unsub());
    this.#unsubscribers = [];
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.img.removeAttribute('src');
    this.img.style.display = 'none';
  }
}
