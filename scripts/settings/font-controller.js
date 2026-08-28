/**
 * FontController — applies the user's font settings to live CSS variables.
 *
 * The design layer reads text styling from CSS custom properties, so the
 * controller just maps persisted settings onto :root:
 *   --font-ui     -> font family (used by every text element)
 *   --font-scale  -> global text size multiplier
 *   --fg-1        -> primary text color (user picked)
 *   --fg-2/3/faint -> secondary text derived from the same color so labels
 *                     always stay legible against the wallpaper.
 */

const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export class FontController {
  constructor({ core }) {
    this.core = core;
    this.unsubscribe = null;
  }

  init() {
    this.apply(this.#font());
    this.unsubscribe = this.core.settings.subscribe((data) => {
      this.apply(data.font);
    });
    return this;
  }

  /**
   * Current persisted font settings.
   */
  font() {
    return this.#font();
  }

  /**
   * Update persisted font settings (applied live via settings subscription).
   */
  async setFont(partial) {
    await this.core.settings.update({ font: { ...this.#font(), ...partial } });
  }

  /**
   * Map settings onto CSS custom properties.
   */
  apply(font = {}) {
    const family = font.family || 'Inter';
    const size = Number(font.size) || 1;
    const color = typeof font.color === 'string' && font.color ? font.color : '#f5f7fb';

    const root = document.documentElement;
    root.style.setProperty('--font-ui', `'${family}', ${FONT_STACK}`);
    root.style.setProperty('--font-scale', String(size));
    root.style.setProperty('--fg-1', color);
    root.style.setProperty('--fg-2', this.#rgba(color, 0.8));
    root.style.setProperty('--fg-3', this.#rgba(color, 0.6));
    root.style.setProperty('--fg-faint', this.#rgba(color, 0.45));
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  #font() {
    return this.core.settings.data?.font ?? {};
  }

  /**
   * Convert a hex (#rgb/#rrggbb) to an rgba() string at the given opacity.
   */
  #rgba(hex, alpha) {
    let value = String(hex).trim().replace(/^#/, '');
    if (value.length === 3) {
      value = value.split('').map((c) => c + c).join('');
    }
    if (!/^[0-9a-fA-F]{6}$/.test(value)) {
      return `rgba(255, 255, 255, ${alpha})`;
    }
    const int = parseInt(value, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}