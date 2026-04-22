// @ts-check
// ==========================================
// CSP-SAFE EVENT DELEGATION
// Replaces inline onclick/onchange/onerror/onload handlers
// in all JS-generated HTML templates.
// Imported by init.js (public profile) and the dashboard.html module bridge.
// ==========================================

// ---- Click delegation ----
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const { action, propId, dir, rate, bank, name, brochure } = el.dataset;

  // Anchor tags: prevent default navigation
  if (el.tagName === 'A') e.preventDefault();

  switch (action) {
    // Property cards (components.js)
    case 'openProperty':
      if (typeof window.openPropertyById === 'function') window.openPropertyById(propId);
      break;
    case 'toggleHeart':
      if (typeof window.toggleHeart === 'function') window.toggleHeart(el);
      break;
    case 'slideCarousel':
      if (typeof window.slideCarousel === 'function') window.slideCarousel(propId, Number(dir));
      break;

    // Admin cards (components.js / dashboard)
    case 'reorderProp':
      if (typeof window.reorderProp === 'function') window.reorderProp(propId, Number(dir));
      break;
    case 'shareProperty':
      if (typeof window.shareProperty === 'function') window.shareProperty(propId);
      break;
    case 'openPropModal':
      if (typeof window.openPropModal === 'function') window.openPropModal(propId);
      break;
    case 'deleteProp':
      if (typeof window.deletePropertyConfirm === 'function') window.deletePropertyConfirm(propId);
      break;

    // Agent page buttons (agent-page.js)
    case 'openLead':
      if (typeof window.openLead === 'function') window.openLead();
      break;
    case 'openProps':
      if (typeof window.openProps === 'function') window.openProps();
      break;
    case 'openMortgage':
      if (typeof window.openMortgage === 'function') window.openMortgage();
      break;
    case 'saveContact':
      if (typeof window.saveContact === 'function') window.saveContact();
      break;

    // Dashboard photo grid (dashboard.js)
    case 'removePropPhoto':
      if (typeof window.removePropPhoto === 'function') window.removePropPhoto(Number(propId));
      break;
    case 'triggerPhotoInput': {
      const inp = document.getElementById('prop-photo-input');
      if (inp) inp.click();
      break;
    }

    // Mortgage bank cards (mortgage.js)
    case 'selectBankRate':
      if (typeof window.selectBankRate === 'function') window.selectBankRate(el, Number(rate), bank);
      break;

    // Project detail (project-detail.js)
    case 'closeProjLightbox':
      if (typeof window.closeProjLightbox === 'function') window.closeProjLightbox();
      break;
    case 'lbStep':
      if (typeof window._lbStep === 'function') window._lbStep(Number(dir));
      break;
    case 'openProjLightbox':
      if (typeof window.openProjLightbox === 'function') window.openProjLightbox(Number(dir));
      break;
    case 'loadDetailMap':
      if (typeof window._loadDetailMap === 'function') window._loadDetailMap(el.parentElement);
      break;
    case 'expandDesc': {
      const d = document.getElementById('proj-desc');
      if (d) { d.style.webkitLineClamp = 'unset'; d.style.overflow = 'visible'; d.style.display = 'block'; }
      el.style.display = 'none';
      break;
    }
    case 'openLeadForBrochure':
      if (typeof window.openLeadForBrochure === 'function') window.openLeadForBrochure(name, brochure);
      break;
    case 'openLeadForProperty':
      if (typeof window.openLeadForProperty === 'function') window.openLeadForProperty(name);
      break;
    case 'openProjectMortgage':
      if (typeof window._openProjectMortgage === 'function') window._openProjectMortgage();
      break;

    // Property detail (property-detail.js)
    case 'openDetailHero':
      if (window._heroSwipeOccurred) { window._heroSwipeOccurred = false; break; }
      if (typeof window.openPhotoViewer === 'function') window.openPhotoViewer(window._currentDetailHeroIdx || 0);
      break;
    case 'swapDetailHero':
      if (typeof window.swapDetailHero === 'function') window.swapDetailHero(Number(dir));
      break;
    case 'openFullGallery':
      if (typeof window.openFullGallery === 'function') window.openFullGallery();
      break;
    case 'openMapUrl': {
      const mapUrl = el.dataset.url || '';
      if (mapUrl.startsWith('https://')) window.open(mapUrl, '_blank', 'noopener,noreferrer');
      break;
    }
    case 'toggleCostMode':
      if (typeof window.toggleCostMode === 'function') window.toggleCostMode(el, el.dataset.mode);
      break;
    case 'shareDetail': {
      const title = el.dataset.title || '';
      const shareUrl = window.location.href;
      if (navigator.share) {
        navigator.share({ title, url: shareUrl }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          const origHtml = el.innerHTML;
          el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25d366" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Copied!';
          setTimeout(() => { el.innerHTML = origHtml; }, 2000);
        });
      }
      break;
    }

    // Gallery (gallery.js)
    case 'openPhotoViewer':
      if (typeof window.openPhotoViewer === 'function') window.openPhotoViewer(Number(dir));
      break;

    // Properties panel (properties.js)
    case 'retryProperties':
      if (typeof window.retryProperties === 'function') window.retryProperties();
      break;
    case 'resetFilters':
      if (typeof window.resetFilters === 'function') window.resetFilters();
      break;
    case 'openProjectDetail':
      if (typeof window.openProjectDetail === 'function') window.openProjectDetail(el.dataset.slug);
      break;

    // Edit page (edit.js)
    case 'deleteProperty':
      if (typeof window.deleteProperty === 'function') window.deleteProperty(propId);
      break;

    // Off-plan mortgage (mortgage-offplan.js)
    case 'mortOpProceed':
      if (typeof window.mortOpProceed === 'function') window.mortOpProceed();
      break;

    // Testimonials + AI Secretary (dashboard.js)
    case 'addTestimonial':
      if (typeof window.addTestimonial === 'function') window.addTestimonial();
      break;
    case 'deleteTestimonial':
      if (typeof window.deleteTestimonial === 'function') window.deleteTestimonial(el.dataset.id);
      break;
    case 'sendSecretaryMessage':
      if (typeof window.sendSecretaryMessage === 'function') window.sendSecretaryMessage();
      break;
    case 'secretaryPrompt':
      if (typeof window.secretaryPrompt === 'function') window.secretaryPrompt(el);
      break;

    // Cobroke (dashboard.js)
    case 'cobrokeTab':
      if (typeof window.cobrokeTab === 'function') window.cobrokeTab(el.dataset.tab);
      break;
    case 'cobrokeApplyFilters':
      if (typeof window.cobrokeApplyFilters === 'function') window.cobrokeApplyFilters();
      break;
    case 'cobrokeLoadMore':
      if (typeof window.cobrokeLoadMore === 'function') window.cobrokeLoadMore();
      break;
    case 'cobrokeRequest':
      if (typeof window.cobrokeRequest === 'function') window.cobrokeRequest(el.dataset.propId);
      break;

    // Dashboard (dashboard.js)
    case 'sendMagicLink':
      if (typeof window.sendMagicLink === 'function') window.sendMagicLink();
      break;
    case 'showAuthForm':
      if (typeof window.showAuthForm === 'function') window.showAuthForm();
      break;
    case 'scrollToProperties':
      if (typeof window.scrollToProperties === 'function') window.scrollToProperties();
      break;
    case 'scrollToContacts':
      if (typeof window.scrollToContacts === 'function') window.scrollToContacts();
      break;
    case 'openContactTimeline':
      if (typeof window.openContactTimeline === 'function') window.openContactTimeline(el.dataset.phone, el.dataset.name);
      break;
    case 'closeTimelineModal':
      if (typeof window.closeTimelineModal === 'function') window.closeTimelineModal();
      break;
    case 'closeTimelineModalIfBackdrop':
      if (e.target === el && typeof window.closeTimelineModal === 'function') window.closeTimelineModal();
      break;
    case 'dismissReminder':
      if (typeof window.dismissReminder === 'function') window.dismissReminder(el.dataset.reminderId);
      break;
    case 'snoozeReminder':
      if (typeof window.snoozeReminder === 'function') window.snoozeReminder(el.dataset.reminderId, Number(el.dataset.days));
      break;
    case 'markReminderSent':
      if (typeof window.markReminderSent === 'function') window.markReminderSent(el.dataset.reminderId);
      break;
    case 'addNoteOpen':
      if (typeof window.addNoteOpen === 'function') window.addNoteOpen();
      break;
    case 'closeNoteModal':
      if (typeof window.closeNoteModal === 'function') window.closeNoteModal();
      break;
    case 'closeNoteModalIfBackdrop':
      if (e.target === el && typeof window.closeNoteModal === 'function') window.closeNoteModal();
      break;
    case 'saveNote':
      if (typeof window.saveNote === 'function') window.saveNote();
      break;
    case 'logout':
      if (typeof window.logout === 'function') window.logout();
      break;
    case 'copyProfileLink':
      if (typeof window.copyProfileLink === 'function') window.copyProfileLink();
      break;
    case 'dismissOnboarding':
      if (typeof window.dismissOnboarding === 'function') window.dismissOnboarding();
      break;
    case 'openAddListing':
      if (typeof window.scrollToProperties === 'function') window.scrollToProperties();
      if (typeof window.openPropModal === 'function') window.openPropModal(null);
      break;
    case 'openBillingPortal':
      if (typeof window.openBillingPortal === 'function') window.openBillingPortal();
      break;
    case 'copyReferralLink':
      if (typeof window.copyReferralLink === 'function') window.copyReferralLink();
      break;
    case 'closePropModal':
      if (typeof window.closePropModal === 'function') window.closePropModal();
      break;
    case 'closePropModalIfBackdrop':
      if (e.target === el && typeof window.closePropModal === 'function') window.closePropModal();
      break;
    case 'savePropModal':
      if (typeof window.savePropModal === 'function') window.savePropModal();
      break;
    case 'closeDeletePropModal':
      if (typeof window.closeDeletePropModal === 'function') window.closeDeletePropModal();
      break;
    case 'closeDeletePropModalIfBackdrop':
      if (e.target === el && typeof window.closeDeletePropModal === 'function') window.closeDeletePropModal();
      break;
    case 'confirmDeleteProp':
      if (typeof window.confirmDeleteProp === 'function') window.confirmDeleteProp();
      break;

    // Agency dashboard (agency-dashboard.js)
    case 'createAgency':
      if (typeof window.createAgency === 'function') window.createAgency();
      break;
    case 'toggleEditPanel':
      if (typeof window.toggleEditPanel === 'function') window.toggleEditPanel();
      break;
    case 'saveAgency':
      if (typeof window.saveAgency === 'function') window.saveAgency();
      break;
    case 'addMember':
      if (typeof window.addMember === 'function') window.addMember();
      break;
    case 'toggleInvitePanel':
      if (typeof window.toggleInvitePanel === 'function') window.toggleInvitePanel();
      break;
    case 'generateInvite':
      if (typeof window.generateInvite === 'function') window.generateInvite();
      break;
    case 'copyInviteUrl':
      if (typeof window.copyInviteUrl === 'function') window.copyInviteUrl();
      break;

    // Join page (join.js)
    case 'step1Next':
      if (typeof window.step1Next === 'function') window.step1Next();
      break;
    case 'verifyBroker':
      if (typeof window.verifyBroker === 'function') window.verifyBroker();
      break;
    case 'manualSubmit':
      if (typeof window.manualSubmit === 'function') window.manualSubmit();
      break;
    case 'sendOtpAndShow':
      if (typeof window.sendOtpAndShow === 'function') window.sendOtpAndShow();
      break;
    case 'verifyOtpAndCreate':
      if (typeof window.verifyOtpAndCreate === 'function') window.verifyOtpAndCreate();
      break;
    case 'resendOtp':
      if (typeof window.resendOtp === 'function') window.resendOtp();
      break;
    case 'goStep':
      if (typeof window.goStep === 'function') window.goStep(Number(el.dataset.step));
      break;
    case 'copyUrl':
      if (typeof window.copyUrl === 'function') window.copyUrl();
      break;
    case 'shareWhatsApp':
      if (typeof window.shareWhatsApp === 'function') window.shareWhatsApp();
      break;

    // Public profile / index.html (init.js, properties.js, mortgage.js, gallery.js)
    case 'nativeShare':
      if (typeof window.nativeShare === 'function') window.nativeShare();
      break;
    case 'closeLead':
      if (typeof window.closeLead === 'function') window.closeLead();
      break;
    case 'closeLeadIfBackdrop':
      if (e.target === el && typeof window.closeLead === 'function') window.closeLead();
      break;
    case 'toggleExtra':
      if (typeof window.toggleExtra === 'function') window.toggleExtra();
      break;
    case 'submitLead':
      if (typeof window.submitLead === 'function') window.submitLead();
      break;

    case 'closeProps':
      if (typeof window.closeProps === 'function') window.closeProps();
      break;
    case 'closePropsIfBackdrop':
      if (e.target === el && typeof window.closeProps === 'function') window.closeProps();
      break;
    case 'openFilters':
      if (typeof window.openFilters === 'function') window.openFilters();
      break;
    case 'toggleSidebarPill':
      if (typeof window.toggleSidebarPill === 'function') window.toggleSidebarPill(el, el.dataset.group);
      break;
    case 'clearSidebarFilters':
      if (typeof window.clearSidebarFilters === 'function') window.clearSidebarFilters();
      break;
    case 'applySidebarFilters':
      if (typeof window.applySidebarFilters === 'function') window.applySidebarFilters();
      break;
    case 'closeFilters':
      if (typeof window.closeFilters === 'function') window.closeFilters();
      break;
    case 'closeFiltersIfBackdrop':
      if (e.target === el && typeof window.closeFilters === 'function') window.closeFilters();
      break;
    case 'clearAllFilters':
      if (typeof window.clearAllFilters === 'function') window.clearAllFilters();
      break;
    case 'applyFilters':
      if (typeof window.applyFilters === 'function') window.applyFilters();
      break;
    case 'closeDetail':
      if (typeof window.closeDetail === 'function') window.closeDetail();
      break;
    case 'closeFullGallery':
      if (typeof window.closeFullGallery === 'function') window.closeFullGallery();
      break;
    case 'closePhotoViewer':
      if (typeof window.closePhotoViewer === 'function') window.closePhotoViewer();
      break;
    case 'closePhotoViewerIfBackdrop':
      if (e.target === el && typeof window.closePhotoViewer === 'function') window.closePhotoViewer();
      break;
    case 'navPhoto':
      if (typeof window.navPhoto === 'function') window.navPhoto(Number(el.dataset.dir));
      break;
    case 'closeMortgage':
      if (typeof window.closeMortgage === 'function') window.closeMortgage();
      break;
    case 'closeMortgageIfBackdrop':
      if (e.target === el && typeof window.closeMortgage === 'function') window.closeMortgage();
      break;
    case 'setMortField':
      if (typeof window.setMortField === 'function') window.setMortField(el, el.dataset.field, el.dataset.val);
      break;
    case 'mortCheckEligibility':
      if (typeof window.mortCheckEligibility === 'function') window.mortCheckEligibility();
      break;
    case 'mortCaptureAndProceed':
      if (typeof window.mortCaptureAndProceed === 'function') window.mortCaptureAndProceed();
      break;
    case 'setMortTerm':
      if (typeof window.setMortTerm === 'function') window.setMortTerm(el, Number(el.dataset.term));
      break;
    case 'mortGoStep':
      if (typeof window.mortGoStep === 'function') window.mortGoStep(Number(el.dataset.step));
      break;
    case 'mortSubmitApplication':
      if (typeof window.mortSubmitApplication === 'function') window.mortSubmitApplication();
      break;
    case 'cookieConsent':
      if (typeof window.__sdCookieConsent === 'function') window.__sdCookieConsent(el.dataset.choice);
      break;

    // Edit page (edit.js)
    case 'showAuth':
      if (typeof window.showAuth === 'function') window.showAuth();
      break;
    case 'triggerInput': {
      const inp = document.getElementById(el.dataset.target || '');
      if (inp) inp.click();
      break;
    }
    case 'addProperty':
      if (typeof window.addProperty === 'function') window.addProperty();
      break;
    case 'cancelPropForm':
      if (typeof window.cancelPropForm === 'function') window.cancelPropForm();
      break;
    case 'showPropForm':
      if (typeof window.showPropForm === 'function') window.showPropForm();
      break;
    case 'connectInstagram':
      if (typeof window.connectInstagram === 'function') window.connectInstagram();
      break;
    case 'disconnectInstagram':
      if (typeof window.disconnectInstagram === 'function') window.disconnectInstagram();
      break;
    case 'connectTikTok':
      if (typeof window.connectTikTok === 'function') window.connectTikTok();
      break;
    case 'disconnectTikTok':
      if (typeof window.disconnectTikTok === 'function') window.disconnectTikTok();
      break;
    case 'saveProfile':
      if (typeof window.saveProfile === 'function') window.saveProfile();
      break;
    case 'cancelCrop':
      if (typeof window.cancelCrop === 'function') window.cancelCrop();
      break;
    case 'confirmCrop':
      if (typeof window.confirmCrop === 'function') window.confirmCrop();
      break;

    // AI Secretary (dashboard.js)
    case 'copySecretaryPhone':
      if (typeof window.copySecretaryPhone === 'function') window.copySecretaryPhone();
      break;
    case 'copySecretaryToken':
      if (typeof window.copySecretaryToken === 'function') window.copySecretaryToken();
      break;
    case 'rotateSiriToken':
      if (typeof window.rotateSiriToken === 'function') window.rotateSiriToken();
      break;
  }
});

// ---- Change delegation ----
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action-change]');
  if (!el) return;
  const { actionChange, propId, leadId } = el.dataset;
  switch (actionChange) {
    case 'updatePropStatus':
      if (typeof window.updatePropStatus === 'function') window.updatePropStatus(propId, el.value, el);
      break;
    case 'updateLeadStatus':
      if (typeof window.updateLeadStatus === 'function') window.updateLeadStatus(leadId, el.value, el);
      break;
    case 'mortOpToggleAgent':
      if (typeof window._mortOpToggleAgent === 'function') window._mortOpToggleAgent(el.checked);
      break;
    case 'propPhotoPick':
      if (typeof window.onPropPhotoPick === 'function') window.onPropPhotoPick(el);
      break;

    // Join page (join.js)
    case 'previewRera':
      if (typeof window.previewRera === 'function') window.previewRera(el);
      break;
    case 'previewPhoto':
      if (typeof window.previewPhoto === 'function') window.previewPhoto(el);
      break;

    // Edit page (edit.js)
    case 'cropThenUpload':
      if (typeof window.cropThenUpload === 'function') window.cropThenUpload(el, el.dataset.uploadType);
      break;
    case 'uploadImage':
      if (typeof window.uploadImage === 'function') window.uploadImage(el, el.dataset.uploadType);
      break;
    case 'previewPropPhoto':
      if (typeof window.previewPropPhoto === 'function') window.previewPropPhoto(el);
      break;
  }
});

// ---- Input delegation ----
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action-input]');
  if (!el) return;
  switch (el.dataset.actionInput) {
    case 'calcMortgage':
      if (typeof window.calcMortgage === 'function') window.calcMortgage();
      break;
    case 'sidebarFilterChanged':
      if (typeof window.sidebarFilterChanged === 'function') window.sidebarFilterChanged();
      break;
  }
});

// ---- Image load/error management ----
// Replaces inline onload="this.classList.add('loaded')" and onerror="handleImgError(this)"
// Mark img elements with data-managed to opt in.
// Add data-onerror="hide" to use display:none fallback instead of handleImgError.
function setupManagedImg(img) {
  const onErr = img.dataset.onerror;
  const errHandler = onErr === 'hide'
    ? () => { img.style.display = 'none'; }
    : () => { if (typeof window.handleImgError === 'function') window.handleImgError(img); };

  if (img.complete) {
    if (img.naturalWidth > 0) img.classList.add('loaded');
    else errHandler();
  } else {
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    img.addEventListener('error', errHandler, { once: true });
  }
}

const _imgObserver = new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === 'IMG' && node.hasAttribute('data-managed')) {
        setupManagedImg(node);
      } else {
        node.querySelectorAll('img[data-managed]').forEach(setupManagedImg);
      }
    }
  }
});
_imgObserver.observe(document.body, { childList: true, subtree: true });
