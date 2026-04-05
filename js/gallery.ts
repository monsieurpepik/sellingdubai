// ==========================================
// PHOTO GALLERY + VIEWER (crossfade)
// ==========================================
import { escAttr } from './utils';

let _photoViewerIdx = 0;
let _activeLayer: 'a' | 'b' = 'a'; // tracks which layer is currently visible

window.openFullGallery = function() {
  const images = window._currentDetailImages ?? [];
  if (!images.length) return;
  const body = document.getElementById('gallery-body');
  if (!body) return;
  body.innerHTML = images.map((url, i) =>
    `<img src="${escAttr(url)}" alt="" loading="lazy" data-action="openPhotoViewer" data-dir="${i}" data-managed>`
  ).join('');
  const count = document.getElementById('gallery-count');
  if (count) count.textContent = `${images.length} Photos`;
  document.getElementById('gallery-overlay')?.classList.add('open');
};

window.closeFullGallery = function() {
  document.getElementById('gallery-overlay')?.classList.remove('open');
};

window.openPhotoViewer = function(idx: number) {
  const images = window._currentDetailImages ?? [];
  if (!images.length) return;
  _photoViewerIdx = Math.max(0, Math.min(idx, images.length - 1));
  const imgA = document.getElementById('photo-viewer-img-a') as HTMLImageElement | null;
  const imgB = document.getElementById('photo-viewer-img-b') as HTMLImageElement | null;
  if (!imgA || !imgB) return;
  imgA.src = images[_photoViewerIdx] ?? '';
  imgB.src = images[_photoViewerIdx] ?? '';
  imgA.classList.add('active');
  imgB.classList.remove('active');
  _activeLayer = 'a';
  const counter = document.getElementById('photo-viewer-counter');
  if (counter) counter.textContent = `${_photoViewerIdx + 1} / ${images.length}`;
  document.getElementById('photo-viewer')?.classList.add('open');
};

window.swapDetailHero = function(idx: number) {
  const images = window._currentDetailImages ?? [];
  if (idx < 0 || idx >= images.length) return;
  window._currentDetailHeroIdx = idx;
  const hero = document.getElementById('detail-hero-img') as HTMLImageElement | null;
  if (hero) hero.src = images[idx] ?? '';
};

window.closePhotoViewer = function() {
  document.getElementById('photo-viewer')?.classList.remove('open');
};

window.navPhoto = function(dir: number) {
  const images = window._currentDetailImages ?? [];
  _photoViewerIdx = (_photoViewerIdx + dir + images.length) % images.length;
  crossfadeTo(images[_photoViewerIdx] ?? '');
  const counter = document.getElementById('photo-viewer-counter');
  if (counter) counter.textContent = `${_photoViewerIdx + 1} / ${images.length}`;
};

function crossfadeTo(src: string): void {
  const imgA = document.getElementById('photo-viewer-img-a') as HTMLImageElement | null;
  const imgB = document.getElementById('photo-viewer-img-b') as HTMLImageElement | null;
  if (!imgA || !imgB) return;
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
  el.addEventListener('touchstart', (e: TouchEvent) => {
    startX = e.touches[0]!.clientX;
  }, { passive: true });
  el.addEventListener('touchend', (e: TouchEvent) => {
    const dx = e.changedTouches[0]!.clientX - startX;
    if (Math.abs(dx) > 50) window.navPhoto!(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
