'use strict';

const ParkingOccupancy = (() => {
  const stops = [[0, '#2e9d6a'], [0.70, '#2e9d6a'], [0.86, '#2d6c9b'], [0.90, '#2d6c9b'], [0.925, '#854b69'], [0.95, '#ac2834'], [0.975, '#a82230'], [1, '#a3222e']];
  const bands = [[0.98, '만차'], [0.95, '매우 혼잡'], [0.90, '혼잡'], [0.70, '보통'], [0, '여유']];
  function color(value) {
    value = Math.max(0, Math.min(1, value));
    let i = 1;
    while (i < stops.length && value > stops[i][0]) i++;
    const [lo, ca] = stops[i - 1], [hi, cb] = stops[i];
    const raw = hi === lo ? 1 : (value - lo) / (hi - lo);
    const t = raw * raw * (3 - 2 * raw);
    const linear = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const srgb = x => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
    const a = ca.slice(1).match(/../g).map(x => linear(parseInt(x, 16))), b = cb.slice(1).match(/../g).map(x => linear(parseInt(x, 16)));
    return '#' + a.map((x, k) => srgb(x + (b[k] - x) * t).toString(16).padStart(2, '0')).join('');
  }
  const tint = value => {
    const rgb = color(value).slice(1).match(/../g).map(x => parseInt(x, 16));
    return '#' + rgb.map(x => Math.round(x * 0.28 + 255 * 0.72).toString(16).padStart(2, '0')).join('');
  };
  const contrast = hex => {
    const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return luminance > 0.179 ? '#16181a' : '#fff';
  };
  const gradient = Array.from({ length: 101 }, (_, i) => `${color(i / 100)} ${i}%`).join(',');
  const scaleHtml = `<span>점유율 0%</span><span class="occupancy-bar" aria-hidden="true" style="background:linear-gradient(90deg,${gradient})"></span><span>100%</span><span class="occupancy-full"><i aria-hidden="true"></i>만차 도달(98%+)</span>`;
  return Object.freeze({ color, tint, contrast, bands, scaleHtml });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ParkingOccupancy;
