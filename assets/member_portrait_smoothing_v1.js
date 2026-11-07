/* Crisp member-card preview for Ludeman only. Keep the lossless source intact. */
(function () {
  'use strict';
  const card = document.querySelector('.member-card[data-member="11"]');
  const img = card && card.querySelector('.portrait img');
  if (!img || !document.createElement('canvas').getContext) return;

  function renderPreview() {
    const originalUrl = img.getAttribute('src');
    if (!originalUrl || img.dataset.previewPrepared === 'true') return;
    img.dataset.previewPrepared = 'true';
    const source = new Image();
    source.decoding = 'async';
    source.onload = function () {
      const width = img.getBoundingClientRect().width;
      if (width < 50) return;
      const density = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const targetWidth = Math.min(source.naturalWidth, Math.round(width * density));
      const ratio = source.naturalHeight / source.naturalWidth;
      if (targetWidth >= source.naturalWidth) return;

      try {
        let previous = source;
        let stepWidth = source.naturalWidth;
        // Reduce in stages to avoid hair-strand aliasing on small displays.
        while (stepWidth > targetWidth * 1.8) {
          stepWidth = Math.max(targetWidth, Math.round(stepWidth / 2));
          const stage = document.createElement('canvas');
          stage.width = stepWidth;
          stage.height = Math.round(stepWidth * ratio);
          const context = stage.getContext('2d');
          if (!context) return;
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.drawImage(previous, 0, 0, stage.width, stage.height);
          previous = stage;
        }
        const final = document.createElement('canvas');
        final.width = targetWidth;
        final.height = Math.round(targetWidth * ratio);
        const context = final.getContext('2d');
        if (!context) return;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(previous, 0, 0, final.width, final.height);
        // Only the displayed preview changes. Its pixels are PNG-lossless.
        img.src = final.toDataURL('image/png');
      } catch (_err) {
        img.src = originalUrl;
      }
    };
    source.onerror = function () { img.dataset.previewPrepared = 'false'; };
    source.src = originalUrl;
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        renderPreview();
      }
    }, {rootMargin: '160px'});
    observer.observe(img);
  } else {
    renderPreview();
  }
})();
