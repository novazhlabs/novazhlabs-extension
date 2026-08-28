import { BaseLoader } from './base-loader.js';

/**
 * WidgetLoader — owns widget enablement + per-widget options, plus the
 * widget registry (definitions). Future widgets register themselves via
 * `register()`, making the core marketplace-ready without refactoring.
 *
 * Slice shape:
 *   {
 *     enabled: { clock: true, date: true, weather: false, ... },
 *     options: { clock: {...}, date: {...}, weather: {...}, ... }
 *   }
 *
 * Registry entry shape:
 *   { key, name, defaultEnabled, controlProvider? }
 */

export class WidgetLoader extends BaseLoader {
  constructor({ config, storage, state, bus }) {
    super({
      key: config.get('storage.keys.widgets'),
      defaults: config.get('widgets.defaults'),
      storage,
      state,
      bus,
      validate: (data) => {
        if (!data || typeof data !== 'object') return 'must be an object';
        const known = this.registryKeys;
        for (const key of Object.keys(data.enabled ?? {})) {
          if (!known.includes(key)) return `unknown widget "${key}"`;
        }
        return null;
      }
    });

    this.config = config;
    this.registry = new Map(
      config.get('widgets.registry').map((def) => [def.key, { ...def }])
    );
  }

  get registryKeys() {
    return Array.from(this.registry.keys());
  }

  /**
   * Register a new widget definition (future widget packs / marketplace).
   */
  register(definition) {
    if (!definition || !definition.key || typeof definition.name !== 'string') {
      throw new TypeError('[WidgetLoader] invalid widget definition');
    }
    if (this.registry.has(definition.key)) {
      throw new Error(`[WidgetLoader] widget "${definition.key}" already registered`);
    }
    this.registry.set(definition.key, {
      defaultEnabled: false,
      ...definition
    });
    this.bus.emit('widgets:registered', definition);
    return definition;
  }

  getRegistry() {
    return Array.from(this.registry.values());
  }

  getDefinition(key) {
    return this.registry.get(key) ?? null;
  }

  isEnabled(key) {
    if (!this.registry.has(key)) return false;
    return this.data.enabled[key] ?? this.getDefinition(key).defaultEnabled ?? false;
  }

  getOptions(key) {
    return this.data.options[key] ?? {};
  }

  /**
   * Widgets that should currently be rendered, in registry order.
   */
  getActive() {
    return Array.from(this.registry.values()).filter((def) => this.isEnabled(def.key));
  }

  async toggle(key, enabled) {
    if (!this.registry.has(key)) {
      throw new Error(`[WidgetLoader] unknown widget "${key}"`);
    }
    return this.update({
      enabled: { [key]: Boolean(enabled) }
    });
  }

  async enable(key) {
    return this.toggle(key, true);
  }

  async disable(key) {
    return this.toggle(key, false);
  }

  async setOptions(key, partial) {
    if (!this.registry.has(key)) {
      throw new Error(`[WidgetLoader] unknown widget "${key}"`);
    }
    return this.update({
      options: { [key]: { ...this.data.options[key], ...partial } }
    });
  }
}
