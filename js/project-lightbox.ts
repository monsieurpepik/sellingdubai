// ==========================================
// PROJECT LIGHTBOX (lazy loaded from project-detail.ts)
// ==========================================

import { optimizeImg } from './utils';

let _lbImgs: string[] = [];
let _lbIdx = 0;
let _lbScale = 1;

function _lbRender(): void {
  const img = document.getElementById('proj-lb-img') as HTMLImageElement | null;
  const counter = document.getElementById('proj-lb-counter');
  const prev = document.getElementById('proj-lb-prev') as HTMLElement | null;
  const next = document.getElementById('proj-lb-next') as HTMLElement | null;
  if (!img) return;
  img.src = optimizeImg(_lbImgs[_lbIdx] ?? '', 1200);
  img.style.transform = `scale(${_lbScale})`;
  if (counter) counter.textContent = `${_lbIdx + 1} / ${_lbImgs.length}`;
  const multi = _lbImgs.length > 1;
  if (prev) prev.style.display = multi ? 'flex' : 'none';
  if (next) next.style.display = multi ? 'flex' : 'none';
}

function _lbEnsureCreated(): void {
  if (document.getElementById('proj-lb')) return;
  const el = document.createElement('div');
  el.id = 'proj-lb';
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:none;flex-direction:column;align-items:stretch;';
  el.innerHTML = `
    <div style="position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;z-index:1;background:linear-gradient(#000a,transparent);">
      <div style="width:44px;"></div>
      <div id="proj-lb-counter" style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;font-family:'Inter',sans-serif;"></div>
      <button data-action="closeProjLightbox" aria-label="Close" style="width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2715;</button>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">
      <button data-action="lbStep" data-dir="-1" aria-label="Previous" id="proj-lb-prev" style="position:absolute;left:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2039;</button>
      <img id="proj-lb-img" style="max-width:100%;max-height:100%;object-fit:contain;touch-action:none;" src="" alt="">
      <button data-action="lbStep" data-dir="1" aria-label="Next" id="proj-lb-next" style="position:absolute;right:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x203A;</button>
    </div>`;
  document.body.appendChild(el);
  document.addEventListener('keydown', function _lbKey(e: KeyboardEvent) {
    const lb = document.getElementById('proj-lb');
    if (!lb || lb.style.display === 'none') return;
    if (e.key === 'Escape') window.closeProjLightbox!();
    else if (e.key === 'ArrowLeft') window._lbStep!(-1);
    else if (e.key === 'ArrowRight') window._lbStep!(1);
  });
  const img = el.querySelector('#proj-lb-img') as HTMLImageElement | null;
  if (!img) return;
  let _pinching = false;
  let _pinchDist = 0;
  let _touchStartX = 0;
  img.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 2) {
      _pinching = true;
      _pinchDist = Math.hypot(e.touches[0]!.clientX - e.touches[1]!.clientX, e.touches[0]!.clientY - e.touches[1]!.clientY);
    } else { _touchStartX = e.touches[0]!.clientX; _pinching = false; }
  }, { passive: true });
  img.addEventListener('touchmove', (e: TouchEvent) => {
    if (_pinching && e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0]!.clientX - e.touches[1]!.clientX, e.touches[0]!.clientY - e.touches[1]!.clientY);
      _lbScale = Math.max(1, Math.min(4, _lbScale * (dist / _pinchDist)));
      _pinchDist = dist;
      img.style.transform = `scale(${_lbScale})`;
    }
  }, { passive: true });
  img.addEventListener('touchend', (e: TouchEvent) => {
    if (e.touches.length < 2) _pinching = false;
    if (!_pinching && e.changedTouches.length === 1 && _lbScale <= 1.1) {
      const dx = e.changedTouches[0]!.clientX - _touchStartX;
      if (Math.abs(dx) > 50) window._lbStep!(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

export function setLightboxImages(imgs: string[]): void {
  _lbImgs = imgs;
}

export function lbStep(dir: number): void {
  _lbIdx = (_lbIdx + dir + _lbImgs.length) % _lbImgs.length;
  _lbScale = 1;
  _lbRender();
}

export function openProjLightbox(idx: number): void {
  _lbEnsureCreated();
  _lbIdx = idx;
  _lbScale = 1;
  const lb = document.getElementById('proj-lb') as HTMLElement | null;
  if (!lb) return;
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _lbRender();
}

export function closeProjLightbox(): void {
  const lb = document.getElementById('proj-lb') as HTMLElement | null;
  if (lb) lb.style.display = 'none';
  document.body.style.overflow = '';
}

// Register window globals on import
window._lbStep = lbStep;
window.openProjLightbox = openProjLightbox;
window.closeProjLightbox = closeProjLightbox;
