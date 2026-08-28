/**
 * Favicon service — resolves a shortcut URL to a favicon image URL.
 *
 * Uses Google's public favicon service (no API key) with the host's own
 * /favicon.ico as a fallback. Both are remote URLs, so they work in any
 * extension context without host permissions.
 */

import { getHostname } from '../core/utils.js';

/**
 * @param {string} url - a shortcut URL (https://...).
 * @param {number} size - favicon pixel size (32/64/128).
 * @returns {string|null} a favicon image URL, or null when the URL is invalid.
 */
export function getFaviconUrl(url, size = 128) {
  const host = getHostname(url);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

/**
 * Direct host favicon as a last-resort fallback.
 */
export function getHostFavicon(url) {
  const host = getHostname(url);
  if (!host) return null;
  return `https://${host}/favicon.ico`;
}

/**
 * First letters used when no icon is available.
 */
export function getInitials(title, url) {
  const source = (title || '').trim() || getHostname(url) || '?';
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
