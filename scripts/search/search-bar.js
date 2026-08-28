/**
 * SearchBar — wires the search input to the configured search engine, with
 * search history and live suggestions.
 *
 * Features:
 *  - Engine + open-in-new-tab from the Core settings loader
 *  - Recent searches persisted via core storage (max 12, newest first)
 *  - Suggestions dropdown: recents (with delete) + live engine suggestions,
 *    shown on focus AND while typing (no need to press anything)
 *  - Keyboard navigation (ArrowUp/Down/Enter/Escape), mouse support
 */

import { normalizeUrl } from '../core/utils.js';

const STORAGE_KEY = 'glass:search-history';
const MAX_HISTORY = 12;
const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 180;

export class SearchBar {
  constructor({ core, input }) {
    if (!core || !input) {
      throw new TypeError('SearchBar requires { core, input }');
    }
    this.core = core;
    this.input = input;
    this.#history = [];
    this.#suggestions = [];
    this.#activeIndex = -1;
    this.#debounceTimer = null;
    this.#abortController = null;
    this.#dropdown = null;
  }

  #history = [];
  #suggestions = [];
  #activeIndex = -1;
  #debounceTimer = null;
  #abortController = null;
  #dropdown = null;
  #draftValue;

  async init() {
    await this.#loadHistory();

    this.dropdownHost = this.input.closest('.search-box') ?? this.input.parentElement;
    this.dropdownHost.style.position = this.dropdownHost.style.position || 'relative';

    this.#buildDropdown();
    this.#bindEvents();
    return this;
  }

  /* ------------------------------------------------------------------ */
  /* History persistence                                                 */
  /* ------------------------------------------------------------------ */

  async #loadHistory() {
    try {
      const value = await this.core.storage.get(STORAGE_KEY);
      if (Array.isArray(value)) {
        this.#history = value
          .filter((entry) => typeof entry === 'string' && entry.trim())
          .map((entry) => entry.trim());
      }
    } catch {
      this.#history = [];
    }
  }

  async #saveToHistory(query) {
    const q = query.trim();
    if (!q) return;
    // Dedupe, newest first.
    this.#history = [q, ...this.#history.filter((entry) => entry !== q)]
      .slice(0, MAX_HISTORY);
    try {
      await this.core.storage.set(STORAGE_KEY, this.#history);
    } catch {
      /* persistence is best-effort */
    }
  }

  async #removeFromHistory(query) {
    this.#history = this.#history.filter((entry) => entry !== query);
    try {
      await this.core.storage.set(STORAGE_KEY, this.#history);
    } catch {
      /* ignore */
    }
    this.#showSuggestions(this.input.value);
  }

  get history() {
    return [...this.#history];
  }

  async clearHistory() {
    this.#history = [];
    try {
      await this.core.storage.set(STORAGE_KEY, []);
    } catch {
      /* ignore */
    }
    this.#hideDropdown();
  }

  /* ------------------------------------------------------------------ */
  /* Search engine                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve the active search engine descriptor from persisted settings.
   */
  #engine() {
    const settings = this.core.settings.getSearch();
    const engines = this.core.config.get('search.engines') ?? {};
    const keys = Object.keys(engines);
    return engines[settings.engine] || engines[keys[0]] || null;
  }

  /**
   * Build the search URL for a query using the engine's {query} template.
   */
  buildUrl(query) {
    const engine = this.#engine();
    const q = encodeURIComponent(String(query || '').trim());
    return engine ? engine.url.replace('{query}', q) : null;
  }

  /**
   * Perform the search: navigate the current tab or open a new one.
   */
  search(rawQuery) {
    const query = String(rawQuery ?? this.input.value).trim();
    if (!query) return;
    const url = this.buildUrl(query);
    if (!url) return;

    this.#saveToHistory(query);

    const openInNewTab = Boolean(this.core.settings.getSearch()?.openInNewTab);
    if (openInNewTab) {
      window.open(url, '_blank', 'noopener');
      this.input.value = '';
      this.#hideDropdown();
    } else {
      window.location.href = url;
    }
  }

  /**
   * Set the search query text (used by tests / future UI helpers).
   */
  setQuery(value) {
    this.input.value = value;
  }

  /* ------------------------------------------------------------------ */
  /* Suggestions                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Merge recents + engine suggestions into a single ranked list.
   * Recents matching the typed text come first, then live suggestions.
   */
  async #fetchSuggestions(text) {
    const q = text.trim().toLowerCase();
    const recents = q
      ? this.#history.filter((entry) => entry.toLowerCase().includes(q))
      : [...this.#history];

    let remote = [];
    if (q) {
      remote = await this.#engineSuggestions(q).catch(() => []);
    }

    const seen = new Set(recents.map((r) => r.toLowerCase()));
    const merged = [
      ...recents.map((entry) => ({ type: 'recent', text: entry })),
      ...remote
        .filter((s) => {
          const key = s.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, Math.max(MAX_SUGGESTIONS - recents.length, 3))
        .map((s) => ({ type: 'suggest', text: s }))
    ];

    return merged.slice(0, MAX_SUGGESTIONS);
  }

  /**
   * Live suggestions from the current search engine's public endpoint
   * (Google by default; falls back silently when offline/blocked).
   */
  async #engineSuggestions(query) {
    const engine = this.#engine();
    const host = engine ? new URL(engine.url.replace('{query}', 'x')).hostname : '';
    let endpoint;
    if (host.includes('bing.com')) {
      endpoint = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`;
    } else if (host.includes('duckduckgo.com')) {
      endpoint = `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`;
    } else {
      endpoint = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
    }

    if (this.#abortController) this.#abortController.abort();
    this.#abortController = new AbortController();

    const response = await fetch(endpoint, {
      signal: this.#abortController.signal,
      cache: 'no-store'
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter((s) => typeof s === 'string').slice(0, MAX_SUGGESTIONS);
    }
    // DuckDuckGo list endpoint returns a flat array of strings in some builds.
    if (Array.isArray(data)) {
      return data.filter((s) => typeof s === 'string').slice(0, MAX_SUGGESTIONS);
    }
    return [];
  }

  #showSuggestions(currentText) {
    this.#fetchSuggestions(currentText).then((items) => {
      // Ignore stale responses after rapid typing.
      if (document.activeElement !== this.input && items.length === 0) return;
      this.#renderDropdown(items, currentText);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Dropdown UI                                                         */
  /* ------------------------------------------------------------------ */

  #buildDropdown() {
    this.#dropdown = document.createElement('div');
    this.#dropdown.className = 'search-suggest';
    this.#dropdown.setAttribute('role', 'listbox');
    this.#dropdown.setAttribute('aria-label', 'Search suggestions');
    this.#dropdown.addEventListener('mousedown', (event) => {
      // Keep input focus when clicking suggestions.
      event.preventDefault();
    });
    this.#dropdown.addEventListener('click', (event) => {
      const option = event.target.closest('[data-suggest-text]');
      const removeBtn = event.target.closest('[data-suggest-remove]');
      if (removeBtn) {
        event.stopPropagation();
        this.#removeFromHistory(removeBtn.dataset.suggestRemove);
        return;
      }
      if (option) {
        this.search(option.dataset.suggestText);
      }
    });
    this.dropdownHost.append(this.#dropdown);
  }

  #renderDropdown(items, currentText) {
    this.#suggestions = items;
    this.#activeIndex = -1;
    this.#dropdown.replaceChildren();

    if (!items.length) {
      this.#dropdown.classList.remove('is-open');
      return;
    }

    for (const item of items) {
      this.#dropdown.append(this.#buildOption(item, currentText));
    }

    if (this.#history.length > 1 && !currentText.trim()) {
      const clearAll = document.createElement('button');
      clearAll.type = 'button';
      clearAll.className = 'search-suggest__clear-all';
      clearAll.textContent = 'Clear search history';
      clearAll.addEventListener('click', () => this.clearHistory());
      this.#dropdown.append(clearAll);
    }

    this.#dropdown.classList.add('is-open');
  }

  #buildOption({ type, text }, currentText) {
    const row = document.createElement('div');
    row.className = `search-suggest__item${type === 'recent' ? ' search-suggest__item--recent' : ''}`;
    row.setAttribute('role', 'option');
    row.dataset.suggestText = text;

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.classList.add('search-suggest__icon');
    // Clock icon for history, magnifier for live suggestions.
    icon.innerHTML =
      type === 'recent'
        ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
        : '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>';

    const label = document.createElement('span');
    label.className = 'search-suggest__text';
    label.textContent = text;

    row.append(icon, label);

    // Bold the matched part for recent entries while typing.
    if (type === 'recent' && currentText.trim()) {
      const q = currentText.trim().toLowerCase();
      const idx = text.toLowerCase().indexOf(q);
      if (idx !== -1) {
        label.replaceChildren(
          document.createTextNode(text.slice(0, idx)),
          Object.assign(document.createElement('b'), { textContent: text.slice(idx, idx + q.length) }),
          document.createTextNode(text.slice(idx + q.length))
        );
      }
    }

    if (type === 'recent') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'search-suggest__remove';
      remove.dataset.suggestRemove = text;
      remove.setAttribute('aria-label', `Remove "${text}" from history`);
      remove.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      row.append(remove);
    }

    return row;
  }

  #hideDropdown() {
    clearTimeout(this.#debounceTimer);
    this.#dropdown?.classList.remove('is-open');
    this.#activeIndex = -1;
  }

  #moveActive(delta) {
    const rows = [...(this.#dropdown?.querySelectorAll('.search-suggest__item') ?? [])];
    if (!rows.length) return;
    // Wrap: -1 means "no selection" (raw input), 0..rows.length-1 selects a row.
    const total = rows.length + 1;
    let next = (this.#activeIndex + 1 + delta + total) % total;
    this.#activeIndex = next - 1;
    rows.forEach((row, i) => row.classList.toggle('is-active', i === this.#activeIndex));
    if (this.#activeIndex === -1) {
      if (this.#draftValue !== undefined) this.input.value = this.#draftValue;
    } else {
      if (this.#draftValue === undefined) this.#draftValue = this.input.value;
      this.input.value = rows[this.#activeIndex].dataset.suggestText;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  #bindEvents() {
    this.input.addEventListener('keydown', (event) => {
      const isOpen = this.#dropdown?.classList.contains('is-open');

      if (event.key === 'ArrowDown' && isOpen) {
        event.preventDefault();
        this.#moveActive(1);
        return;
      }
      if (event.key === 'ArrowUp' && isOpen) {
        event.preventDefault();
        this.#moveActive(-1);
        return;
      }
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        this.#hideDropdown();
        this.input.value = this.#draftValue ?? this.input.value;
        this.#draftValue = undefined;
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const rows = [...(this.#dropdown?.querySelectorAll('.search-suggest__item') ?? [])];
        const chosen =
          this.#activeIndex >= 0 && this.#activeIndex < rows.length
            ? rows[this.#activeIndex].dataset.suggestText
            : this.input.value;
        this.#draftValue = undefined;
        this.search(chosen);
      }
    });

    this.input.addEventListener('input', () => {
      this.#draftValue = undefined;
      clearTimeout(this.#debounceTimer);
      const value = this.input.value;
      if (!value.trim()) {
        // Empty input: show pure history immediately.
        this.#renderDropdown(
          this.#history.map((entry) => ({ type: 'recent', text: entry })).slice(0, MAX_SUGGESTIONS),
          ''
        );
        return;
      }
      this.#debounceTimer = setTimeout(() => this.#showSuggestions(value), DEBOUNCE_MS);
    });

    this.input.addEventListener('focus', () => {
      this.dropdownHost.classList.add('focused');
      // Always show something on focus: history or contextual suggestions.
      this.#showSuggestions(this.input.value);
    });

    this.input.addEventListener('blur', () => {
      this.dropdownHost.classList.remove('focused');
      this.#draftValue = undefined;
      setTimeout(() => this.#hideDropdown(), 120);
    });

    document.addEventListener('click', (event) => {
      if (!this.dropdownHost.contains(event.target)) this.#hideDropdown();
    });
  }
}
