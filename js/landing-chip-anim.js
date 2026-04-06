// @ts-check
(() => {
  var chips = [
    document.getElementById('chip-dld'),
    document.getElementById('chip-wa'),
    document.getElementById('chip-stats')
  ];
  var wrap = document.getElementById('showcase-wrap');
  if (!wrap || !window.IntersectionObserver) {
    chips.forEach((c) => { if (c) c.classList.add('chip-visible'); });
    return;
  }
  var triggered = false;
  var observer = new IntersectionObserver((entries) => {
    if (triggered || !entries[0].isIntersecting) return;
    triggered = true;
    chips.forEach((c, i) => {
      if (!c) return;
      setTimeout(() => { c.classList.add('chip-visible'); }, i * 220);
    });
    observer.disconnect();
  }, { threshold: 0.2 });
  observer.observe(wrap);
})();
