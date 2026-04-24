(function () {
  var loader = document.getElementById('sd-loader');
  if (!loader) return;
  var counter = loader.querySelector('.ld-counter');
  var barFill = loader.querySelector('.ld-bar-fill');
  var words = loader.querySelectorAll('.ld-word');
  var wordIndex = 0;
  var DURATION = 2700;
  var startTs = null;
  var rafDone = false;
  var wordTimer = setInterval(function () {
    words[wordIndex].classList.remove('ld-word-active');
    words[wordIndex].classList.add('ld-word-exit');
    wordIndex++;
    if (wordIndex < words.length) words[wordIndex].classList.add('ld-word-active');
    if (wordIndex >= words.length - 1) clearInterval(wordTimer);
  }, 900);
  function tick(ts) {
    if (!startTs) startTs = ts;
    var elapsed = ts - startTs;
    var progress = Math.min((elapsed / DURATION) * 100, 100);
    var rounded = Math.round(progress);
    if (counter) counter.textContent = rounded.toString().padStart(3, '0');
    if (barFill) barFill.style.transform = 'scaleX(' + (progress / 100) + ')';
    if (progress < 100) {
      requestAnimationFrame(tick);
    } else if (!rafDone) {
      rafDone = true;
      setTimeout(function () {
        loader.classList.add('ld-done');
        setTimeout(function () { loader.remove(); }, 700);
      }, 400);
    }
  }
  requestAnimationFrame(tick);
}());
