/**
 * Core utility helpers — pure functions shared across the core layer.
 * No DOM access, no side effects.
 */

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isPlainObject(value) {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepClone(value) {
  if (value === undefined) return undefined;
  if (globalThis.structuredClone) {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function deepMerge(target, source) {
  if (source === undefined) return deepClone(target);
  if (!isObject(target)) return deepClone(source);
  if (!isObject(source)) return deepClone(source);
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = deepClone(sourceValue);
    }
  }
  return result;
}

export function deepFreeze(value) {
  if (isObject(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

export function createId(prefix = '') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).href;
  } catch {
    try {
      return new URL(`https://${trimmed}`).href;
    } catch {
      return null;
    }
  }
}

export function isValidUrl(url) {
  return normalizeUrl(url) !== null;
}

export function getHostname(url) {
  const parsed = normalizeUrl(url);
  if (!parsed) return null;
  try {
    return new URL(parsed).hostname;
  } catch {
    return null;
  }
}

export function isEqual(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
