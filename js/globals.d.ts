// Supabase JS client — loaded via CDN <script> in HTML before the bundle.
// Using @supabase/supabase-js types for full query result typing.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.ts';

declare global {
  // esbuild replaces these at bundle time via --define
  const __SUPABASE_URL__: string;
  const __SUPABASE_ANON_KEY__: string;

  // Window augmentation — globals set by IIFE scripts and read by Category A modules
  interface Window {
    // Supabase CDN namespace
    supabase: {
      createClient: (url: string, key: string, opts?: Record<string, unknown>) => SupabaseClient<Database>;
    };

    // Set by sd-config.js (IIFE)
    SD_CONFIG: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };

    // Lazy-load entry points set by init.ts and read by event-delegation.ts
    openFullGallery: (() => void) | undefined;
    openPhotoViewer: ((idx: number) => void) | undefined;
    openPropertyDetail: ((propIndex: number) => void) | undefined;
    openPropertyById: ((propId: string) => void) | undefined;
    openLead: (() => void) | undefined;
    openLeadForBrochure: ((projectName: string, brochureUrl: string) => void) | undefined;
    openLeadForProperty: ((propertyTitle: string) => void) | undefined;
    openFilters: (() => void) | undefined;
    openProps: (() => void) | undefined;
    openMortgage: (() => void) | undefined;
    initMortModal: ((opts: unknown) => void) | undefined;
    openProjectDetail: ((slug: string) => void) | undefined;
    closeDetail: (() => void) | undefined;

    // Set by utils.ts for inline onerror handlers
    handleImgError: ((img: HTMLImageElement) => void) | undefined;

    // Analytics / error tracking
    __sdTrackError: ((msg: string, ctx: Record<string, unknown>) => void) | undefined;
    __sd_ga_id: string | undefined;

    // Event delegation targets (set by dashboard.ts / edit.ts IIFE scripts)
    sendMagicLink: (() => void) | undefined;
    showAuthForm: (() => void) | undefined;
    logout: (() => void) | undefined;
    copyProfileLink: (() => void) | undefined;
    dismissOnboarding: (() => void) | undefined;
    openBillingPortal: (() => void) | undefined;
    copyReferralLink: (() => void) | undefined;
    closePropModal: (() => void) | undefined;
    savePropModal: (() => void) | undefined;
    closeDeletePropModal: (() => void) | undefined;
    confirmDeleteProp: (() => void) | undefined;
    deletePropertyConfirm: ((propId: string) => void) | undefined;
    openPropModal: ((propId: string | null) => void) | undefined;
    updatePropStatus: ((propId: string, status: string, el: HTMLElement) => void) | undefined;
    updateLeadStatus: ((leadId: string, status: string, el: HTMLElement) => void) | undefined;
    scrollToProperties: (() => void) | undefined;
    reorderProp: ((propId: string, dir: number) => void) | undefined;
    shareProperty: ((propId: string) => void) | undefined;
    removePropPhoto: ((idx: number) => void) | undefined;
    onPropPhotoPick: ((el: HTMLInputElement) => void) | undefined;

    // Carousel and gallery helpers
    toggleHeart: ((el: HTMLElement) => void) | undefined;
    slideCarousel: ((propId: string, dir: number) => void) | undefined;
    saveContact: (() => void) | undefined;
    selectBankRate: ((el: HTMLElement, rate: number, bank: string) => void) | undefined;
    closeProjLightbox: (() => void) | undefined;
    _lbStep: ((dir: number) => void) | undefined;
    openProjLightbox: ((idx: number) => void) | undefined;
    _loadDetailMap: ((container: HTMLElement) => void) | undefined;
    _openProjectMortgage: (() => void) | undefined;
    openDetailHero: (() => void) | undefined;
    swapDetailHero: ((dir: number) => void) | undefined;
    toggleCostMode: ((el: HTMLElement, mode: string) => void) | undefined;
    shareDetail: (() => void) | undefined;
    resetFilters: (() => void) | undefined;
    closeLead: (() => void) | undefined;
    toggleExtra: (() => void) | undefined;
    submitLead: (() => void) | undefined;
    closeProps: (() => void) | undefined;
    toggleSidebarPill: ((el: HTMLElement, group: string) => void) | undefined;
    clearSidebarFilters: (() => void) | undefined;
    applySidebarFilters: (() => void) | undefined;
    closeFilters: (() => void) | undefined;
    clearAllFilters: (() => void) | undefined;
    applyFilters: (() => void) | undefined;
    closeFullGallery: (() => void) | undefined;
    closePhotoViewer: (() => void) | undefined;
    navPhoto: ((dir: number) => void) | undefined;
    closeMortgage: (() => void) | undefined;
    setMortField: ((el: HTMLElement, field: string, val: string) => void) | undefined;
    mortCheckEligibility: (() => void) | undefined;
    mortCaptureAndProceed: (() => void) | undefined;
    setMortTerm: ((el: HTMLElement, term: number) => void) | undefined;
    mortGoStep: ((step: number) => void) | undefined;
    mortSubmitApplication: (() => void) | undefined;
    __sdCookieConsent: ((choice: string) => void) | undefined;
    nativeShare: (() => void) | undefined;
    sidebarFilterChanged: (() => void) | undefined;
    calcMortgage: (() => void) | undefined;

    // Mortgage offplan
    mortOpProceed: (() => void) | undefined;
    _mortOpToggleAgent: ((checked: boolean) => void) | undefined;

    // Gallery internals
    _currentDetailImages: string[] | undefined;
    _currentDetailHeroIdx: number | undefined;

    // Join page
    verifyBroker: (() => void) | undefined;
    manualSubmit: (() => void) | undefined;
    sendOtpAndShow: (() => void) | undefined;
    verifyOtpAndCreate: (() => void) | undefined;
    resendOtp: (() => void) | undefined;
    goStep: ((step: number) => void) | undefined;
    copyUrl: (() => void) | undefined;
    shareWhatsApp: (() => void) | undefined;
    previewRera: ((el: HTMLInputElement) => void) | undefined;
    previewPhoto: ((el: HTMLInputElement) => void) | undefined;

    // Edit page
    showAuth: (() => void) | undefined;
    addProperty: (() => void) | undefined;
    cancelPropForm: (() => void) | undefined;
    showPropForm: (() => void) | undefined;
    connectInstagram: (() => void) | undefined;
    disconnectInstagram: (() => void) | undefined;
    connectTikTok: (() => void) | undefined;
    disconnectTikTok: (() => void) | undefined;
    saveProfile: (() => void) | undefined;
    cancelCrop: (() => void) | undefined;
    confirmCrop: (() => void) | undefined;
    cropThenUpload: ((el: HTMLInputElement, uploadType: string) => void) | undefined;
    uploadImage: ((el: HTMLInputElement, uploadType: string) => void) | undefined;
    previewPropPhoto: ((el: HTMLInputElement) => void) | undefined;
    deleteProperty: ((propId: string) => void) | undefined;

    // Agency dashboard
    createAgency: (() => void) | undefined;
    toggleEditPanel: (() => void) | undefined;
    saveAgency: (() => void) | undefined;
    addMember: (() => void) | undefined;

    // renderAdminCard bridge (components.ts -> dashboard.js)
    renderAdminCard: ((p: unknown, idx: number, total: number, statusLabels: Record<string, string>) => string) | undefined;

    // Allow dynamic window property checks in event-delegation.ts
    [key: string]: unknown;
  }
}

export {};
