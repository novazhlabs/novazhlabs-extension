/**
 * WidgetEngine — plugin-based widget renderer.
 *
 * Each widget is a self-contained plugin file that renders into a card
 * element and optionally returns a destroy() for its own timers/cleanup.
 *
 * Plugin shape:
 *   {
 *     key, name,
 *     async render({ el, options, core }) -> { destroy?: () => void }
 *   }
 *
 * The engine renders the active widgets (from the Core WidgetLoader) in
 * registry order and re-renders whenever the widget config changes, so
 * settings updates apply live.
 */

export class WidgetEngine {
  constructor({ core, container }) {
    if (!core || !container) {
      throw new TypeError('WidgetEngine requires { core, container }');
    }
    this.core = core;
    this.container = container;
    this.plugins = new Map();
    this.unsubscribe = null;
    this.instances = [];
  }

  /**
   * Register a widget plugin.
   */
  register(plugin) {
    if (!plugin || !plugin.key || typeof plugin.render !== 'function') {
      throw new TypeError('[WidgetEngine] invalid widget plugin');
    }
    this.plugins.set(plugin.key, plugin);
    return this;
  }

  async init() {
    await this.render();
    this.unsubscribe = this.core.widgets.subscribe(() => this.render());
    return this;
  }

  /**
   * Rebuild the whole widget panel from the active widget config.
   */
  async render() {
    this.#teardown();

    const panel = document.createElement('div');
    panel.className = 'widget-panel glass';

    const header = document.createElement('div');
    header.className = 'widget-panel__header';
    const title = document.createElement('span');
    title.className = 'widget-panel__title';
    title.textContent = 'Widgets';
    header.append(title);
    panel.append(header);

    for (const definition of this.core.widgets.getActive()) {
      const plugin = this.plugins.get(definition.key);
      if (!plugin) continue;

      const el = document.createElement('div');
      const options = this.core.widgets.getOptions(definition.key);
      try {
        const result = (await plugin.render({ el, options, core: this.core })) ?? {};
        this.instances.push({
          card: el,
          destroy: typeof result.destroy === 'function' ? result.destroy : null
        });
        panel.append(el);
      } catch (error) {
        console.warn(`[WidgetEngine] widget "${definition.key}" failed`, error);
      }
    }

    this.container.replaceChildren();
    this.container.append(panel);
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.#teardown();
  }

  #teardown() {
    for (const instance of this.instances) {
      instance.destroy?.();
    }
    this.instances = [];
  }
}