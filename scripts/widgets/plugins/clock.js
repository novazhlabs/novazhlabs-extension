/**
 * Clock widget — live ticking clock card.
 *
 * Options:
 *   format:      '24h' | '12h'
 *   showSeconds: boolean
 */

function makeFormatter(options) {
  const config = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: options.format === '12h'
  };
  if (options.showSeconds) config.second = '2-digit';
  return new Intl.DateTimeFormat([], config);
}

export default {
  key: 'clock',
  name: 'Clock',

  render({ el, options }) {
    el.classList.add('widget-card');

    const label = document.createElement('span');
    label.className = 'widget-card__label';
    label.textContent = 'Clock';

    const value = document.createElement('span');
    value.className = 'widget-card__value clock-value';

    el.append(label, value);

    const formatter = makeFormatter(options);
    const update = () => {
      value.textContent = formatter.format(new Date());
    };
    update();

    const interval = setInterval(update, options.showSeconds ? 1000 : 30000);

    return { destroy: () => clearInterval(interval) };
  }
};
