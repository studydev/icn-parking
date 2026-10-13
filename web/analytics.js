'use strict';

(() => {
  const measurementId = document.currentScript?.dataset.measurementId;
  if (!/^G-[A-Z0-9]{4,20}$/.test(measurementId || '')) throw new Error('GA4 requires a valid measurement ID.');
  const pageUrl = new URL(location.href);
  pageUrl.search = '';
  pageUrl.hash = '';
  const referrer = document.referrer ? new URL(document.referrer) : null;
  if (referrer) { referrer.search = ''; referrer.hash = ''; }
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    page_location: pageUrl.href,
    page_referrer: referrer?.href || '',
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
})();
