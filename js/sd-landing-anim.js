(function () {
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
