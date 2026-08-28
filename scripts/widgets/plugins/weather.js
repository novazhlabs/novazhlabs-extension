/**
 * Weather widget — live weather card, no API key required.
 *
 * Uses the free https://wttr.in JSON endpoint. Options:
 *   city: string      (e.g. "Tehran") — empty shows a "configure" hint
 *   unit: 'celsius' | 'fahrenheit'
 *
 * Refreshes every 10 minutes. Network/timeouts degrade gracefully to "—".
 */

const REFRESH_MS = 10 * 60 * 1000;

const ICON = {
  cloudy: 'M3 18h13a3 3 0 0 0 0-6 5 5 0 0 0-9.9-1.5A3.5 3.5 0 0 0 3 18z',
  sun: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4'
};

export default {
  key: 'weather',
  name: 'Weather',

  async render({ el, options }) {
    el.classList.add('widget-card', 'widget-card--row');

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.8');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.classList.add('widget-card__icon');
    icon.innerHTML = '<path d="' + ICON.sun + '"/>';

    const body = document.createElement('div');
    body.className = 'widget-card__body';

    const temp = document.createElement('span');
    temp.className = 'widget-card__value widget-card__value--md';

    const cond = document.createElement('span');
    cond.className = 'widget-card__sub';

    body.append(temp, cond);
    el.append(icon, body);

    const city = String(options.city ?? '').trim();
    const unit = options.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';

    if (!city) {
      temp.textContent = '\u2014';
      cond.textContent = 'Set city in settings';
      return { destroy: () => {} };
    }

    const update = async () => {
      try {
        const response = await fetch(
          'https://wttr.in/' + encodeURIComponent(city) + '?format=j1&m',
          { cache: 'no-store' }
        );
        if (!response.ok) throw new Error('weather fetch failed');
        const data = await response.json();
        const current = data?.current_condition?.[0];
        if (!current) throw new Error('no condition data');

        const value =
          unit === 'fahrenheit' ? current.temp_F : current.temp_C;
        const condition = current.weatherDesc?.[0]?.value ?? '';

        temp.textContent = value != null ? `${value}\u00B0` : '\u2014';
        cond.textContent = [condition, city].filter(Boolean).join(' \u2022 ');
      } catch (error) {
        temp.textContent = '\u2014';
        cond.textContent = city;
        console.warn('[weather]', error);
      }
    };

    update();
    const interval = setInterval(update, REFRESH_MS);

    return { destroy: () => clearInterval(interval) };
  }
};
