/**
 * ShortcutDialog — modal used to add or edit a shortcut.
 *
 * State:
 *   mode: 'add' | 'edit'
 *   item: the shortcut being edited (null when adding)
 *
 * On save it validates the URL (normalizes bare hostnames to https://) and
 * calls the provided onSave callback, then closes itself.
 */

import { getHostname, normalizeUrl } from '../core/utils.js';

export class ShortcutDialog {
  constructor({ el, onSave }) {
    if (!el) throw new TypeError('ShortcutDialog requires { el }');
    this.el = el;
    this.onSave = typeof onSave === 'function' ? onSave : () => {};

    this.titleInput = el.querySelector('[data-sc-dialog-name]');
    this.urlInput = el.querySelector('[data-sc-dialog-url]');
    this.errorEl = el.querySelector('[data-sc-dialog-error]');
    this.saveBtn = el.querySelector('[data-sc-dialog-save]');
    this.cancelBtn = el.querySelector('[data-sc-dialog-cancel]');
    this.closeBtn = el.querySelector('[data-sc-dialog-close]');

    this.mode = 'add';
    this.item = null;
    this.#active = false;
    this.#focusRef = null;
  }

  #active = false;
  #focusRef = null;

  get isOpen() {
    return this.#active;
  }

  init() {
    this.saveBtn?.addEventListener('click', () => this.#save());
    this.cancelBtn?.addEventListener('click', () => this.close());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.urlInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.#save();
    });
    this.el.addEventListener('click', (event) => {
      if (event.target === this.el) this.close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.#active) this.close();
    });
    return this;
  }

  open({ mode = 'add', item = null } = {}) {
    this.mode = mode;
    this.item = item;
    this.#active = true;
    this.el.classList.add('is-open');
    this.el.setAttribute('aria-hidden', 'false');

    this.urlInput.value = item?.url ?? '';
    this.titleInput.value = item?.title ?? '';
    this.titleInput.placeholder = item?.url
      ? getHostname(item.url) ?? ''
      : 'Auto from URL';
    this.#setError(null);

    const titleLabel = this.el.querySelector('[data-sc-dialog-title]');
    if (titleLabel) titleLabel.textContent = mode === 'edit' ? 'Edit shortcut' : 'Add shortcut';

    this.#focusRef = document.activeElement;
    this.urlInput.focus();
    this.urlInput.select();
  }

  close() {
    if (!this.#active) return;
    this.#active = false;
    this.el.classList.remove('is-open');
    this.el.setAttribute('aria-hidden', 'true');
    this.#setError(null);
    this.#focusRef?.focus?.();
    this.#focusRef = null;
  }

  #save() {
    const url = normalizeUrl(this.urlInput.value);
    if (!url) {
      this.#setError('Please enter a valid URL, e.g. github.com');
      return;
    }
    const title = this.titleInput.value.trim() || getHostname(url) || 'Untitled';
    this.onSave({ id: this.item?.id ?? null, title, url });
    this.close();
  }

  #setError(message) {
    if (!this.errorEl) return;
    this.errorEl.textContent = message ?? '';
    this.errorEl.hidden = !message;
  }
}
