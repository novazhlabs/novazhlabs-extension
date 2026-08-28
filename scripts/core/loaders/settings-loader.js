import { BaseLoader } from './base-loader.js';

const VALID_THEMES = ['system', 'dark', 'light'];

/**
 * SettingsLoader — owns global user settings (appearance + search).
 *
 * Slice shape:
 *   {
 *     appearance: { theme, accentColor, transparency, blurStrength, animationSpeed },
 *     search: { engine, openInNewTab }
 *   }
 */

export class SettingsLoader extends BaseLoader {
  constructor({ config, storage, state, bus }) {
    super({
      key: config.get('storage.keys.settings'),
      defaults: config.get('settings'),
      storage,
      state,
      bus,
      validate: (data) => {
        if (!data || typeof data !== 'object') return 'must be an object';
        if (!VALID_THEMES.includes(data.appearance?.theme)) {
          return `invalid appearance.theme "${data.appearance?.theme}"`;
        }
        const engines = config.get('search.engines');
        if (!engines[data.search?.engine]) {
          return `unknown search engine "${data.search?.engine}"`;
        }
        return null;
      }
    });

    this.config = config;
  }

  getAppearance() {
    return this.data.appearance;
  }

  getSearch() {
    return this.data.search;
  }

  getShortcuts() {
    return this.data.shortcuts;
  }

  async updateAppearance(partial) {
    return this.update({ appearance: partial });
  }

  async updateSearch(partial) {
    return this.update({ search: partial });
  }

  async updateShortcuts(partial) {
    return this.update({ shortcuts: partial });
  }

  async setTheme(theme) {
    if (!VALID_THEMES.includes(theme)) {
      throw new Error(`[SettingsLoader] invalid theme "${theme}"`);
    }
    return this.updateAppearance({ theme });
  }

  async setAccentColor(color) {
    return this.updateAppearance({ accentColor: color });
  }

  async setSearchEngine(engineKey) {
    const engines = this.config.get('search.engines');
    if (!engines[engineKey]) {
      throw new Error(`[SettingsLoader] unknown engine "${engineKey}"`);
    }
    return this.updateSearch({ engine: engineKey });
  }

  async setOpenInNewTab(value) {
    return this.updateSearch({ openInNewTab: Boolean(value) });
  }
}
