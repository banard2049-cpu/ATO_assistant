(function () {
  'use strict';
  const image = document.getElementById('imageZoomImg');
  const notice = document.getElementById('imageZoomNotice');
  const content = image.closest('.image-zoom-content');

  function update() {
    if (!content.classList.contains('has-side-notices') || !image.complete || !image.naturalWidth) return;
    // Use the rendered card's CSS size. Viewport units can oversize the
    // reminders when the main card is limited by its width or intrinsic size.
    const height = parseFloat(getComputedStyle(image).height);
    if (!(height > 0)) return;
    const gap = parseFloat(getComputedStyle(notice).rowGap) || 0;
    const half = `${Math.max(0, (height - gap) / 2).toFixed(3)}px`;
    if (content.style.getPropertyValue('--image-zoom-half-card-height') !== half) {
      content.style.setProperty('--image-zoom-half-card-height', half);
    }
  }

  if (window.ResizeObserver) new ResizeObserver(update).observe(image);
  new MutationObserver(update).observe(content, { attributes: true, attributeFilter: ['class'] });
  image.addEventListener('load', update);
  window.addEventListener('resize', update);
  update();
})();
