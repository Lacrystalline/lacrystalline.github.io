/* La Crystalline / Member portrait previews v2
 * High-quality screen-sized previews, one at a time while near the carousel viewport.
 * All originals remain untouched; original src stays available on failure.
 */
(function () {
  'use strict';
  const carousel = document.getElementById('memberCarousel');
  if (!carousel || typeof window.createImageBitmap !== 'function' || typeof window.IntersectionObserver !== 'function') return;

  const images = Array.from(carousel.querySelectorAll('.member-card .portrait > img:first-child'));
  if (!images.length) return;
  const ready = new WeakSet();
  const queued = new WeakSet();
  const queue = [];
  const objectURLs = [];
  let working = false;
  let scheduled = false;

  function queueImage(img) {
    if (ready.has(img) || queued.has(img)) return;
    if (!img.complete) {
      img.addEventListener('load', function loaded() { queueImage(img); }, { once: true });
      return;
    }
    if (!img.naturalWidth || !img.naturalHeight) return;
    queued.add(img);
    queue.push(img);
    schedule();
  }

  function schedule() {
    if (scheduled || working || queue.length === 0 || document.hidden) return;
    scheduled = true;
    const run = function () {
      scheduled = false;
      if (document.hidden) return;
      processNext();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      window.setTimeout(run, 80);
    }
  }

  async function createPreview(img) {
    const rect = img.getBoundingClientRect();
    if (rect.width < 40 || !img.isConnected) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const outWidth = Math.min(img.naturalWidth, Math.ceil(rect.width * dpr));
    const outHeight = Math.max(1, Math.round(outWidth * img.naturalHeight / img.naturalWidth));
    if (outWidth >= img.naturalWidth) return;

    let bitmap;
    try {
      bitmap = await window.createImageBitmap(img, {
        resizeWidth: outWidth,
        resizeHeight: outHeight,
        resizeQuality: 'high'
      });
      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob || !img.isConnected) return;
      const url = URL.createObjectURL(blob);
      // Predecode before swapping, avoiding a blank flash during carousel navigation.
      try {
        const preview = new Image();
        preview.src = url;
        await preview.decode();
        img.src = url;
        objectURLs.push(url);
      } catch (_) {
        URL.revokeObjectURL(url);
      }
    } catch (_) {
      // Keep the original file displayed on unsupported or resource-limited devices.
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
    }
  }

  async function processNext() {
    if (working || !queue.length) return;
    working = true;
    const img = queue.shift();
    try {
      if (img && !ready.has(img)) {
        await createPreview(img);
        ready.add(img);
      }
    } finally {
      working = false;
      schedule();
    }
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        queueImage(entry.target);
      }
    });
  }, { root: carousel, rootMargin: '0px 125px', threshold: 0 });
  images.forEach(img => observer.observe(img));

  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', function () {
    objectURLs.forEach(url => URL.revokeObjectURL(url));
  }, { once: true });
})();
