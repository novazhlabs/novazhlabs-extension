import { EventBus } from './event-bus.js';
import { StorageManager } from './storage-manager.js';
import { StateManager } from './state-manager.js';
import { Config, coreConfig } from './config.js';
import { SettingsLoader } from './loaders/settings-loader.js';
import { ThemeLoader } from './loaders/theme-loader.js';
import { WidgetLoader } from './loaders/widget-loader.js';
import { ShortcutLoader } from './loaders/shortcut-loader.js';
import { WallpaperLoader } from './loaders/wallpaper-loader.js';

/**
 * Core — the extension bootstrap and dependency wiring.
 *
 * Owns the single instance of every core service and guarantees a fixed
 * initialization order:
 *
 *   storage -> state -> settings -> theme -> widgets -> shortcuts -> wallpapers
 *
 * After `init()` resolves, consumers access the subsystems directly, e.g.
 *   core.shortcuts.add({ title: 'GitHub', url: 'github.com' });
 *
 * A `core:ready` event is emitted once bootstrapping completes.
 */

const INSTALL_REASONS = ['install', 'update', 'chrome_update', 'shared_module_update'];

export class Core {
  constructor({ config = coreConfig } = {}) {
    this.config = config;
    this.bus = new EventBus();
    this.storage = new StorageManager({ namespace: config.get('storage.namespace') });
    this.state = new StateManager({ bus: this.bus });

    this.settings = null;
    this.theme = null;
    this.widgets = null;
    this.shortcuts = null;
    this.wallpapers = null;

    this.#bootstrapped = false;
  }

  #bootstrapped = false;

  get ready() {
    return this.#bootstrapped;
  }

  /**
   * Perform the full bootstrap sequence.
   */
  async init() {
    if (this.#bootstrapped) return this;

    await this.storage.init();
    this.state.init();

    this.settings = new SettingsLoader({
      config: this.config,
      storage: this.storage,
      state: this.state,
      bus: this.bus
    });
    await this.settings.init();

    this.theme = new ThemeLoader({
      config: this.config,
      settings: this.settings,
      bus: this.bus
    });
    await this.theme.init();

    this.widgets = new WidgetLoader({
      config: this.config,
      storage: this.storage,
      state: this.state,
      bus: this.bus
    });
    await this.widgets.init();

    this.shortcuts = new ShortcutLoader({
      config: this.config,
      storage: this.storage,
      state: this.state,
      bus: this.bus
    });
    await this.shortcuts.init();

    this.wallpapers = new WallpaperLoader({
      config: this.config,
      storage: this.storage,
      state: this.state,
      bus: this.bus
    });
    await this.wallpapers.init();

    this.#bootstrapped = true;
    this.bus.emit('core:ready', {
      version: this.config.get('version'),
      timestamp: Date.now()
    });
    return this;
  }

  /**
   * Runtime / environment information (safe in any context).
   */
  getRuntimeInfo() {
    const runtime = globalThis.chrome?.runtime;
    let manifest = null;
    try {
      manifest = runtime?.getManifest?.() ?? null;
    } catch {
      manifest = null;
    }
    return {
      version: this.config.get('version'),
      appName: this.config.get('app.name'),
      inExtension: Boolean(runtime),
      extensionId: runtime?.id ?? null,
      manifestVersion: manifest?.manifest_version ?? null
    };
  }

  /**
   * Convenience helper for the service worker to react to install/update.
   */
  static registerInstallListener(handler) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onInstalled) {
      return () => {};
    }
    const listener = (details) => {
      if (INSTALL_REASONS.includes(details.reason)) handler(details);
    };
    chrome.runtime.onInstalled.addListener(listener);
    return () => chrome.runtime.onInstalled.removeListener(listener);
  }

  /**
   * Tear down subscriptions. Use when the owning context is destroyed.
   */
  destroy() {
    this.settings?.destroy();
    this.widgets?.destroy();
    this.shortcuts?.destroy();
    this.wallpapers?.destroy();
    this.theme?.destroy();
    this.storage.clearListeners();
    this.bus.clear();
    this.#bootstrapped = false;
  }
}

/**
 * Build and initialize a fully wired Core.
 */
export async function createCore(options = {}) {
  const core = new Core(options);
  await core.init();
  return core;
}

export { coreConfig, Config };
