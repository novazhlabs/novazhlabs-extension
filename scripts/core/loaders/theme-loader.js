/**
 * ThemeLoader — resolves the effective theme from user preference + system.
 *
 * Pure data resolver. It does NOT touch the DOM; it computes and exposes:
 *   { requested, resolved, palette }
 * and emits `theme:changed` whenever the resolved theme changes
 * (settings update, or the OS toggles its dark/light preference).
 */

export class ThemeLoader {
  constructor({ config, settings, bus }) {
    this.config = config;
    this.settings = settings;
    this.bus = bus;

    this.requested = 'system';
    this.resolved = 'dark';
    this.palette = config.get('themes.dark.colors');

    this.#unsubscribeSettings = null;
    this.#mediaQuery = null;
    this.#mediaHandler = null;
  }

  #unsubscribeSettings = null;
  #mediaQuery = null;
  #mediaHandler = null;

  get event() {
    return 'theme:changed';
  }

  /**
   * Start watching settings + system preference.
   */
  async init() {
    this.resolve();

    this.#unsubscribeSettings = this.settings.subscribe(() => {
      if (this.requested !== this.settings.getAppearance().theme) {
        this.resolve();
      }
    });

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.#mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.#mediaHandler = () => {
        if (this.requested === 'system') this.resolve();
      };
      this.#mediaQuery.addEventListener?.('change', this.#mediaHandler);
    }

    return this;
  }

  /**
   * Recompute resolved theme + palette and emit when changed.
   */
  resolve() {
    const requested = this.settings.getAppearance().theme;
    const resolved = requested === 'system'
      ? this.#prefersDark() ? 'dark' : 'light'
      : requested;

    const palette = this.config.get(`themes.${resolved}.colors`);
    if (palette) {
      this.palette = palette;
    }
    this.resolved = resolved;
    this.requested = requested;

    this.bus.emit(this.event, {
      requested,
      resolved,
      palette: this.palette
    });
  }

  getTheme() {
    return {
      requested: this.requested,
      resolved: this.resolved,
      palette: this.palette
    };
  }

  getResolved() {
    return this.resolved;
  }

  getPalette() {
    return this.palette;
  }

  /**
   * Subscribe to `theme:changed`.
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(callback) {
    return this.bus.on(this.event, callback);
  }

  #prefersDark() {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  }

  destroy() {
    this.#unsubscribeSettings?.();
    this.#mediaQuery?.removeEventListener?.('change', this.#mediaHandler);
    this.#unsubscribeSettings = null;
    this.#mediaHandler = null;
  }
}
