// @ts-check

(function() {
  // Cache DOM elements
  const overlay = document.getElementById('wizard-overlay');
  const closeBtn = document.getElementById('wizard-close');
  const backBtn = document.getElementById('wizard-back');
  const step1 = document.getElementById('wizard-step-1');
  const step2 = document.getElementById('wizard-step-2');
  const step3 = document.getElementById('wizard-step-3');
  const form1 = document.getElementById('wizard-form-1');
  const form2 = document.getElementById('wizard-form-2');
  const step1Error = document.getElementById('step1-error');
  const step2Error = document.getElementById('step2-error');

  // Early return if any required element is missing
  if (!overlay || !step1 || !step2 || !step3 || !form1 || !form2) {
    return;
  }

  // Module-level data store
  const data = {
    name: '',
    email: '',
    whatsapp: null
  };

  // Get Supabase URL with fallback
  function getSupabaseUrl() {
    return window.__SD_SUPABASE_URL__ || 'https://pjyorgedaxevxophpfib.supabase.co';
  }

  // Email validation regex
  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Open wizard
  function openWizard() {
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    showStep(1);

    // Focus name input after 60ms
    const nameInput = form1.querySelector('input[name="name"]');
    if (nameInput) {
      setTimeout(() => {
        nameInput.focus();
      }, 60);
    }
  }

  // Close wizard
  function closeWizard() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Show specific step
  function showStep(n) {
    // Toggle visibility of step containers
    step1.classList.toggle('wz-hidden', n !== 1);
    step2.classList.toggle('wz-hidden', n !== 2);
    step3.classList.toggle('wz-hidden', n !== 3);

    // Update progress dots
    const dots = document.querySelectorAll('.wz-dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index < n);
    });
  }

  // Handle open wizard trigger
  document.querySelectorAll('[data-open-wizard]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openWizard();
    });
  });

  // Handle close button
  closeBtn.addEventListener('click', () => {
    closeWizard();
  });

  // Handle overlay click to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeWizard();
    }
  });

  // Handle Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeWizard();
    }
  });

  // Handle back button
  backBtn.addEventListener('click', () => {
    showStep(1);
  });

  // Handle form1 submit (step 1 → step 2)
  form1.addEventListener('submit', (e) => {
    e.preventDefault();

    // Clear error
    step1Error.textContent = '';

    // Get form values
    const nameInput = form1.querySelector('input[name="name"]');
    const emailInput = form1.querySelector('input[name="email"]');
    const whatsappInput = form1.querySelector('input[name="whatsapp"]');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const whatsapp = whatsappInput.value.trim() || null;

    // Validate name
    if (name.length < 2) {
      step1Error.textContent = 'Name must be at least 2 characters';
      nameInput.focus();
      return;
    }

    // Validate email
    if (!isValidEmail(email)) {
      step1Error.textContent = 'Please enter a valid email address';
      emailInput.focus();
      return;
    }

    // Store data
    data.name = name;
    data.email = email;
    data.whatsapp = whatsapp;

    // Move to step 2
    showStep(2);

    // Focus BRN input after moving to step 2
    var brnEl = /** @type {HTMLInputElement|null} */ (form2.querySelector('[name="brn"]'));
    if (brnEl) setTimeout(function () { brnEl.focus(); }, 60);
  });

  // Handle form2 submit (step 2 → POST → step 3)
  form2.addEventListener('submit', (e) => {
    e.preventDefault();

    // Clear error
    step2Error.textContent = '';

    // Get form values
    const brnInput = form2.querySelector('input[name="brn"]');
    const brn = brnInput.value.trim();

    // Validate BRN
    if (!brn) {
      step2Error.textContent = 'Please enter your BRN (DLD Licence Number)';
      brnInput.focus();
      return;
    }

    // Disable submit button
    const submitBtn = form2.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    // Prepare payload
    const payload = {
      name: data.name,
      email: data.email,
      whatsapp: data.whatsapp
    };

    // Get Supabase URL and construct endpoint
    const supabaseUrl = getSupabaseUrl();
    const endpoint = `${supabaseUrl}/functions/v1/waitlist-join`;

    // POST to waitlist-join
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(response => {
        // Always show success on any response (2xx or non-2xx)
        showStep(3);
      })
      .catch(error => {
        // Network error
        step2Error.textContent = 'Something went wrong. Please try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Claim My Profile →';
      });
  });
})();
