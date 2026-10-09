/* Presentation helpers shared across the app.
   The currency formatter is built once on purpose: constructing an Intl.NumberFormat per
   call costs roughly 35x more, and a grid of profiles formats a lot of budgets. */
(function (root) {
  'use strict';
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const currency = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const months = { Oct: 'October', Nov: 'November' };

  const esc = value => String(value).replace(/[&<>"']/g, char => entities[char]);

  // Avatars are drawn, not fetched: a hue per person, their initial, and a soft blob so a
  // grid of 24 people has 24 distinguishable faces without a single network request.
  function avatar(person, size = 56) {
    const hue = person.avatarHue || 0;
    const initial = esc((person.name || '?').trim()[0] || '?');
    return `<svg class="avatar" viewBox="0 0 100 100" width="${size}" height="${size}" role="img"
      aria-label="${esc(person.name)}" focusable="false">
      <circle cx="50" cy="50" r="50" fill="hsl(${hue} 62% 88%)"></circle>
      <path d="M50 18c16 0 24 12 24 26 0 16-11 28-24 28S26 60 26 44c0-14 8-26 24-26z"
        fill="hsl(${hue} 55% 78%)"></path>
      <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
        font-family="Poppins, Inter, sans-serif" font-size="38" font-weight="700"
        fill="hsl(${hue} 60% 26%)">${initial}</text>
    </svg>`;
  }

  const api = {
    esc,
    avatar,
    euros: amount => currency.format(amount),
    monthName: value => months[value] || value,
    // "Alex", "Alex and Mina", "Alex, Mina and Luca"
    names(people) {
      const list = people.map(person => person.name);
      if (list.length < 2) return list.join('');
      return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
