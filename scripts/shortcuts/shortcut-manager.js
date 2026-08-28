/**
 * ShortcutManager — renders and manages the shortcut grid.
 *
 * Capabilities:
 *  - Add / edit (via ShortcutDialog) and delete shortcuts
 *  - Auto favicon resolution on add + edit
 *  - Native HTML5 drag & drop reordering
 *  - Small / Medium / Large tile sizes + show title/icon (from settings)
 *  - Responsive auto-fill grid capped at a configurable max count
 *
 * Everything is persisted through the Core ShortcutLoader, so the grid
 * re-renders automatically on every change.
 */

import { getFaviconUrl, getInitials } from './favicon.js';
import { ShortcutDialog } from './shortcut-dialog.js';

const PINNED_SHORTCUT = Object.freeze({
  id: 'pinned-novazhlabs',
  title: 'NovazhLabs',
  url: 'https://novazhlabs.ir/',
  iconUrl: 'assets/icons/icon-128.png'
});

const EDIT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';

const DELETE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

export class ShortcutManager {
  constructor({ core, grid, dialogEl }) {
    if (!core || !grid) {
      throw new TypeError('ShortcutManager requires { core, grid }');
    }
    this.core = core;
    this.grid = grid;
    this.dialog = new ShortcutDialog({
      el: dialogEl,
      onSave: (payload) => this.#save(payload)
    });

    this.#unsubscribers = [];
    this.#dragId = null;
    this.#dropTarget = null;
  }

  #unsubscribers = [];
  #dragId = null;
  #dropTarget = null;

  async init() {
    this.dialog.init();
    this.#unsubscribers.push(this.core.shortcuts.subscribe(() => this.render()));
    this.#unsubscribers.push(this.core.settings.subscribe(() => this.#applySettings()));
    this.#bindGridEvents();
    this.#applySettings();
    await this.render();
    return this;
  }

  destroy() {
    this.#unsubscribers.forEach((unsub) => unsub());
    this.#unsubscribers = [];
  }

  #applySettings() {
    const prefs = this.core.settings.getShortcuts();
    const sizes = this.core.config.get('shortcuts.sizes');
    const spec = sizes[prefs?.size] ?? sizes.medium;
    const style = this.grid.style;
    style.setProperty('--tile-width', `${spec.width}px`);
    style.setProperty('--tile-height', `${spec.height}px`);
    style.setProperty('--tile-icon', `${spec.iconSize}px`);
    style.setProperty('--tile-font', spec.fontSize);
    this.grid.classList.toggle('hide-title', prefs?.showTitle === false);
    this.grid.classList.toggle('hide-icon', prefs?.showIcon === false);
  }

  /**
   * Rebuild the grid from the current collection. The pinned NovazhLabs
   * shortcut is always rendered first and cannot be edited, moved or removed.
   */
  render() {
    const items = this.core.shortcuts.getAll();
    const max = this.core.config.get('shortcuts.maxCount') ?? 200;

    this.grid.replaceChildren();
    this.grid.append(this.#buildTile(PINNED_SHORTCUT, { pinned: true }));
    for (const item of items) {
      this.grid.append(this.#buildTile(item));
    }
    if (items.length < max) {
      this.grid.append(this.#buildAddTile());
    }
  }

  #buildTile(item, { pinned = false } = {}) {
    const tile = document.createElement('a');
    tile.className = pinned ? 'shortcut-tile shortcut-tile--pinned' : 'shortcut-tile';
    tile.href = item.url;
    tile.draggable = !pinned;
    if (pinned) {
      tile.setAttribute('data-pinned', '');
      tile.addEventListener('dragstart', (event) => event.preventDefault());
      tile.addEventListener('contextmenu', (event) => event.preventDefault());
    }
    tile.setAttribute('data-id', item.id);
    tile.setAttribute('aria-label', item.title);

    const icon = document.createElement('span');
    icon.className = 'shortcut-tile__icon';

    const initials = document.createElement('span');
    initials.className = 'shortcut-tile__fallback';
    initials.textContent = getInitials(item.title, item.url);
    icon.append(initials);

    if (item.iconUrl) {
      const img = document.createElement('img');
      img.className = 'shortcut-tile__img';
      img.src = item.iconUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.remove();
        initials.hidden = false;
      });
      initials.hidden = true;
      icon.append(img);
    }

    const label = document.createElement('span');
    label.className = 'shortcut-tile__label';
    label.textContent = item.title;
    label.title = item.title;

    tile.append(icon, label);

    if (!pinned) {
      const actions = document.createElement('span');
      actions.className = 'shortcut-tile__actions';
      actions.append(
        this.#actionButton('Edit', EDIT_ICON, (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.dialog.open({ mode: 'edit', item });
        }),
        this.#actionButton('Delete', DELETE_ICON, (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.core.shortcuts.remove(item.id);
        })
      );
      tile.append(actions);
    }

    return tile;
  }

  #actionButton(label, svg, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shortcut-action-btn';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = svg;
    button.addEventListener('click', onClick);
    return button;
  }

  #buildAddTile() {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'shortcut-tile shortcut-tile--add';
    add.setAttribute('aria-label', 'Add shortcut');

    const icon = document.createElement('span');
    icon.className = 'shortcut-tile__icon shortcut-tile__icon--add';
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

    const label = document.createElement('span');
    label.className = 'shortcut-tile__label';
    label.textContent = 'Add';

    add.append(icon, label);
    add.addEventListener('click', () => this.dialog.open({ mode: 'add' }));
    return add;
  }

  async #save({ id, title, url }) {
    const iconUrl = getFaviconUrl(url);
    if (id) {
      await this.core.shortcuts.update(id, { title, url, iconUrl });
    } else {
      await this.core.shortcuts.add({ title, url, iconUrl });
    }
  }

  #bindGridEvents() {
    this.grid.addEventListener('dragstart', (event) => {
      const tile = event.target.closest('.shortcut-tile');
      // Pinned and add tiles can never be dragged.
      if (!tile || tile.classList.contains('shortcut-tile--add') || tile.hasAttribute('data-pinned')) {
        event.preventDefault();
        return;
      }
      this.#dragId = tile.dataset.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.#dragId);
      tile.classList.add('is-dragging');
    });

    this.grid.addEventListener('dragend', () => this.#clearDrag());

    this.grid.addEventListener('dragover', (event) => {
      if (!this.#dragId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      this.#dropTarget = this.#resolveDropTarget(event);
      this.#clearDropVisual();
      if (this.#dropTarget) {
        this.#dropTarget.tile.classList.add(this.#dropTarget.after ? 'drop-after' : 'drop-before');
      }
    });

    this.grid.addEventListener('drop', (event) => {
      if (!this.#dragId) return;
      event.preventDefault();
      const id = this.#dragId;
      const targetIndex = this.#dropTarget
        ? this.core.shortcuts.getAll().findIndex((item) => item.id === this.#dropTarget.id)
        : -1;
      const count = this.core.shortcuts.getCount();
      const toIndex = targetIndex === -1
        ? count
        : this.#dropTarget.after
          ? targetIndex + 1
          : targetIndex;
      // Note: the pinned tile lives outside the persisted collection, so
      // user index 0 renders directly after it.
      this.core.shortcuts.move(id, Math.min(toIndex, count));
      this.#clearDrag();
    });
  }

  #resolveDropTarget(event) {
    const tiles = [
      ...this.grid.querySelectorAll(
        '.shortcut-tile:not(.shortcut-tile--add):not([data-pinned])'
      )
    ];
    const addTile = this.grid.querySelector('.shortcut-tile--add');
    const pinnedTile = this.grid.querySelector('[data-pinned]');

    // Dropping before the first real item lands at the start of the
    // user collection (right after the pinned tile).
    if (pinnedTile) {
      const rect = pinnedTile.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right) {
        const first = tiles[0];
        if (first) return { id: first.dataset.id, tile: first, after: false };
      }
    }

    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right) {
        const after = event.clientX > rect.left + rect.width / 2;
        return { id: tile.dataset.id, tile, after };
      }
    }
    if (addTile) {
      const rect = addTile.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right) {
        const last = tiles[tiles.length - 1];
        if (last) return { id: last.dataset.id, tile: last, after: true };
      }
    }
    return null;
  }

  #clearDropVisual() {
    this.grid.querySelectorAll('.drop-before, .drop-after').forEach((el) => {
      el.classList.remove('drop-before', 'drop-after');
    });
  }

  #clearDrag() {
    this.#clearDropVisual();
    this.grid.querySelectorAll('.is-dragging').forEach((el) => {
      el.classList.remove('is-dragging');
    });
    this.#dragId = null;
    this.#dropTarget = null;
  }
}
