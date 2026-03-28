// ==========================================
// PHOTO GALLERY + VIEWER (crossfade)
// ==========================================
let _photoViewerIdx = 0;
let _activeLayer = 'a'; // tracks which layer is currently visible

window.openFullGallery = function() {
  const images = window._currentDetailImages || [];
  if (!images.length) return;
  const body = document.getElementById('gallery-body');
  body.innerHTML = images.map((url, i) => `<img src="${url}" alt="" loading="lazy" onclick="openPhotoViewer(${i})" onerror="handleImgError(this)">`).join('');
  document.getElementById('gallery-count').textContent = `${images.length} Photos`;
  document.getElementById('gallery-overlay').classList.add('open');
};
window.closeFullGallery = function() {
  document.getElementById('gallery-overlay').classList.remove('open');
};

window.openPhotoViewer = function(idx) {
  const images = window._currentDetailImages || [];
  if (!images.length) return;
  _photoViewerIdx = Math.max(0, Math.min(idx, images.length - 1));
  // Set both layers to the same image on open (no crossfade needed)
  const imgA = document.getElementById('photo-viewer-img-a');
  const imgB = document.getElementById('photo-viewer-img-b');
  imgA.src = images[_photoViewerIdx];
  imgB.src = images[_photoViewerIdx];
  imgA.classList.add('active');
  imgB.classList.remove('active');
  _activeLayer = 'a';
  document.getElementById('photo-viewer-counter').textContent = `${_photoViewerIdx + 1} / ${images.length}`;
  document.getElementById('photo-viewer').classList.add('open');
};
window.swapDetailHero = function(idx) {
  const images = window._currentDetailImages || [];
  if (idx < 0 || idx >= images.length) return;
  window._currentDetailHeroIdx = idx;
  const hero = document.getElementById('detail-hero-img');
  if (hero) hero.src = images[idx];
};
window.closePhotoViewer = function() {
  document.getElementById('photo-viewer').classList.remove('open');
};
window.navPhoto = function(dir) {
  const images = window._currentDetailImages || [];
  _photoViewerIdx = (_photoViewerIdx + dir + images.length) % images.length;
  crossfadeTo(images[_photoViewerIdx]);
  document.getElementById('photo-viewer-counter').textContent = `${_photoViewerIdx + 1} / ${images.length}`;
};

function crossfadeTo(src) {
  const imgA = document.getElementById('photo-viewer-img-a');
  const imgB = document.getElementById('photo-viewer-img-b');
  // Load the new image on the hidden layer, then swap
  if (_activeLayer === 'a') {
    imgB.src = src;
    imgB.classList.add('active');
    imgA.classList.remove('active');
    _activeLayer = 'b';
  } else {
    imgA.src = src;
    imgA.classList.add('active');
    imgB.classList.remove('active');
    _activeLayer = 'a';
  }
}

// Swipe support for photo viewer
(function() {
  const el = document.getElementById('photo-viewer');
  if (!el) return;
  let startX = 0;
  el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) navPhoto(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
