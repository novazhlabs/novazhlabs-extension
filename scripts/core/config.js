import { deepClone, deepFreeze, deepMerge } from './utils.js';

/**
 * Config — read-only, deeply frozen configuration store.
 *
 * The Config object is the single source of truth for defaults. It is frozen
 * at construction time so accidental mutation is impossible. New capability
 * packs (theme marketplace, widget packs...) can build an extended Config via
 * `extend()` without touching the original.
 */

const DEFAULTS = {
  version: '1.0.0',

  app: {
    name: 'Glass New Tab',
    description: 'Professional New Tab with Glass UI and Live Wallpapers'
  },

  storage: {
    namespace: 'glass',
    keys: {
      settings: 'glass:settings',
      shortcuts: 'glass:shortcuts',
      wallpapers: 'glass:wallpapers',
      widgets: 'glass:widgets'
    }
  },

  settings: {
    appearance: {
      theme: 'system',
      accentColor: '#0078d4',
      transparency: 0.15,
      blurStrength: 20,
      animationSpeed: 1
    },
    font: {
      family: 'Inter',
      size: 1,
      color: '#f5f7fb'
    },
    search: {
      engine: 'google',
      openInNewTab: false
    },
    shortcuts: {
      size: 'medium',
      showTitle: true,
      showIcon: true
    }
  },

  search: {
    defaultEngine: 'google',
    engines: {
      google: {
        name: 'Google',
        url: 'https://www.google.com/search?q={query}',
        icon: 'https://www.google.com/favicon.ico'
      },
      bing: {
        name: 'Bing',
        url: 'https://www.bing.com/search?q={query}',
        icon: 'https://www.bing.com/favicon.ico'
      },
      duckduckgo: {
        name: 'DuckDuckGo',
        url: 'https://duckduckgo.com/?q={query}',
        icon: 'https://duckduckgo.com/favicon.ico'
      }
    }
  },

  themes: {
    dark: {
      id: 'dark',
      name: 'Dark',
      colors: {
        bgPrimary: '#0d0d0d',
        bgSecondary: '#1a1a1a',
        bgTertiary: '#262626',
        fgPrimary: '#ffffff',
        fgSecondary: '#b3b3b3',
        fgTertiary: '#808080',
        fgMuted: '#595959',
        accent: '#0078d4',
        accentHover: '#106ebe',
        accentLight: 'rgba(0,120,212,0.15)',
        border: '#333333',
        borderLight: '#404040',
        glassBg: 'rgba(255,255,255,0.05)',
        glassBorder: 'rgba(255,255,255,0.1)',
        overlay: 'rgba(0,0,0,0.35)'
      }
    },
    light: {
      id: 'light',
      name: 'Light',
      colors: {
        bgPrimary: '#fafafa',
        bgSecondary: '#ffffff',
        bgTertiary: '#f5f5f5',
        fgPrimary: '#1a1a1a',
        fgSecondary: '#404040',
        fgTertiary: '#737373',
        fgMuted: '#a3a3a3',
        accent: '#0078d4',
        accentHover: '#106ebe',
        accentLight: 'rgba(0,120,212,0.12)',
        border: '#e5e5e5',
        borderLight: '#d4d4d4',
        glassBg: 'rgba(255,255,255,0.7)',
        glassBorder: 'rgba(0,0,0,0.08)',
        overlay: 'rgba(0,0,0,0.05)'
      }
    }
  },

  widgets: {
    registry: [
      { key: 'clock', name: 'Clock', defaultEnabled: true },
      { key: 'date', name: 'Date', defaultEnabled: true },
      { key: 'weather', name: 'Weather', defaultEnabled: false }
    ],
    defaults: {
      enabled: { clock: true, date: true, weather: false },
      options: {
        clock: { format: '24h', showSeconds: false, fontSize: 'large', fontFamily: 'Inter' },
        date: {},
        weather: { city: '', apiKey: '', unit: 'celsius' }
      }
    }
  },

  shortcuts: {
    defaults: { size: 'medium', showTitle: true, showIcon: true, columns: 'auto' },
    maxCount: 200,
    sizes: {
      small: { width: 80, height: 80, fontSize: '12px', iconSize: 32 },
      medium: { width: 100, height: 100, fontSize: '13px', iconSize: 40 },
      large: { width: 130, height: 130, fontSize: '14px', iconSize: 56 }
    }
  },

  fonts: {
    families: ['Inter', 'Roboto', 'Segoe UI', 'system-ui'],
    urls: {
      Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
      Roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap'
    }
  },

  wallpaper: {
    supportedFormats: ['video/mp4', 'video/webm', 'video/quicktime'],
    extensions: ['.mp4', '.webm', '.mov'],
    maxFileSize: 500 * 1024 * 1024,
    autoplay: true,
    muted: true,
    loop: true
  }
};

export class Config {
  #values;

  constructor(defaults = DEFAULTS) {
    this.#values = deepFreeze(deepClone(defaults));
  }

  /**
   * The frozen, raw config object.
   */
  get raw() {
    return this.#values;
  }

  /**
   * Read a value by dot-path, e.g. config.get('themes.dark.colors.accent').
   * @returns {*} Value or undefined when the path does not exist.
   */
  get(path) {
    if (path === undefined || path === null || path === '') return this.#values;
    return path.split('.').reduce((acc, part) => acc?.[part], this.#values);
  }

  has(path) {
    return this.get(path) !== undefined;
  }

  /**
   * Build a new Config derived from this one with extra/default values merged in.
   */
  extend(partial) {
    return new Config(deepMerge(this.#values, partial));
  }
}

export const coreConfig = new Config(DEFAULTS);
