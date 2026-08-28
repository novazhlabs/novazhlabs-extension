/**
 * Date widget — current date card.
 *
 * Options:
 *   format: 'long' (e.g. "Tuesday, August 5, 2026") | 'short' (e.g. "Tue, Aug 5")
 */

function makeFormatter(options) {
  if (options.format === 'short') {
    return new Intl.DateTimeFormat([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }
  return new Intl.DateTimeFormat([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export default {
  key: 'date',
  name: 'Date',

  render({ el, options }) {
    el.classList.add('widget-card');

    const label = document.createElement('span');
    label.className = 'widget-card__label';
    label.textContent = 'Date';

    const value = document.createElement('span');
    value.className = 'widget-card__value widget-card__value--md';

    el.append(label, value);

    const formatter = makeFormatter(options);
    const update = () => {
      value.textContent = formatter.format(new Date());
    };
    update();

    // Cheap refresh; the date only changes at midnight.
    const interval = setInterval(update, 60 * 1000);

    return { destroy: () => clearInterval(interval) };
  }
};
