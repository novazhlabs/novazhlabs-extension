/**
 * WallpaperSource — discovers wallpapers living in assets/wallpapers/.
 *
 * Discovery strategy: read the maintained assets/wallpapers/index.json
 * manifest. This is the only reliable approach in Manifest V3 — the old
 * chrome.runtime.getPackageDirectoryEntry API was removed from MV3, so
 * enumerating the package directory is not possible anymore.
 *
 * Returns an array of wallpaper descriptors:
 *   { name, url, type: 'local', mimeType, mediaType: 'video'|'image' }
 */

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
const ALL_EXTENSIONS = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS];

const MIME_BY_EXT = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
};

function getMediaType(name) {
  const lower = name.toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'video';
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'image';
  return null;
}

function isSupportedFile(name) {
  return getMediaType(name) !== null;
}

function stripExtension(filename) {
  return filename.replace(/\.(mp4|webm|mov|jpe?g|png|gif|webp|bmp|svg)$/i, '');
}

/**
 * Read the maintained index.json manifest.
 */
async function scanViaIndexJson() {
  try {
    const response = await fetch('assets/wallpapers/index.json', { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    const list = Array.isArray(data) ? data : data?.wallpapers ?? [];
    return list
      .filter((item) => item && item.file && isSupportedFile(item.file))
      .map((item) => ({
        name: String(item.name || stripExtension(item.file)),
        url: `assets/wallpapers/${item.file}`,
        type: 'local',
        mediaType: getMediaType(item.file),
        mimeType: MIME_BY_EXT[item.file.slice(item.file.lastIndexOf('.')).toLowerCase()] ?? null
      }));
  } catch {
    return [];
  }
}

/**
 * Discover wallpapers in assets/wallpapers/. Never rejects — a failing scan
 * degrades to an empty list instead of breaking the whole system.
 */
export async function scanWallpaperFolder() {
  try {
    const result = await scanViaIndexJson();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('[WallpaperSource] discovery failed', error);
    return [];
  }
}

export const wallpaperExtensions = ALL_EXTENSIONS;
export const videoExtensions = VIDEO_EXTENSIONS;
export const imageExtensions = IMAGE_EXTENSIONS;
