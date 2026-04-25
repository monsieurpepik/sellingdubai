(function () {
  // Force video play on iOS — Safari sometimes shows native play button
  // despite autoplay+muted+playsinline if the video isn't triggered via JS
  var vid = document.querySelector('.video-bg video');
  if (vid) {
    var playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise.catch(function () {
        // Autoplay blocked — hide video so gradient fallback shows cleanly
        vid.style.display = 'none';
      });
    }
  }

  // Smooth page transition — fade out before navigating
  var style = document.createElement('style');
  style.textContent = '.page-exit { animation: pageExit 0.28s ease forwards; } @keyframes pageExit { to { opacity: 0; transform: translateY(-10px); } }';
  document.head.appendChild(style);

  document.querySelectorAll('a[href]').forEach(function (a) {
    var href = a.getAttribute('href');
    // Only internal same-tab links
    if (!href || href.startsWith('http') || href.startsWith('#') || a.target === '_blank') return;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var dest = href;
      document.querySelector('.page').classList.add('page-exit');
      setTimeout(function () { window.location.href = dest; }, 260);
    });
  });

  var slug = document.getElementById('slug');
  if (!slug) return;

  var names = ['ahmed-al-mansoori', 'sarah.johnson', 'boban-pepic', 'layla.al-rashidi'];
  var nameIndex = 0;
  var charIndex = 0;
  var isDeleting = false;

  function type() {
    var current = names[nameIndex];

    if (!isDeleting) {
      charIndex++;
      slug.textContent = current.slice(0, charIndex);
      if (charIndex === current.length) {
        isDeleting = true;
        setTimeout(type, 2200);
        return;
      }
      setTimeout(type, 68);
    } else {
      charIndex--;
      slug.textContent = current.slice(0, charIndex);
      if (charIndex === 0) {
        isDeleting = false;
        nameIndex = (nameIndex + 1) % names.length;
        setTimeout(type, 320);
        return;
      }
      setTimeout(type, 34);
    }
  }

  // Start after entrance animations settle
  setTimeout(function () {
    slug.classList.add('typing');
    slug.textContent = '';
    charIndex = 0;
    type();
  }, 1800);
}());
