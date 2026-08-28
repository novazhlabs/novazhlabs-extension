/**
 * SettingsPanel — settings UI opened by the gear button.
 *
 * Currently exposes the Font section (family / size / color), each control
 * writing through the Core settings loader and applying live via
 * FontController. More sections (theme, search, ...) can be added here later.
 */

import { FontController } from './font-controller.js';

const SIZE_MIN = 0.8;
const SIZE_MAX = 1.4;
const SIZE_STEP = 0.05;

export class SettingsPanel {
  constructor({ core, panel, trigger }) {
    if (!core || !panel) {
      throw new TypeError('SettingsPanel requires { core, panel }');
    }
    this.core = core;
    this.panel = panel;
    this.trigger = trigger ?? null;
    this.font = new FontController({ core });
    this.#active = false;
    this.#unsubscribers = [];
  }

  #active = false;
  #unsubscribers = [];

  get isOpen() {
    return this.#active;
  }

  async init() {
    await this.#buildFontSection();
    this.font.init();
    this.#buildSearchSection();
    this.#buildWidgetsSection();
    this.#buildShortcutsSection();
    this.#bindOpenClose();
    return this;
  }

  async #buildFontSection() {
    const font = this.font.font();
    const section = this.panel.querySelector('[data-settings-font]');
    if (!section) return;

    // Defaults from the persisted settings (or core config).
    const current = { ...font };

    const family = this.#makeRow(
      'Family',
      this.#makeSelect(
        (this.core.config?.get('fonts.families') ?? ['Inter', 'Roboto', 'Segoe UI', 'system-ui']),
        current.family || 'Inter',
        (value) => this.font.setFont({ family: value })
      )
    );

    const sizeInput = document.createElement('input');
    sizeInput.type = 'range';
    sizeInput.className = 'set-range';
    sizeInput.min = SIZE_MIN;
    sizeInput.max = SIZE_MAX;
    sizeInput.step = SIZE_STEP;
    sizeInput.value = Number(current.size) || 1;
    const sizeValue = document.createElement('span');
    sizeValue.className = 'set-range__value';
    sizeValue.textContent = `${Math.round((Number(current.size) || 1) * 100)}%`;
    sizeInput.addEventListener('input', () => {
      const value = Number(sizeInput.value);
      sizeValue.textContent = `${Math.round(value * 100)}%`;
      this.font.setFont({ size: value });
    });
    const sizeBox = document.createElement('div');
    sizeBox.className = 'set-range__box';
    sizeBox.append(sizeInput, sizeValue);
    const size = this.#makeRow('Size', sizeBox);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'set-color';
    colorInput.value = current.color || '#f5f7fb';
    colorInput.addEventListener('input', () => {
      this.font.setFont({ color: colorInput.value });
    });
    const color = this.#makeRow('Color', colorInput);

    section.append(family, size, color);
  }

  /**
   * Search section: engine selection + open-in-new-tab toggle.
   */
  #buildSearchSection() {
    const section = this.panel.querySelector('[data-settings-search]');
    if (!section) return;

    const engines = this.core.config?.get('search.engines') ?? {};
    const current = this.core.settings.getSearch();

    const engine = this.#makeRow(
      'Engine',
      this.#makeSelect(
        Object.entries(engines).map(([key, value]) => ({ key, label: value.name })),
        current.engine || Object.keys(engines)[0],
        (value) => this.core.settings.setSearchEngine(value)
      )
    );

    const openInNewTab = this.#makeToggle(
      'Open in new tab',
      Boolean(current.openInNewTab),
      (value) => this.core.settings.setOpenInNewTab(value)
    );

    section.append(engine, openInNewTab);
  }

  /**
   * Widgets section: enable/disable toggle + per-widget options for each
   * registered widget definition.
   */
  #buildWidgetsSection() {
    const section = this.panel.querySelector('[data-settings-widgets]');
    if (!section) return;

    const definitions = this.core.widgets.getRegistry();
    for (const definition of definitions) {
      section.append(this.#widgetEnableRow(definition));
      section.append(...this.#widgetOptionRows(definition.key));
    }
  }

  /**
   * Shortcuts section: tile size + show title/icon.
   */
  #buildShortcutsSection() {
    const section = this.panel.querySelector('[data-settings-shortcuts]');
    if (!section) return;

    const current = this.core.settings.getShortcuts();

    const size = this.#makeRow(
      'Tile size',
      this.#makeSelect(
        [
          { key: 'small', label: 'Small' },
          { key: 'medium', label: 'Medium' },
          { key: 'large', label: 'Large' }
        ],
        current.size || 'medium',
        (value) => this.core.settings.updateShortcuts({ size: value })
      )
    );

    const showTitle = this.#makeToggle(
      'Show titles',
      current.showTitle !== false,
      (value) => this.core.settings.updateShortcuts({ showTitle: value })
    );

    const showIcon = this.#makeToggle(
      'Show icons',
      current.showIcon !== false,
      (value) => this.core.settings.updateShortcuts({ showIcon: value })
    );

    section.append(size, showTitle, showIcon);
  }

  #widgetEnableRow(definition) {
    return this.#makeToggle(
      definition.name,
      this.core.widgets.isEnabled(definition.key),
      (value) => this.core.widgets.toggle(definition.key, value)
    );
  }

  #widgetOptionRows(key) {
    const rows = [];
    const options = this.core.widgets.getOptions(key);
    const setOptions = (partial) => this.core.widgets.setOptions(key, partial);

    if (key === 'clock') {
      rows.push(
        this.#makeRow(
          'Clock format',
          this.#makeSelect(
            [
              { key: '24h', label: '24-hour' },
              { key: '12h', label: '12-hour' }
            ],
            options.format || '24h',
            (value) => setOptions({ format: value })
          )
        ),
        this.#makeToggle('Show seconds', Boolean(options.showSeconds), (value) =>
          setOptions({ showSeconds: value })
        )
      );
    }

    if (key === 'date') {
      rows.push(
        this.#makeRow(
          'Date format',
          this.#makeSelect(
            [
              { key: 'long', label: 'Long (Tue, Aug 5, 2026)' },
              { key: 'short', label: 'Short (Tue, Aug 5)' }
            ],
            options.format || 'long',
            (value) => setOptions({ format: value })
          )
        )
      );
    }

    if (key === 'weather') {
      rows.push(this.#makeRow('City', this.#makeCityInput(options, setOptions)));

      rows.push(
        this.#makeRow(
          'Unit',
          this.#makeSelect(
            [
              { key: 'celsius', label: 'Celsius' },
              { key: 'fahrenheit', label: 'Fahrenheit' }
            ],
            options.unit || 'celsius',
            (value) => setOptions({ unit: value })
          )
        )
      );
    }

    return rows;
  }

  /**
   * City input with live autocomplete for the weather widget.
   * Uses the free Open-Meteo geocoding API (no key required). As the user
   * types, a dropdown of matching cities (name + country) appears; picking
   * one stores its full "City, Country" name.
   */
  #makeCityInput(options, setOptions) {
    const DEBOUNCE_MS = 250;
    const GEOCODE_URL =
      'https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=';

    const wrapper = document.createElement('div');
    wrapper.className = 'city-ac';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'set-text';
    input.placeholder = 'e.g. Tehran';
    input.value = options.city ?? '';
    input.autocomplete = 'off';
    input.spellcheck = false;
    const list = document.createElement('div');
    list.className = 'city-ac__list';
    wrapper.append(input, list);

    let timer = null;
    let controller = null;

    const closeList = () => {
      list.classList.remove('is-open');
      list.replaceChildren();
    };

    const commit = (value) => {
      input.value = value;
      setOptions({ city: value });
      closeList();
    };

    const renderList = (cities) => {
      list.replaceChildren();
      if (!cities.length) {
        closeList();
        return;
      }
      for (const city of cities) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'city-ac__item';
        const label = [city.name, city.country].filter(Boolean).join(', ');
        item.textContent = label;
        item.addEventListener('mousedown', (event) => {
          event.preventDefault(); // keep input focus
          commit(label);
        });
        list.append(item);
      }
      list.classList.add('is-open');
    };

    const fetchCities = async (query) => {
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const response = await fetch(GEOCODE_URL + encodeURIComponent(query), {
          signal: controller.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('geocode failed');
        const data = await response.json();
        renderList(Array.isArray(data?.results) ? data.results : []);
      } catch (error) {
        if (error?.name !== 'AbortError') closeList();
      }
    };

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const value = input.value.trim();
      if (value.length < 2) {
        closeList();
        return;
      }
      timer = setTimeout(() => fetchCities(value), DEBOUNCE_MS);
    });

    input.addEventListener('change', () => setOptions({ city: input.value.trim() }));
    input.addEventListener('blur', () => setTimeout(closeList, 150));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeList();
      if (event.key === 'Enter') {
        event.preventDefault();
        const first = list.querySelector('.city-ac__item');
        if (first && list.classList.contains('is-open')) {
          first.click();
        } else {
          commit(input.value.trim());
        }
      }
    });

    return wrapper;
  }

  /**
   * Reusable select that accepts either plain strings or {key, label} items.
   */
  #makeSelect(options, value, onChange) {
    const select = document.createElement('select');
    select.className = 'set-select';
    for (const option of options) {
      const item = typeof option === 'string' ? { key: option, label: option } : option;
      const el = document.createElement('option');
      el.value = item.key;
      el.textContent = item.label;
      el.selected = item.key === value;
      select.append(el);
    }
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  #makeToggle(label, checked, onChange) {
    const labelEl = document.createElement('label');
    labelEl.className = 'set-toggle';
    const span = document.createElement('span');
    span.className = 'set-toggle__label';
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'set-toggle__input';
    input.checked = Boolean(checked);
    const slider = document.createElement('span');
    slider.className = 'set-toggle__slider';
    input.addEventListener('change', () => onChange(input.checked));
    labelEl.append(span, input, slider);
    return labelEl;
  }

  #makeRow(label, control) {
    const row = document.createElement('label');
    row.className = 'set-row';
    const span = document.createElement('span');
    span.className = 'set-row__label';
    span.textContent = label;
    row.append(span, control);
    return row;
  }

  #bindOpenClose() {
    if (this.trigger) {
      this.trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        this.toggle();
      });
    }
    document.addEventListener('click', (event) => {
      if (
        this.#active &&
        !this.panel.contains(event.target) &&
        !this.trigger?.contains(event.target)
      ) {
        this.close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.#active) this.close();
    });
  }

  toggle() {
    this.#active ? this.close() : this.open();
  }

  open() {
    this.#active = true;
    this.panel.classList.add('is-open');
    this.panel.setAttribute('aria-hidden', 'false');
    this.trigger?.setAttribute('aria-expanded', 'true');
  }

  close() {
    this.#active = false;
    this.panel.classList.remove('is-open');
    this.panel.setAttribute('aria-hidden', 'true');
    this.trigger?.setAttribute('aria-expanded', 'false');
  }

  destroy() {
    this.font.destroy();
    this.#unsubscribers.forEach((unsub) => unsub());
    this.#unsubscribers = [];
  }
}