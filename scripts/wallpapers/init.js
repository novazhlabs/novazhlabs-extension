/**
 * Wallpaper bootstrap — ties the core to the live wallpaper system.
 * Loaded from index.html as a module script.
 */

import { createCore } from '../core/index.js';
import { WallpaperEngine } from './wallpaper-engine.js';
import { WallpaperPanel, restoreUploadedWallpapers } from './wallpaper-panel.js';
import { scanWallpaperFolder } from './wallpaper-source.js';
import { SettingsPanel } from '../settings/settings-panel.js';
import { SearchBar } from '../search/search-bar.js';
import { WidgetEngine } from '../widgets/widget-engine.js';
import clockPlugin from '../widgets/plugins/clock.js';
import datePlugin from '../widgets/plugins/date.js';
import weatherPlugin from '../widgets/plugins/weather.js';
import { ShortcutManager } from '../shortcuts/shortcut-manager.js';

/**
 * Sync bundled wallpapers from assets/wallpapers/index.json into the loader.
 *
 * - New files in index.json → added to the collection
 * - Files removed from index.json → removed from the collection (local only)
 * - User uploads are never touched
 */
async function syncBundledWallpapers(core) {
  const bundled = await scanWallpaperFolder();
  const existing = core.wallpapers.getItems();
  const existingUrls = new Set(existing.map((item) => item.url));
  const bundledUrls = new Set(bundled.map((item) => item.url));

  // Add newly discovered bundled wallpapers
  for (const item of bundled) {
    if (!existingUrls.has(item.url)) {
      await core.wallpapers.add({
        name: item.name,
        url: item.url,
        type: 'local',
        mediaType: item.mediaType,
        mimeType: item.mimeType
      });
    }
  }

  // Remove bundled wallpapers that are no longer in index.json (local only)
  for (const item of existing) {
    if (item.type === 'local' && item.url && !bundledUrls.has(item.url)) {
      await core.wallpapers.remove(item.id);
    }
  }
}

export async function bootstrap() {
  const core = await createCore();

  // Sync bundled wallpapers from index.json before anything else
  await syncBundledWallpapers(core).catch((error) => {
    console.warn('[bootstrap] bundled wallpaper sync failed', error);
  });

  const video = document.getElementById('wallpaper-video');
  const engine = video
    ? await new WallpaperEngine({ core, video }).init()
    : null;

  // Rehydrate user uploads and restore active selection in parallel —
  // both are independent and only the engine needs to be ready.
  if (engine) {
    await Promise.all([
      restoreUploadedWallpapers(core).catch((error) => {
        console.warn('[bootstrap] upload restore failed', error);
      }),
      (async () => {
        const prefs = await core.storage.get('wallpaper.prefs').catch(() => null);
        const savedId = prefs?.activeId ?? null;
        if (savedId && core.wallpapers.getById(savedId) && !core.wallpapers.isActive(savedId)) {
          await core.wallpapers.setActive(savedId).catch(() => {});
        }
      })()
    ]);
  }

  const panelEl = document.getElementById('wallpaper-panel');
  const trigger = document.getElementById('wallpaper-button');
  const fileInput = document.getElementById('wallpaper-file-input');

  const searchInput = document.getElementById('search-input');
  const settingsEl = document.getElementById('settings-panel');
  const settingsTrigger = document.getElementById('settings-button');
  const widgetArea = document.getElementById('widget-area');
  const shortcutGrid = document.getElementById('shortcut-grid');
  const shortcutDialog = document.getElementById('shortcut-dialog');

  // Initialize all UI panels in parallel — they are independent.
  const [panel, settingsPanel, searchBar, widgetEngine, shortcutManager] = await Promise.all([
    engine && panelEl
      ? new WallpaperPanel({ core, engine, panel: panelEl, trigger, fileInput }).init()
      : null,
    settingsEl
      ? new SettingsPanel({ core, panel: settingsEl, trigger: settingsTrigger }).init()
      : null,
    searchInput ? new SearchBar({ core, input: searchInput }).init() : null,
    widgetArea
      ? new WidgetEngine({ core, container: widgetArea })
          .register(clockPlugin)
          .register(datePlugin)
          .register(weatherPlugin)
          .init()
      : null,
    shortcutGrid
      ? new ShortcutManager({ core, grid: shortcutGrid, dialogEl: shortcutDialog }).init()
      : null
  ]);

  // Opening one closes the other so the panels never stack.
  if (panel && settingsPanel) {
    const origOpen = settingsPanel.open.bind(settingsPanel);
    settingsPanel.open = () => {
      panel.close();
      origOpen();
    };
    const wpOpen = panel.open.bind(panel);
    panel.open = () => {
      settingsPanel.close();
      wpOpen();
    };
  }

  return { core, engine, panel, settingsPanel, searchBar, widgetEngine, shortcutManager };
}

bootstrap().catch((error) => {
  console.error('[bootstrap] failed to start wallpaper system', error);
});
