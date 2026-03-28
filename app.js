// ========== SELLING DUBAI — Agent Profile App ==========
// Architecture: Separated JS module for scalability
// Config flags at the top for easy toggling

(function() {
  'use strict';

  // ==========================================
  // CONFIGURATION
  // ==========================================
  const DEMO_MODE = false; // Set to true to inject fake photos/amenities/descriptions for preview
  const SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeW9yZ2VkYXhldnhvcGhwZmliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjU2MzYsImV4cCI6MjA4OTgwMTYzNn0.IhIpAxk--Y0ZKufK51-CPuhw-NafyLPvhH31iqzpgrU';
  const CAPTURE_URL = `${SUPABASE_URL}/functions/v1/capture-lead`;
  const LOG_EVENT_URL = SUPABASE_URL + '/functions/v1/log-event';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let currentAgent = null;

  // ==========================================
  // UTILITIES
  // ==========================================
  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function escAttr(str) {
    return escHtml(str);
  }

  // Validate URLs — block javascript: and data: protocols
  function safeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
    // Allow http, https, mailto, tel, and protocol-relative
    if (/^(https?:\/\/|mailto:|tel:|\/)/.test(trimmed)) return trimmed;
    // Bare domain or path — prefix with https
    return trimmed;
  }

  // Validate tracking IDs — alphanumeric, hyphens, underscores only
  function safeTrackingId(id) {
    if (!id) return '';
    return /^[A-Za-z0-9\-_]+$/.test(id) ? id : '';
  }

  // Image error fallback — replaces broken images with a styled placeholder
  function handleImgError(img) {
    const parent = img.parentElement;
    const fallback = document.createElement('div');
    fallback.className = 'img-error';
    fallback.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
    img.replaceWith(fallback);
  }
  // Expose globally for inline onerror handlers
  window.handleImgError = handleImgError;

  // ==========================================
  // ROUTING
  // ==========================================
  function getAgentSlug() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const parts = path.split('/');
    if (parts[0] === 'a' && parts[1]) return parts[1];
    if (parts.length === 1 && parts[0]) return parts[0];
    const params = new URLSearchParams(window.location.search);
    return params.get('agent') || null;
  }

  // ==========================================
  // ICONS
  // ==========================================
  const ICONS = {
    whatsapp: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
    calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>',
    shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>',
    contact: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 0H4v2h16V0zM4 24h16v-2H4v2zM20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 2.75c1.24 0 2.25 1.01 2.25 2.25s-1.01 2.25-2.25 2.25S9.75 10.24 9.75 9s1.01-2.25 2.25-2.25zM17 17H7v-1.5c0-1.67 3.33-2.5 5-2.5s5 .83 5 2.5V17z"/></svg>',
    instagram: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
    youtube: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    tiktok: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.84a8.27 8.27 0 0 0 4.84 1.57V6.97a4.84 4.84 0 0 1-1.08-.28z"/></svg>',
    linkedin: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>'
  };

  // ==========================================
  // ANALYTICS
  // ==========================================
  function logEvent(eventType, metadata) {
    if (!currentAgent) return;
    const params = new URLSearchParams(window.location.search);
    let referrerSource = params.get('utm_source') || '';
    if (!referrerSource && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.hostname.includes('instagram')) referrerSource = 'instagram';
        else if (ref.hostname.includes('tiktok')) referrerSource = 'tiktok';
        else if (ref.hostname.includes('linkedin')) referrerSource = 'linkedin';
        else if (ref.hostname.includes('youtube')) referrerSource = 'youtube';
        else if (ref.hostname.includes('facebook') || ref.hostname.includes('fb.')) referrerSource = 'facebook';
        else if (ref.hostname.includes('t.co') || ref.hostname.includes('twitter') || ref.hostname.includes('x.com')) referrerSource = 'twitter';
        else referrerSource = ref.hostname;
      } catch(e) { referrerSource = 'direct'; }
    }
    if (!referrerSource) referrerSource = 'direct';

    const payload = {
      agent_id: currentAgent.id,
      event_type: eventType,
      metadata: { ...metadata, referrer_source: referrerSource, device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop' },
      referrer: document.referrer || null,
    };
    fetch(LOG_EVENT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  }

  async function trackPageView(agentId) {
    setTimeout(() => logEvent('view', {}), 300);
  }

  // Click tracking via event delegation
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-track]');
    if (!btn || !currentAgent) return;
    const trackType = btn.dataset.track;
    const trackUrl = btn.dataset.url || '';
    if (trackType === 'whatsapp') logEvent('whatsapp_tap', { url: trackUrl });
    else if (trackType === 'phone') logEvent('phone_tap', {});
    else logEvent('link_click', { link_type: trackType, url: trackUrl });
  });

  // ==========================================
  // VCARD GENERATOR
  // ==========================================
  window.saveContact = function() {
    if (!currentAgent) return;
    const a = currentAgent;
    const nameParts = a.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const waNum = (a.whatsapp || '').replace(/[^0-9+]/g, '');
    const profileUrl = `https://sellingdubai.ae/a/${a.slug}`;

    let vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${lastName};${firstName};;;`,
      `FN:${a.name}`,
    ];
    if (a.agency_name) vcard.push(`ORG:${a.agency_name}`);
    if (a.tagline) vcard.push(`TITLE:${a.tagline}`);
    if (waNum) vcard.push(`TEL;TYPE=CELL:${waNum}`);
    if (a.email) vcard.push(`EMAIL;TYPE=WORK:${a.email}`);
    vcard.push(`URL:${profileUrl}`);
    if (a.instagram_url) vcard.push(`X-SOCIALPROFILE;TYPE=instagram:${a.instagram_url}`);
    if (a.linkedin_url) vcard.push(`X-SOCIALPROFILE;TYPE=linkedin:${a.linkedin_url}`);
    if (a.photo_url) vcard.push(`PHOTO;VALUE=URI:${a.photo_url}`);
    vcard.push(`NOTE:Dubai Real Estate Agent | SellingDubai.ae`);
    vcard.push('END:VCARD');

    const vcardStr = vcard.join('\r\n');
    const blob = new Blob([vcardStr], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.slug}.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logEvent('link_click', { link_type: 'save_contact' });
  };

  // ==========================================
  // DEMO DATA (only used when DEMO_MODE = true)
  // ==========================================
  const DEMO_PHOTOS = [
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80',
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80',
    'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800&q=80',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80',
    'https://images.unsplash.com/photo-1600573472556-e636c2acda9e?w=800&q=80',
    'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=800&q=80',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80',
  ];
  const DEMO_AMENITIES = [
    ['Landmark View', 'Private Pool', 'Private Garden', 'In-House Gym', 'Barbecue Area', 'Private Jacuzzi'],
    ['Sea View', 'Private Pool', 'Covered Parking', 'Balcony', 'Built-in Wardrobes', 'Central A/C'],
    ['Burj Khalifa View', 'Infinity Pool', 'Smart Home', 'Private Gym', "Maid's Room", 'Walk-in Closet'],
    ['Marina View', 'Private Beach', 'Concierge', 'Covered Parking', "Children's Play Area", 'Sauna'],
    ['Golf Course View', 'Private Pool', "Driver's Room", 'Landscaped Garden', 'Outdoor Kitchen', 'Study Room'],
  ];
  const DEMO_DESCRIPTIONS = [
    'This stunning property offers panoramic views and world-class finishes throughout. Featuring an open-plan living area that flows seamlessly to a private terrace, designer kitchen with premium appliances, and spa-inspired bathrooms. The residence includes dedicated parking, 24/7 concierge service, and access to resort-style amenities.',
    "An exceptional residence in one of Dubai's most sought-after communities. Thoughtfully designed interiors with floor-to-ceiling windows maximize natural light and capture breathtaking views. The property boasts Italian marble flooring, a gourmet kitchen, and generous entertainment spaces perfect for hosting.",
    'Immaculately presented and move-in ready, this property combines luxury living with practical design. High ceilings and an intelligent layout create a sense of space and grandeur. Premium fixtures and fittings throughout, with a private outdoor area ideal for year-round entertaining.',
    'A rare opportunity to own in this prestigious development. This beautifully appointed property features bespoke joinery, smart home automation, and premium finishes in every room. Residents enjoy exclusive access to world-class leisure facilities including pools, gyms, and landscaped gardens.',
  ];

  function injectDemoPhotos(p) {
    if (!DEMO_MODE) return p;
    const seed = (p.title || '').length + (p.id || '').length;
    const result = { ...p };
    if (!result.additional_photos || result.additional_photos.length === 0) {
      const count = 4 + (seed % 3);
      const shuffled = [...DEMO_PHOTOS].sort((a, b) => Math.sin(seed * 9301 + DEMO_PHOTOS.indexOf(a)) - Math.sin(seed * 7919 + DEMO_PHOTOS.indexOf(b)));
      result.additional_photos = shuffled.slice(0, count);
    }
    if (!result.features || result.features.length === 0) {
      result.features = DEMO_AMENITIES[seed % DEMO_AMENITIES.length];
    }
    if (!result.description) {
      result.description = DEMO_DESCRIPTIONS[seed % DEMO_DESCRIPTIONS.length];
    }
    if (!result.property_type) {
      const types = ['Villa', 'Apartment', 'Penthouse', 'Townhouse', 'Duplex'];
      result.property_type = types[seed % types.length];
    }
    if (!result.land_area && (result.property_type || '').toLowerCase().includes('villa')) {
      result.land_area = 3000 + (seed * 500 % 8000);
    }
    return result;
  }

  // ==========================================
  // PROPERTY STATUS MAP
  // ==========================================
  const STATUS_MAP = {
    'just_listed': { label: 'Just Listed', css: 'prop-tag-just-listed' },
    'available':   { label: 'Available',   css: 'prop-tag-available' },
    'open_house':  { label: 'Open House',  css: 'prop-tag-open-house' },
    'under_offer': { label: 'Under Offer', css: 'prop-tag-under-offer' },
    'just_sold':   { label: 'Just Sold',   css: 'prop-tag-just-sold' },
    'sold':        { label: 'Sold',        css: 'prop-tag-sold' },
    'rented':      { label: 'Rented',      css: 'prop-tag-rented' },
  };

  // ==========================================
  // PROPERTY LOADING
  // ==========================================
  let propertiesLoaded = false;
  let propertiesCache = [];

  async function loadProperties(agentId) {
    if (propertiesLoaded) return propertiesCache;
    const { data: props } = await supabase
      .from('properties')
      .select('id,title,image_url,additional_photos,price,location,property_type,bedrooms,bathrooms,area_sqft,features,description,listing_type,status,developer,handover_date,payment_plan,dld_permit,reference_number,sort_order,created_at,is_active')
      .eq('agent_id', agentId)
      .neq('is_active', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(20);
    propertiesCache = (props || []).map(injectDemoPhotos);
    propertiesLoaded = true;
    return propertiesCache;
  }

  // ==========================================
  // FEATURE ICONS (for property cards)
  // ==========================================
  const FEAT_ICONS = {
    pool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M2 19c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><circle cx="8" cy="8" r="2"/><path d="M16 8h-4l-2 3"/></svg>',
    gym: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 6.5h11M6.5 17.5h11"/><rect x="2" y="8" width="4" height="8" rx="1"/><rect x="18" y="8" width="4" height="8" rx="1"/><path d="M6.5 12h11"/></svg>',
    view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    parking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 010 6H9"/></svg>',
    garden: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V12"/><path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5"/><path d="M4 15c0-3.31 3.58-6 8-6s8 2.69 8 6"/></svg>',
    balcony: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 15h18"/><path d="M3 15v5h18v-5"/><path d="M9 15V5h6v10"/><path d="M9 10h6"/></svg>',
    beach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.5 19H9.5l1-4h6l1 4z"/><path d="M12 2v6"/><path d="M7.5 8l3-5.2M16.5 8l-3-5.2"/><path d="M2 19h20"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10"/></svg>',
    default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
  };

  function getFeatureIcon(featureName) {
    if (!featureName) return FEAT_ICONS.default;
    const fl = featureName.toLowerCase();
    if (fl.includes('pool')) return FEAT_ICONS.pool;
    if (fl.includes('gym') || fl.includes('fitness')) return FEAT_ICONS.gym;
    if (fl.includes('view') || fl.includes('landmark') || fl.includes('sea') || fl.includes('marina') || fl.includes('panoram')) return FEAT_ICONS.view;
    if (fl.includes('parking') || fl.includes('garage')) return FEAT_ICONS.parking;
    if (fl.includes('garden') || fl.includes('terrace')) return FEAT_ICONS.garden;
    if (fl.includes('balcony') || fl.includes('loggia')) return FEAT_ICONS.balcony;
    if (fl.includes('beach') || fl.includes('waterfront') || fl.includes('coastal')) return FEAT_ICONS.beach;
    if (fl.includes('furnish') || fl.includes('maid') || fl.includes('smart') || fl.includes('duplex') || fl.includes('penthouse')) return FEAT_ICONS.home;
    return FEAT_ICONS.default;
  }

  // ==========================================
  // RENDER PROPERTY CARD
  // ==========================================
  function renderPropertyCard(p, idx) {
    const st = STATUS_MAP[p.status] || STATUS_MAP['available'];
    const safeTitle = escAttr(p.title);
    const propId = escAttr(String(p.id || idx));

    // Build image carousel or single image
    const extras = p.additional_photos || [];
    const allImages = p.image_url ? [p.image_url, ...extras.slice(0, 4)] : [];
    let imgSection = '';

    // Heart / favorite button
    const heartBtn = `<button class="prop-heart" onclick="event.stopPropagation();toggleHeart(this)" aria-label="Save property"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>`;

    if (allImages.length > 1) {
      const slides = allImages.map((url, i) =>
        `<img src="${escAttr(url)}" alt="${safeTitle}" loading="${i === 0 ? 'eager' : 'lazy'}" onload="this.classList.add('loaded')" onerror="handleImgError(this)">`
      ).join('');
      const dots = allImages.map((_, i) =>
        `<div class="prop-carousel-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></div>`
      ).join('');
      imgSection = `<div class="prop-carousel" data-card-id="${propId}">
        <div class="prop-carousel-track">${slides}</div>
        <div class="prop-carousel-dots">${dots}</div>
        <button class="prop-carousel-nav prev" onclick="event.stopPropagation();slideCarousel('${propId}',-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button class="prop-carousel-nav next" onclick="event.stopPropagation();slideCarousel('${propId}',1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>
        ${heartBtn}
        <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
      </div>`;
    } else if (allImages.length === 1) {
      imgSection = `<div class="prop-img-wrap">
        <img class="prop-img" src="${escAttr(allImages[0])}" alt="${safeTitle}" loading="lazy" onload="this.classList.add('loaded')" onerror="handleImgError(this)">
        ${heartBtn}
        <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
      </div>`;
    } else {
      imgSection = `<div class="prop-img-wrap">
        <div class="prop-img-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>
        ${heartBtn}
        <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
      </div>`;
    }

    // ALWAYS render every line — empty placeholder if no data — uniform card height
    const locationText = p.location ? escHtml(p.location.split(',')[0]) : '\u00A0';
    const locationHtml = `<div class="prop-location">${p.location ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>' : ''}${locationText}</div>`;

    const titleHtml = `<div class="prop-title">${p.title ? escHtml(p.title) : '\u00A0'}</div>`;

    let priceHtml = '';
    if (p.price) {
      const priceStr = escHtml(p.price);
      const hasAED = /AED/i.test(priceStr);
      if (hasAED) {
        const cleanVal = priceStr.replace(/AED\s*/i, '').trim();
        priceHtml = `<div class="prop-price"><span class="prop-price-currency">AED</span><span class="prop-price-value">${cleanVal}</span></div>`;
      } else {
        priceHtml = `<div class="prop-price"><span class="prop-price-value">${priceStr}</span></div>`;
      }
    } else {
      priceHtml = `<div class="prop-price"><span class="prop-price-value">\u00A0</span></div>`;
    }

    const specParts = [];
    if (p.bedrooms) specParts.push(`${p.bedrooms} Bed${p.bedrooms > 1 ? 's' : ''}`);
    if (p.bathrooms) specParts.push(`${p.bathrooms} Bath${p.bathrooms > 1 ? 's' : ''}`);
    if (p.area_sqft) specParts.push(`${p.area_sqft.toLocaleString()} sqft`);
    if (p.property_type) specParts.push(escHtml(p.property_type));
    const specsHtml = `<div class="prop-specs-inline">${specParts.length > 0 ? specParts.join('<span class="spec-dot">·</span>') : '\u00A0'}</div>`;

    // Desktop-only extras: amenity pills + description preview
    const features = p.features || [];
    const featurePillsHtml = features.length > 0
      ? `<div class="prop-card-features">${features.slice(0, 6).map(f => `<span class="prop-card-pill">${escHtml(f)}</span>`).join('')}${features.length > 6 ? `<span class="prop-card-pill prop-card-pill-more">+${features.length - 6}</span>` : ''}</div>`
      : '';
    const descPreview = p.description
      ? `<div class="prop-card-desc">${escHtml(p.description.substring(0, 120))}${p.description.length > 120 ? '...' : ''}</div>`
      : '';

    // Card layout: image → location → title → price → specs → (desktop: features + desc)
    return `<div class="prop-card" data-title="${safeTitle}" data-id="${propId}" onclick="openPropertyById('${propId}')">
      ${imgSection}
      <div class="prop-body">
        ${locationHtml}
        ${titleHtml}
        ${priceHtml}
        ${specsHtml}
        ${featurePillsHtml}
        ${descPreview}
      </div>
    </div>`;
  }

  // Heart / favorite toggle
  window.toggleHeart = function(btn) {
    btn.classList.toggle('liked');
    btn.classList.remove('pop');
    // Force reflow for re-animation
    void btn.offsetWidth;
    btn.classList.add('pop');
    // Store in memory (no localStorage in this env)
  };

  // Carousel slide function
  window.slideCarousel = function(cardId, dir) {
    const carousel = document.querySelector(`.prop-carousel[data-card-id="${cardId}"]`);
    if (!carousel) return;
    const track = carousel.querySelector('.prop-carousel-track');
    const dots = carousel.querySelectorAll('.prop-carousel-dot');
    const total = dots.length;
    let current = parseInt(carousel.dataset.idx || '0');
    current = (current + dir + total) % total;
    carousel.dataset.idx = current;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  };

  // Touch swipe for carousels
  document.addEventListener('touchstart', function(e) {
    const carousel = e.target.closest('.prop-carousel');
    if (!carousel) return;
    carousel._touchX = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', function(e) {
    const carousel = e.target.closest('.prop-carousel');
    if (!carousel || carousel._touchX === undefined) return;
    const diff = carousel._touchX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      const cardId = carousel.dataset.cardId;
      window.slideCarousel(cardId, diff > 0 ? 1 : -1);
    }
    delete carousel._touchX;
  }, { passive: true });

  // ==========================================
  // PROPERTY LISTING + FILTERS
  // ==========================================
  let allProperties = [];
  let currentFilters = { search: '', priceMin: 0, priceMax: 0, beds: 0, baths: 0, furnishing: 'all', areaMin: 0, areaMax: 0, amenities: [] };

  // ==========================================
  // OFF-PLAN / NEW LAUNCH CAROUSEL CARD
  // ==========================================
  function renderOffPlanCard(p) {
    const propId = escAttr(String(p.id));
    const safeTitle = escAttr(p.title);
    const isLaunch = p.listing_type === 'new_launch';
    const typeLabel = isLaunch ? 'NEW LAUNCH' : 'OFF PLAN';
    const typeClass = isLaunch ? 'offplan-badge-launch' : 'offplan-badge-offplan';

    // Price — "Starting from" pattern like Property Finder
    let priceHtml = '';
    if (p.price) {
      const priceStr = escHtml(p.price);
      priceHtml = `<div class="offplan-price"><span class="offplan-price-label">Starting from</span><span class="offplan-price-value">${priceStr}</span></div>`;
    }

    const imgSrc = p.image_url
      ? `<img class="offplan-img" src="${escAttr(p.image_url)}" alt="${safeTitle}" loading="lazy" onerror="handleImgError(this)">`
      : `<div class="offplan-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`;

    const locationText = p.location ? escHtml(p.location.split(',')[0]) : '';
    const developer = p.developer ? escHtml(p.developer) : '';
    const handover = p.handover_date ? escHtml(p.handover_date) : '';
    const paymentPlan = p.payment_plan ? escHtml(p.payment_plan) : '';

    // Meta pills — payment plan + handover (the two things off-plan buyers care about)
    let metaHtml = '';
    if (paymentPlan || handover) {
      metaHtml = '<div class="offplan-meta">';
      if (paymentPlan) metaHtml += `<span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z"/></svg>${paymentPlan} Plan</span>`;
      if (handover) metaHtml += `<span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>${handover}</span>`;
      metaHtml += '</div>';
    }

    return `<div class="offplan-card" data-id="${propId}" onclick="openPropertyById('${propId}')">
      <div class="offplan-img-wrap">
        ${imgSrc}
        <span class="offplan-badge ${typeClass}">${typeLabel}</span>
      </div>
      <div class="offplan-body">
        ${developer ? `<div class="offplan-developer">${developer}</div>` : ''}
        <div class="offplan-title">${escHtml(p.title)}</div>
        ${locationText ? `<div class="offplan-location"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>${locationText}</div>` : ''}
        ${priceHtml}
        ${metaHtml}
      </div>
    </div>`;
  }

  function renderPropertyList(props) {
    const listEl = document.getElementById('prop-list');
    const countEl = document.getElementById('prop-count');
    if (props.length === 0) {
      const hasFilters = currentFilters.search || currentFilters.priceMin || currentFilters.priceMax || currentFilters.beds || currentFilters.baths || currentFilters.areaMin || currentFilters.areaMax || (currentFilters.amenities && currentFilters.amenities.length);
      const isFilterEmpty = hasFilters && allProperties.length > 0;
      listEl.innerHTML = `<div class="prop-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.12)" style="margin-bottom:16px;"><path d="${isFilterEmpty ? 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' : 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'}"/></svg>
        <p style="color:rgba(255,255,255,0.6);font-size:15px;font-weight:500;">${isFilterEmpty ? 'No properties match your filters' : 'Portfolio coming soon'}</p>
        <p style="color:rgba(255,255,255,0.35);font-size:13px;margin-top:8px;">${isFilterEmpty ? 'Try adjusting your search or clearing filters' : 'New listings are being added — check back shortly'}</p>
        ${isFilterEmpty ? '<button onclick="resetFilters()" style="margin-top:16px;padding:10px 24px;border-radius:100px;background:rgba(77,101,255,0.15);border:1px solid rgba(77,101,255,0.3);color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Clear All Filters</button>' : ''}
      </div>`;
      countEl.textContent = '';
      return;
    }

    // Split: off-plan/new-launch go into carousel, standard go into vertical list
    const offPlanProps = props.filter(p => p.listing_type === 'off_plan' || p.listing_type === 'new_launch');
    const standardProps = props.filter(p => !p.listing_type || p.listing_type === 'standard');

    let html = '';

    // Off-plan carousel (if any)
    if (offPlanProps.length > 0) {
      const carouselCards = offPlanProps.map(p => renderOffPlanCard(p)).join('');
      html += `<div class="offplan-section">
        <div class="offplan-section-header">
          <div class="offplan-section-title">Off Plan & New Launches</div>
          <div class="offplan-section-count">${offPlanProps.length}</div>
        </div>
        <div class="offplan-carousel" id="offplan-carousel">
          <div class="offplan-track">${carouselCards}</div>
        </div>
        <div class="offplan-dots" id="offplan-dots"></div>
      </div>`;
    }

    // Standard property list
    html += standardProps.map((p, i) => renderPropertyCard(p, i)).join('');

    const totalCount = props.length;
    countEl.textContent = `${totalCount} ${totalCount === 1 ? 'property' : 'properties'}`;
    listEl.innerHTML = html;

    // Init carousel swipe if off-plan cards exist
    if (offPlanProps.length > 1) {
      initOffPlanCarousel();
    }
  }

  // ==========================================
  // OFF-PLAN CAROUSEL SWIPE HANDLING
  // ==========================================
  function initOffPlanCarousel() {
    const carousel = document.getElementById('offplan-carousel');
    const track = carousel?.querySelector('.offplan-track');
    const dotsContainer = document.getElementById('offplan-dots');
    if (!carousel || !track) return;
    // Prevent duplicate listeners on re-renders
    if (carousel._carouselInit) return;
    carousel._carouselInit = true;

    const cards = track.querySelectorAll('.offplan-card');
    const total = cards.length;
    if (total <= 1) return;

    let currentIdx = 0;
    let startX = 0;
    let startScrollLeft = 0;
    let isDragging = false;

    // Build dots
    if (dotsContainer) {
      dotsContainer.innerHTML = Array.from({ length: total }, (_, i) =>
        `<div class="offplan-dot${i === 0 ? ' active' : ''}"></div>`
      ).join('');
    }

    function updateDots(idx) {
      if (!dotsContainer) return;
      dotsContainer.querySelectorAll('.offplan-dot').forEach((d, i) => {
        d.classList.toggle('active', i === idx);
      });
    }

    function snapToCard(idx) {
      if (idx < 0) idx = 0;
      if (idx >= total) idx = total - 1;
      currentIdx = idx;
      const card = cards[idx];
      const offset = card.offsetLeft - 20; // match carousel padding
      carousel.scrollTo({ left: offset, behavior: 'smooth' });
      updateDots(idx);
    }

    // Touch events
    carousel.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startScrollLeft = carousel.scrollLeft;
      isDragging = true;
    }, { passive: true });

    carousel.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) {
        snapToCard(dx < 0 ? currentIdx + 1 : currentIdx - 1);
      } else {
        snapToCard(currentIdx);
      }
    }, { passive: true });

    // Scroll-based dot tracking
    let scrollTimer;
    carousel.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const scrollLeft = carousel.scrollLeft;
        let closest = 0;
        let minDist = Infinity;
        cards.forEach((card, i) => {
          const dist = Math.abs(card.offsetLeft - 20 - scrollLeft);
          if (dist < minDist) { minDist = dist; closest = i; }
        });
        currentIdx = closest;
        updateDots(closest);
      }, 80);
    }, { passive: true });
  }

  function applyCurrentFilters() {
    let filtered = [...allProperties];
    const f = currentFilters;
    if (f.search) {
      const q = f.search.toLowerCase();
      filtered = filtered.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.property_type || '').toLowerCase().includes(q)
      );
    }
    if (f.priceMin > 0) filtered = filtered.filter(p => parsePrice(p.price) >= f.priceMin);
    if (f.priceMax > 0) filtered = filtered.filter(p => parsePrice(p.price) <= f.priceMax);
    if (f.beds > 0) filtered = filtered.filter(p => (p.bedrooms || 0) >= f.beds);
    if (f.baths > 0) filtered = filtered.filter(p => (p.bathrooms || 0) >= f.baths);
    if (f.areaMin > 0) filtered = filtered.filter(p => (p.area_sqft || 0) >= f.areaMin);
    if (f.areaMax > 0) filtered = filtered.filter(p => (p.area_sqft || 0) <= f.areaMax);
    if (f.furnishing !== 'all') {
      filtered = filtered.filter(p => {
        const feats = (p.features || []).map(x => x.toLowerCase()).join(' ');
        if (f.furnishing === 'furnished') return feats.includes('furnished') && !feats.includes('unfurnished') && !feats.includes('partly');
        if (f.furnishing === 'unfurnished') return feats.includes('unfurnished');
        if (f.furnishing === 'partly') return feats.includes('partly') || feats.includes('semi');
        return true;
      });
    }
    if (f.amenities.length > 0) {
      filtered = filtered.filter(p => {
        const feats = (p.features || []).map(x => x.toLowerCase()).join(' ');
        return f.amenities.every(a => feats.includes(a));
      });
    }
    return filtered;
  }

  function parsePrice(priceStr) {
    if (!priceStr) return 0;
    return parseInt(String(priceStr).replace(/[^0-9]/g, ''), 10) || 0;
  }

  function renderSkeletonCards(count) {
    return Array.from({ length: count }, () =>
      `<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-body"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>`
    ).join('');
  }

  window.openProps = async function() {
    const overlay = document.getElementById('prop-overlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    logEvent('link_click', { link_type: 'view_listings' });

    // Show skeleton while loading
    const listEl = document.getElementById('prop-list');
    if (!propertiesLoaded) {
      listEl.innerHTML = renderSkeletonCards(3);
    }

    if (!currentAgent) return;
    allProperties = await loadProperties(currentAgent.id);
    const filtered = applyCurrentFilters();
    renderPropertyList(filtered);
  };

  window.closeProps = function() {
    document.getElementById('prop-overlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  // ==========================================
  // FILTERS
  // ==========================================
  window.openFilters = function() {
    document.getElementById('filters-overlay').classList.add('open');
  };
  window.closeFilters = function() {
    document.getElementById('filters-overlay').classList.remove('open');
  };

  // Pill toggle logic
  document.querySelectorAll('.filters-pills').forEach(container => {
    container.addEventListener('click', (e) => {
      const pill = e.target.closest('.filters-pill');
      if (!pill) return;
      const id = container.id;
      if (id === 'filter-furnishing') {
        container.querySelectorAll('.filters-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      } else if (id === 'filter-amenities') {
        pill.classList.toggle('active');
      } else {
        const wasActive = pill.classList.contains('active');
        container.querySelectorAll('.filters-pill').forEach(p => p.classList.remove('active'));
        if (!wasActive) pill.classList.add('active');
      }
    });
  });

  window.clearAllFilters = function() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-price-min').value = '';
    document.getElementById('filter-price-max').value = '';
    document.getElementById('filter-area-min').value = '';
    document.getElementById('filter-area-max').value = '';
    document.querySelectorAll('.filters-pills .filters-pill').forEach(p => p.classList.remove('active'));
    document.querySelector('#filter-furnishing .filters-pill[data-val="all"]').classList.add('active');
    currentFilters = { search: '', priceMin: 0, priceMax: 0, beds: 0, baths: 0, furnishing: 'all', areaMin: 0, areaMax: 0, amenities: [] };
    document.getElementById('filter-toggle-btn').classList.remove('active');
  };

  window.applyFilters = function() {
    currentFilters.search = document.getElementById('filter-search').value.trim();
    currentFilters.priceMin = parseInt(document.getElementById('filter-price-min').value) || 0;
    currentFilters.priceMax = parseInt(document.getElementById('filter-price-max').value) || 0;
    currentFilters.areaMin = parseInt(document.getElementById('filter-area-min').value) || 0;
    currentFilters.areaMax = parseInt(document.getElementById('filter-area-max').value) || 0;
    const activeBed = document.querySelector('#filter-beds .filters-pill.active');
    currentFilters.beds = activeBed ? parseInt(activeBed.dataset.val) : 0;
    const activeBath = document.querySelector('#filter-baths .filters-pill.active');
    currentFilters.baths = activeBath ? parseInt(activeBath.dataset.val) : 0;
    const activeFurn = document.querySelector('#filter-furnishing .filters-pill.active');
    currentFilters.furnishing = activeFurn ? activeFurn.dataset.val : 'all';
    currentFilters.amenities = [...document.querySelectorAll('#filter-amenities .filters-pill.active')].map(p => p.dataset.val);

    const hasActive = currentFilters.search || currentFilters.priceMin || currentFilters.priceMax ||
      currentFilters.beds || currentFilters.baths || currentFilters.areaMin || currentFilters.areaMax ||
      currentFilters.furnishing !== 'all' || currentFilters.amenities.length > 0;
    document.getElementById('filter-toggle-btn').classList.toggle('active', hasActive);

    const filtered = applyCurrentFilters();
    renderPropertyList(filtered);
    closeFilters();
  };

  window.resetFilters = function() {
    currentFilters = { search: '', priceMin: 0, priceMax: 0, beds: 0, baths: 0, furnishing: 'all', areaMin: 0, areaMax: 0, amenities: [] };
    // Clear UI inputs
    const searchEl = document.getElementById('filter-search');
    if (searchEl) searchEl.value = '';
    ['filter-price-min','filter-price-max','filter-area-min','filter-area-max'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.querySelectorAll('.filters-pill.active').forEach(p => p.classList.remove('active'));
    document.getElementById('filter-toggle-btn')?.classList.remove('active');
    renderPropertyList(allProperties);
  };

  // ==========================================
  // SIDEBAR FILTERS (DESKTOP)
  // ==========================================
  window.toggleSidebarPill = function(pill, groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const wasActive = pill.classList.contains('active');
    group.querySelectorAll('.sidebar-pill').forEach(p => p.classList.remove('active'));
    if (!wasActive) pill.classList.add('active');
  };

  let _sidebarDebounce = null;
  window.sidebarFilterChanged = function() {
    clearTimeout(_sidebarDebounce);
    _sidebarDebounce = setTimeout(() => applySidebarFilters(), 350);
  };

  window.applySidebarFilters = function() {
    currentFilters.search = (document.getElementById('sidebar-search')?.value || '').trim();
    currentFilters.priceMin = parseInt(document.getElementById('sidebar-price-min')?.value) || 0;
    currentFilters.priceMax = parseInt(document.getElementById('sidebar-price-max')?.value) || 0;
    currentFilters.areaMin = parseInt(document.getElementById('sidebar-area-min')?.value) || 0;
    currentFilters.areaMax = parseInt(document.getElementById('sidebar-area-max')?.value) || 0;
    const activeBed = document.querySelector('#sidebar-beds .sidebar-pill.active');
    currentFilters.beds = activeBed ? parseInt(activeBed.dataset.val) : 0;
    const activeBath = document.querySelector('#sidebar-baths .sidebar-pill.active');
    currentFilters.baths = activeBath ? parseInt(activeBath.dataset.val) : 0;
    const filtered = applyCurrentFilters();
    renderPropertyList(filtered);
  };

  window.clearSidebarFilters = function() {
    const ids = ['sidebar-search','sidebar-price-min','sidebar-price-max','sidebar-area-min','sidebar-area-max'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.querySelectorAll('.sidebar-pill.active').forEach(p => p.classList.remove('active'));
    currentFilters = { search: '', priceMin: 0, priceMax: 0, beds: 0, baths: 0, furnishing: 'all', areaMin: 0, areaMax: 0, amenities: [] };
    renderPropertyList(allProperties);
  };

  // ==========================================
  // PROPERTY DETAIL VIEW
  // ==========================================
  let currentDetailProp = null;

  // Stable lookup by property ID — immune to filter changes between render and click
  window.openPropertyById = function(propId) {
    const p = allProperties.find(prop => String(prop.id) === String(propId));
    if (!p) return;
    currentDetailProp = p;
    renderDetailView(p);
    document.getElementById('detail-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    logEvent('link_click', { link_type: 'property_detail', property: p.title });
  };

  window.openPropertyDetail = function(propIndex) {
    const props = applyCurrentFilters();
    const p = props[propIndex];
    if (!p) return;
    currentDetailProp = p;
    renderDetailView(p);
    document.getElementById('detail-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    logEvent('link_click', { link_type: 'property_detail', property: p.title });
  };

  window.closeDetail = function() {
    document.getElementById('detail-overlay').classList.remove('open');
    document.body.style.overflow = 'hidden'; // prop overlay is still open
    currentDetailProp = null;
  };

  // ==========================================
  // PHOTO GALLERY + VIEWER
  // ==========================================
  let _photoViewerIdx = 0;

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
    updatePhotoViewer();
    document.getElementById('photo-viewer').classList.add('open');
  };
  window.closePhotoViewer = function() {
    document.getElementById('photo-viewer').classList.remove('open');
  };
  window.navPhoto = function(dir) {
    const images = window._currentDetailImages || [];
    _photoViewerIdx = (_photoViewerIdx + dir + images.length) % images.length;
    updatePhotoViewer();
  };
  function updatePhotoViewer() {
    const images = window._currentDetailImages || [];
    const img = document.getElementById('photo-viewer-img');
    img.src = images[_photoViewerIdx];
    document.getElementById('photo-viewer-counter').textContent = `${_photoViewerIdx + 1} / ${images.length}`;
  }

  // Swipe support for photo viewer
  (function() {
    const el = document.getElementById('photo-viewer');
    let startX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) navPhoto(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  // Open lead modal pre-filled with property name
  window.openLeadForProperty = function(propertyTitle) {
    document.getElementById('detail-overlay').classList.remove('open');
    closeProps();
    setTimeout(() => {
      openLead();
      const msgEl = document.getElementById('lead-message');
      msgEl.value = `I'm interested in: ${propertyTitle}`;
      const extra = document.getElementById('lead-extra');
      const btn = document.getElementById('lead-expander');
      if (!extra.classList.contains('open')) {
        extra.classList.add('open');
        btn.classList.add('open');
      }
    }, 200);
  };

  function renderDetailView(p) {
    window._currentProperty = p;
    const sheet = document.getElementById('detail-sheet');

    const extras = p.additional_photos || [];
    const allImages = [p.image_url, ...extras].filter(Boolean);

    // Gallery
    let galleryHtml = '';
    if (allImages.length > 0) {
      const heroImg = `<img class="detail-hero" src="${escAttr(allImages[0])}" alt="${escAttr(p.title)}" loading="lazy" onclick="openPhotoViewer(0)" style="cursor:pointer" onerror="handleImgError(this)">`;
      if (allImages.length > 1) {
        const gridImgs = allImages.slice(1, 5).map((url, i) =>
          `<img src="${escAttr(url)}" alt="" loading="lazy" onclick="openPhotoViewer(${i + 1})" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;cursor:pointer" onerror="handleImgError(this)">`
        ).join('');
        const showAllBtn = `<button class="detail-show-all" onclick="openFullGallery()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>SHOW ALL PHOTOS</button>`;
        galleryHtml = `<div class="detail-gallery-wrap">${heroImg}<div class="detail-gallery">${gridImgs}</div>${showAllBtn}</div>`;
      } else {
        galleryHtml = heroImg;
      }
    }

    window._currentDetailImages = allImages;

    const breadcrumbHtml = p.title ? `<div class="detail-breadcrumb">${escHtml(p.title)}</div>` : '';
    const titleAboveHtml = p.title ? `<div class="detail-title-above">${escHtml(p.title)}</div>` : '';

    let priceText = '';
    if (p.price) {
      const ps = escHtml(p.price);
      priceText = /AED/i.test(ps) ? ps : `AED ${ps}`;
    }

    const specItems = [];
    if (p.bedrooms) specItems.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7v11a1 1 0 001 1h16a1 1 0 001-1V7"/><path d="M21 11H3V9a2 2 0 012-2h14a2 2 0 012 2v2z"/></svg>${p.bedrooms} Bed${p.bedrooms > 1 ? 's' : ''}</div>`);
    if (p.bathrooms) specItems.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"/><path d="M6 12V5a2 2 0 012-2h1a2 2 0 012 2v1"/></svg>${p.bathrooms} Bath${p.bathrooms > 1 ? 's' : ''}</div>`);
    if (p.area_sqft) specItems.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>${p.area_sqft.toLocaleString()} sqft</div>`);
    const specsRowHtml = specItems.length > 0 ? `<div class="detail-specs-row">${specItems.join('<div class="detail-spec-divider"></div>')}</div>` : '';

    // Property details + amenities card
    let infoCardHtml = '';
    const detailItems = [];
    if (p.property_type) detailItems.push(`<div class="detail-info-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h1m-1 4h1m-1 4h1"/></svg>${escHtml(p.property_type)}</div>`);
    if (p.land_area) detailItems.push(`<div class="detail-info-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="0" stroke-dasharray="4 2"/></svg>${p.land_area} m² Land</div>`);

    const amenityItems = (p.features || []).map(f => {
      const fl = f.toLowerCase();
      let icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
      if (fl.includes('view') || fl.includes('landmark') || fl.includes('panoram')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><circle cx="12" cy="14" r="3"/></svg>';
      else if (fl.includes('pool')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M2 19c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><circle cx="8" cy="8" r="2"/><path d="M16 8h-4l-2 3"/></svg>';
      else if (fl.includes('gym') || fl.includes('fitness')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 6.5h11M6.5 17.5h11"/><rect x="2" y="8" width="4" height="8" rx="1"/><rect x="18" y="8" width="4" height="8" rx="1"/><path d="M6.5 12h11"/></svg>';
      else if (fl.includes('garden')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V12"/><path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5"/><path d="M4 15c0-3.31 3.58-6 8-6s8 2.69 8 6"/></svg>';
      else if (fl.includes('jacuzzi') || fl.includes('spa')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"/><path d="M8 7c0-1 .5-2 2-2s2 1 2 0 .5-2 2-2 2 1 2 2"/></svg>';
      else if (fl.includes('bbq') || fl.includes('barbecue')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="10" r="6"/><path d="M12 16v4"/><path d="M8 20h8"/><path d="M9 7c1 1 2 1 3 0s2-1 3 0"/></svg>';
      else if (fl.includes('parking') || fl.includes('garage')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 010 6H9"/></svg>';
      else if (fl.includes('balcony')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 15h18"/><path d="M3 15v5h18v-5"/><path d="M9 15V5h6v10"/></svg>';
      return `<div class="detail-info-item">${icon}${escHtml(f)}</div>`;
    });

    if (detailItems.length > 0 || amenityItems.length > 0) {
      infoCardHtml = `<div class="detail-info-card">`;
      if (detailItems.length > 0) {
        infoCardHtml += `<div class="detail-info-title">Property Details</div><div class="detail-info-row">${detailItems.join('')}</div>`;
      }
      if (detailItems.length > 0 && amenityItems.length > 0) {
        infoCardHtml += `<div class="detail-info-divider"></div>`;
      }
      if (amenityItems.length > 0) {
        infoCardHtml += `<div class="detail-info-title">Amenities</div><div class="detail-info-row">${amenityItems.join('')}</div>`;
      }
      infoCardHtml += `</div>`;
    }

    const descHtml = p.description
      ? `<div class="detail-description-card"><div class="detail-section-title">Description</div><div class="detail-description">${escHtml(p.description)}</div></div>`
      : '';

    let locationHtml = '';
    if (p.location) {
      const mapQ = encodeURIComponent(p.location + ', Dubai, UAE');
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQ}`;
      locationHtml = `<div class="detail-location-card"><div class="detail-section-title">Location</div>
        <div class="detail-location-text"><svg width="14" height="14" viewBox="0 0 24 24" fill="#c9a96e" style="vertical-align:-2px;margin-right:6px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>${escHtml(p.location)}, Dubai, UAE</div>
        <div class="detail-map detail-map-clickable" onclick="window.open('${mapsUrl}','_blank')">
          <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d14000!2d55.27!3d25.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z${mapQ}!5e0!3m2!1sen!2sae!4v1" class="detail-map-iframe" allowfullscreen loading="lazy"></iframe>
          <div class="detail-map-overlay">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span class="detail-map-label">Open in Maps</span>
          </div>
        </div></div>`;
    }

    let regHtml = '';
    if (p.dld_permit || p.reference_number) {
      regHtml = `<div class="detail-reg-card">
        <div class="detail-info-title">Regulatory Information</div>
        <div class="detail-reg-grid">
          ${p.dld_permit ? `<div><div class="detail-reg-label">Trakheesi Permit</div><div class="detail-reg-value">${escHtml(p.dld_permit)}</div></div>` : ''}
          ${p.reference_number ? `<div><div class="detail-reg-label">Reference</div><div class="detail-reg-value">${escHtml(p.reference_number)}</div></div>` : ''}
          <div><div class="detail-reg-label">Listed</div><div class="detail-reg-value">${new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
        </div>
      </div>`;
    }

    // Cost to Own Calculator
    let costToOwnHtml = '';
    if (p.price) {
      const rawPrice = parseFloat(String(p.price).replace(/[^0-9.]/g, ''));
      if (rawPrice > 0) {
        const dldFee = rawPrice * 0.04;
        const adminFee = rawPrice >= 500000 ? 4200 : 2100;
        const titleDeed = 580;
        const agentComm = rawPrice * 0.021; // 2% + 5% VAT
        const nocFee = 2500; // avg
        const cashTotal = dldFee + adminFee + titleDeed + agentComm + nocFee;

        // Mortgage scenario (80% LTV)
        const loanAmt = rawPrice * 0.8;
        const mortgageReg = loanAmt * 0.0025 + 290;
        const bankFee = loanAmt * 0.01; // ~1% processing fee
        const mortgageTotal = cashTotal + mortgageReg + bankFee;

        const fmtAED = (n) => 'AED ' + Math.round(n).toLocaleString();
        const fmtPct = (n) => (n * 100).toFixed(1) + '%';

        costToOwnHtml = `
        <div class="cost-to-own-card">
          <div class="cost-to-own-title">Cost to Own</div>
          <div class="cost-to-own-subtitle">Estimated transaction costs for this property</div>
          <div class="cost-toggle-row">
            <button class="cost-toggle-btn active" onclick="toggleCostMode(this,'cash')">Cash Purchase</button>
            <button class="cost-toggle-btn" onclick="toggleCostMode(this,'mortgage')">With Mortgage</button>
          </div>
          <div class="cost-row">
            <span class="cost-row-label">DLD Transfer Fee <span class="cost-pct">4%</span></span>
            <span class="cost-row-value">${fmtAED(dldFee)}</span>
          </div>
          <div class="cost-row">
            <span class="cost-row-label">DLD Admin Fee</span>
            <span class="cost-row-value">${fmtAED(adminFee)}</span>
          </div>
          <div class="cost-row">
            <span class="cost-row-label">Title Deed Issuance</span>
            <span class="cost-row-value">${fmtAED(titleDeed)}</span>
          </div>
          <div class="cost-row">
            <span class="cost-row-label">Agent Commission <span class="cost-pct">2% + VAT</span></span>
            <span class="cost-row-value">${fmtAED(agentComm)}</span>
          </div>
          <div class="cost-row">
            <span class="cost-row-label">Developer NOC</span>
            <span class="cost-row-value">~${fmtAED(nocFee)}</span>
          </div>
          <div class="cost-mortgage-section hidden" id="cost-mortgage-rows">
            <div class="cost-row">
              <span class="cost-row-label">Mortgage Registration <span class="cost-pct">0.25%</span></span>
              <span class="cost-row-value">${fmtAED(mortgageReg)}</span>
            </div>
            <div class="cost-row">
              <span class="cost-row-label">Bank Processing <span class="cost-pct">~1%</span></span>
              <span class="cost-row-value">${fmtAED(bankFee)}</span>
            </div>
          </div>
          <div class="cost-divider"></div>
          <div class="cost-row-total">
            <span class="cost-row-label">Total Estimated Cost</span>
            <span class="cost-row-value" id="cost-total-value">${fmtAED(cashTotal)}</span>
          </div>
          <div class="cost-row-total" style="padding-top:4px;">
            <span class="cost-row-label" style="font-weight:300;font-size:11px;color:rgba(255,255,255,0.3);">% of purchase price</span>
            <span class="cost-row-value" style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.4);" id="cost-total-pct">${fmtPct(cashTotal / rawPrice)}</span>
          </div>
        </div>`;

        // Store for toggle
        window._costData = { cashTotal, mortgageTotal, rawPrice, fmtAED, fmtPct };
      }
    }

    // Agent mini-card (PropertyFinder pattern — agent info inside listing)
    // Share button
    const shareHtml = `<button class="detail-share-btn" onclick="if(navigator.share)navigator.share({title:'${escAttr(p.title||'')}',url:window.location.href});else if(navigator.clipboard)navigator.clipboard.writeText(window.location.href).then(()=>this.textContent='Link Copied!')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share
    </button>`;

    sheet.innerHTML = `
      <div class="detail-title-bar">${breadcrumbHtml}${titleAboveHtml}</div>
      ${galleryHtml}
      <div class="detail-body">
        <div class="detail-price-row">
          <div>
            <div class="detail-price">${priceText}</div>
            <span class="detail-price-label">${p.listing_type === 'rent' ? 'Per Year' : 'Asking Price'}</span>
          </div>
          ${shareHtml}
        </div>
        ${specsRowHtml}
        ${infoCardHtml}
        ${descHtml}
        ${locationHtml}
        ${regHtml}
        ${costToOwnHtml}
      </div>
    `;
    sheet.scrollTop = 0;

    // Wire bottom CTA buttons
    const waBtn = document.getElementById('detail-wa-btn');
    const inquireBtn = document.getElementById('detail-inquire-btn');
    if (currentAgent && currentAgent.whatsapp) {
      waBtn.style.display = 'flex';
      waBtn.onclick = () => {
        window.open(`https://wa.me/${currentAgent.whatsapp.replace(/[^0-9]/g,'')}?text=${encodeURIComponent('Hi, I\'m interested in: ' + (p.title || 'your property'))}`, '_blank');
        logEvent('whatsapp_tap', { source: 'property_detail', property: p.title });
      };
    } else {
      waBtn.style.display = 'none';
    }
    inquireBtn.onclick = () => openLeadForProperty(p.title);
  }

  // Cost to Own toggle
  window.toggleCostMode = function(btn, mode) {
    // Toggle active state on buttons
    btn.parentElement.querySelectorAll('.cost-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Show/hide mortgage rows
    const mortRows = document.getElementById('cost-mortgage-rows');
    const totalEl = document.getElementById('cost-total-value');
    const pctEl = document.getElementById('cost-total-pct');
    if (!mortRows || !window._costData) return;
    const d = window._costData;
    if (mode === 'mortgage') {
      mortRows.classList.remove('hidden');
      totalEl.textContent = d.fmtAED(d.mortgageTotal);
      pctEl.textContent = d.fmtPct(d.mortgageTotal / d.rawPrice);
    } else {
      mortRows.classList.add('hidden');
      totalEl.textContent = d.fmtAED(d.cashTotal);
      pctEl.textContent = d.fmtPct(d.cashTotal / d.rawPrice);
    }
  };

  // ==========================================
  // MORTGAGE FLOW (Multi-step)
  // ==========================================
  window._mortTerm = 25;
  window._mortRate = 3.99;
  window._mortStep = 1;
  window._mortData = { employment: 'salaried', residency: 'uae_resident' };
  window._mortRates = [];
  window._mortAppId = null;

  const fmtAEDMort = (n) => 'AED ' + Math.round(n).toLocaleString();

  window.openMortgage = function() {
    const modal = document.getElementById('mortgage-modal');
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    mortGoStep(1);
    loadMortgageRates();
    // Reset lead capture and check button state
    const leadCapture = document.getElementById('mort-lead-capture');
    if (leadCapture) leadCapture.style.display = 'none';
    const checkBtn = document.getElementById('mort-check-btn');
    if (checkBtn) checkBtn.style.display = '';
    const eligResult = document.getElementById('mort-elig-result');
    if (eligResult) eligResult.style.display = 'none';
    // Auto-fill property value if we have a current property
    if (window._currentProperty) {
      const p = window._currentProperty;
      const priceNum = parseFloat(String(p.price || '').replace(/[^0-9.]/g, ''));
      if (priceNum > 0) {
        const valInput = document.getElementById('mort-value');
        if (valInput) valInput.value = Math.round(priceNum).toLocaleString('en-US');
        // Also set the down payment slider based on residency
        const dpSlider = document.getElementById('mort-dp-slider');
        if (dpSlider) {
          const minDp = window._mortData.residency === 'uae_national' ? 15 : (window._mortData.residency === 'non_resident' ? 50 : 20);
          dpSlider.min = minDp;
          dpSlider.value = minDp;
          const dpPctEl = document.getElementById('mort-dp-pct');
          if (dpPctEl) dpPctEl.textContent = minDp + '%';
          // Update the min label
          const minLabel = dpSlider.parentElement?.querySelector('span');
          if (minLabel) minLabel.textContent = minDp + '%';
        }
      }
    }
    logEvent('mortgage_calc_open', { property: window._currentProperty?.title || null });
  };

  window.closeMortgage = function() {
    const modal = document.getElementById('mortgage-modal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };

  window.mortGoStep = function(step) {
    window._mortStep = step;
    document.querySelectorAll('.mort-step').forEach(s => s.style.display = 'none');
    const el = document.getElementById('mort-step-' + step);
    if (el) el.style.display = 'block';
    // Scroll modal back to top on every step change
    const modal = document.querySelector('#mortgage-modal .modal');
    if (modal) modal.scrollTop = 0;
    const dots = document.querySelectorAll('.mort-step-dot');
    dots.forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (i < step - 1) d.classList.add('done');
      if (i === step - 1) d.classList.add('active');
    });
    const titles = ['Check Your Eligibility', 'Compare Rates', 'Your Details', 'You\'re Pre-Qualified'];
    const titleEl = document.getElementById('mort-step-title');
    if (titleEl) titleEl.textContent = titles[step - 1] || '';
    if (step === 2) {
      // Sync down payment slider to residency LTV rules
      const dpSlider = document.getElementById('mort-dp-slider');
      if (dpSlider) {
        const minDp = window._mortData.residency === 'uae_national' ? 15 : (window._mortData.residency === 'non_resident' ? 50 : 20);
        dpSlider.min = minDp;
        if (parseInt(dpSlider.value) < minDp) dpSlider.value = minDp;
        const dpPctEl = document.getElementById('mort-dp-pct');
        if (dpPctEl) dpPctEl.textContent = dpSlider.value + '%';
      }
      renderBankCards();
      // Auto-calculate if property value is pre-filled
      const valInput = document.getElementById('mort-value');
      if (valInput && valInput.value) calcMortgage();
    }
  };

  window.setMortField = function(btn, field, value) {
    window._mortData[field] = value;
    btn.parentElement.querySelectorAll('.cost-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };

  window.setMortTerm = function(btn, years) {
    window._mortTerm = years;
    btn.parentElement.querySelectorAll('.cost-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderBankCards();
    calcMortgage();
  };

  async function loadMortgageRates() {
    if (window._mortRates.length > 0) return;
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/mortgage_rates?is_active=eq.true&order=rate_pct.asc', {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
      });
      if (res.ok) window._mortRates = await res.json();
    } catch (e) { console.error('Failed to load mortgage rates:', e); }
  }

  function filterRatesForProfile(rates) {
    const income = window._mortData.income || 0;
    const residency = window._mortData.residency || 'uae_resident';
    const employment = window._mortData.employment || 'salaried';
    const maxLtv = residency === 'uae_national' ? 85 : (residency === 'non_resident' ? 50 : 80);

    return rates.filter(r => {
      // Filter by minimum income requirement
      if (r.min_income_aed && income > 0 && income < r.min_income_aed) return false;
      // Filter by LTV compatibility
      if (r.max_ltv_pct && r.max_ltv_pct < maxLtv) return false;
      // Filter by term range
      if (r.min_term_years && window._mortTerm < r.min_term_years) return false;
      if (r.max_term_years && window._mortTerm > r.max_term_years) return false;
      // Self-employed/business owners: skip banks with very low income thresholds (likely salaried-only)
      // Islamic products shown to everyone, conventional hidden if profile suggests Islamic preference
      return true;
    });
  }

  function renderBankCards() {
    const container = document.getElementById('mort-bank-cards');
    if (!container) return;
    const allRates = window._mortRates;
    if (!allRates.length) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:12px;">Loading rates...</div>';
      return;
    }
    // Apply smart filtering based on buyer profile
    const rates = filterRatesForProfile(allRates);

    const types = ['fixed_1yr', 'fixed_3yr', 'fixed_5yr', 'variable', 'islamic_fixed', 'islamic_variable'];
    const typeLabels = { fixed_1yr: '1yr Fixed', fixed_3yr: '3yr Fixed', fixed_5yr: '5yr Fixed', variable: 'Variable', islamic_fixed: 'Islamic Fixed', islamic_variable: 'Islamic Variable' };
    const best = [];
    types.forEach(t => {
      const match = rates.filter(r => r.product_type === t).sort((a, b) => a.rate_pct - b.rate_pct)[0];
      if (match) best.push(match);
    });

    // Fallback: if filtering killed everything, show all rates unfiltered
    if (best.length === 0) {
      types.forEach(t => {
        const match = allRates.filter(r => r.product_type === t).sort((a, b) => a.rate_pct - b.rate_pct)[0];
        if (match) best.push(match);
      });
    }

    const valInput = document.getElementById('mort-value');
    const dpSlider = document.getElementById('mort-dp-slider');
    const propVal = valInput ? parseFloat(valInput.value.replace(/[^0-9.]/g, '')) || 0 : 0;
    const dpPct = dpSlider ? parseInt(dpSlider.value) / 100 : 0.2;
    const loanAmt = propVal * (1 - dpPct);

    // Rate freshness indicator
    const latestUpdate = allRates.reduce((latest, r) => {
      const d = r.last_updated || r.created_at;
      return d > latest ? d : latest;
    }, '');
    const freshLabel = latestUpdate ? new Date(latestUpdate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';

    let html = '';

    // "Matched to you" badge if we have profile data
    if (window._mortData.income > 0) {
      const residencyLabel = { uae_national: 'UAE National', uae_resident: 'Resident', non_resident: 'Non-Resident' };
      html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:10px;color:rgba(77,101,255,0.8);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Matched to your profile</span>
        <span style="font-size:9px;color:rgba(255,255,255,0.2);font-weight:300;">${residencyLabel[window._mortData.residency] || ''} · ${window._mortData.employment === 'salaried' ? 'Salaried' : window._mortData.employment === 'self_employed' ? 'Self-Employed' : 'Business Owner'}</span>
      </div>`;
    }

    // Bank brand colors for logo badges
    const bankColors = {
      'Standard Chartered': '#0072AA', 'HSBC': '#DB0011', 'Emirates NBD': '#F26522',
      'Emirates Islamic': '#00843D', 'Dubai Islamic Bank': '#00543C', 'ADCB': '#B8860B',
      'ADIB': '#6B2D73', 'FAB': '#004B87', 'Mashreq': '#E31937', 'RAK Bank': '#C8102E'
    };
    const bankAbbrev = {
      'Standard Chartered': 'SC', 'HSBC': 'HS', 'Emirates NBD': 'EN',
      'Emirates Islamic': 'EI', 'Dubai Islamic Bank': 'DIB', 'ADCB': 'AD',
      'ADIB': 'AB', 'FAB': 'FA', 'Mashreq': 'MQ', 'RAK Bank': 'RK'
    };

    html += best.map((r, i) => {
      let monthlyStr = '';
      if (loanAmt > 0) {
        const mr = (r.rate_pct / 100) / 12;
        const np = window._mortTerm * 12;
        const mp = loanAmt * (mr * Math.pow(1 + mr, np)) / (Math.pow(1 + mr, np) - 1);
        monthlyStr = fmtAEDMort(mp) + '/mo';
      }
      const bestTag = i === 0 ? '<span style="font-size:8px;background:rgba(37,211,102,0.15);color:#25d366;padding:2px 6px;border-radius:4px;font-weight:700;margin-left:6px;">BEST RATE</span>' : '';
      const bgColor = bankColors[r.bank_name] || '#4d65ff';
      const abbrev = bankAbbrev[r.bank_name] || r.bank_name.slice(0, 2).toUpperCase();
      const logoBadge = `<div style="width:28px;height:28px;border-radius:6px;background:${bgColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:10px;"><span style="font-size:9px;font-weight:800;color:#fff;letter-spacing:-0.3px;">${abbrev}</span></div>`;
      return `<div class="mort-bank-card${i === 0 ? ' active' : ''}" onclick="selectBankRate(this,${r.rate_pct},'${escAttr(r.bank_name)}')" style="display:flex;align-items:center;">
        ${logoBadge}
        <div style="flex:1;min-width:0;"><div class="mort-bank-name">${escHtml(r.bank_name)}${bestTag}</div><div class="mort-bank-product">${typeLabels[r.product_type] || r.product_type}${r.is_islamic ? ' · Sharia' : ''}</div></div>
        <div style="text-align:right;"><div class="mort-bank-rate">${r.rate_pct}%</div>${monthlyStr ? `<div class="mort-bank-monthly">${monthlyStr}</div>` : ''}</div>
      </div>`;
    }).join('');

    // Rate freshness footer
    if (freshLabel) {
      html += `<div style="text-align:center;padding:6px 0 0;"><span style="font-size:9px;color:rgba(255,255,255,0.15);font-weight:300;">Rates as of ${freshLabel} · ${best.length} banks matched</span></div>`;
    }

    container.innerHTML = html;
    if (best.length > 0) window._mortRate = best[0].rate_pct;
  }

  window.selectBankRate = function(card, rate, bankName) {
    window._mortRate = rate;
    window._mortData.selectedBank = bankName;
    card.parentElement.querySelectorAll('.mort-bank-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    calcMortgage();
  };

  window.calcMortgage = function() {
    const valInput = document.getElementById('mort-value');
    const dpSlider = document.getElementById('mort-dp-slider');
    const dpPctEl = document.getElementById('mort-dp-pct');
    const resultsEl = document.getElementById('mort-results');
    if (!valInput || !dpSlider) return;
    const rawVal = parseFloat(valInput.value.replace(/[^0-9.]/g, ''));
    const dpPct = parseInt(dpSlider.value) / 100;
    if (dpPctEl) dpPctEl.textContent = dpSlider.value + '%';
    if (!rawVal || rawVal <= 0) { if (resultsEl) resultsEl.style.display = 'none'; renderBankCards(); return; }
    const loanAmt = rawVal * (1 - dpPct);
    const monthlyRate = (window._mortRate / 100) / 12;
    const numPayments = window._mortTerm * 12;
    const monthlyPayment = loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    const totalInterest = (monthlyPayment * numPayments) - loanAmt;
    const me = document.getElementById('mort-monthly');
    const le = document.getElementById('mort-loan');
    const ie = document.getElementById('mort-interest');
    if (me) me.textContent = fmtAEDMort(monthlyPayment);
    if (le) le.textContent = fmtAEDMort(loanAmt);
    if (ie) ie.textContent = fmtAEDMort(totalInterest);
    if (resultsEl) resultsEl.style.display = 'block';
    renderBankCards();
  };

  window.mortCheckEligibility = function() {
    const incomeInput = document.getElementById('mort-income');
    const debtInput = document.getElementById('mort-debt');
    if (!incomeInput) return;
    const income = parseFloat(incomeInput.value.replace(/[^0-9.]/g, ''));
    // Clear any previous error
    const prevErr = incomeInput.parentElement.querySelector('.field-error');
    if (prevErr) prevErr.remove();
    if (!income || income <= 0) {
      incomeInput.style.borderColor = 'rgba(255,80,80,0.6)';
      const errSpan = document.createElement('span');
      errSpan.className = 'field-error';
      errSpan.style.cssText = 'display:block;font-size:11px;color:rgba(255,80,80,0.8);margin-top:4px;font-weight:500;';
      errSpan.textContent = 'Enter your monthly income to check eligibility';
      incomeInput.parentElement.appendChild(errSpan);
      incomeInput.focus();
      // Shake animation
      incomeInput.style.animation = 'none';
      incomeInput.offsetHeight; // trigger reflow
      incomeInput.style.animation = 'shake 0.4s ease';
      return;
    }
    incomeInput.style.borderColor = '';
    const debt = parseFloat((debtInput?.value || '0').replace(/[^0-9.]/g, '')) || 0;
    const isNational = window._mortData.residency === 'uae_national';
    const maxMonthly = (income * 0.50) - debt;
    if (maxMonthly <= 0) {
      document.getElementById('mort-max-loan').textContent = 'AED 0';
      document.getElementById('mort-max-monthly').textContent = 'Your existing debt exceeds the 50% debt burden limit.';
      document.getElementById('mort-elig-result').style.display = 'block';
      return;
    }
    // Stress rate: 3-month EIBOR (~3.68% Mar 2026) + typical bank margin ~0.5%
    const mr = 0.0418 / 12;
    const np = 25 * 12;
    const maxLoan = maxMonthly * (Math.pow(1 + mr, np) - 1) / (mr * Math.pow(1 + mr, np));
    window._mortData.maxLoan = maxLoan;
    window._mortData.maxMonthly = maxMonthly;
    window._mortData.income = income;
    window._mortData.debt = debt;
    document.getElementById('mort-max-loan').textContent = fmtAEDMort(maxLoan);
    document.getElementById('mort-max-monthly').textContent = `Max monthly payment: ${fmtAEDMort(maxMonthly)} · Based on ${isNational ? '85%' : '80%'} LTV`;
    document.getElementById('mort-elig-result').style.display = 'block';
    // Hide the check button, show lead capture
    const checkBtn = document.getElementById('mort-check-btn');
    if (checkBtn) checkBtn.style.display = 'none';
    document.getElementById('mort-lead-capture').style.display = 'block';
    // Focus name field after short delay for smooth UX
    setTimeout(() => { const n = document.getElementById('mort-lead-name'); if (n) n.focus(); }, 300);
    logEvent('mortgage_eligibility_check', { max_loan: Math.round(maxLoan), income: Math.round(income) });
  };

  // Lead capture after eligibility — captures name + phone before showing rates
  window.mortCaptureAndProceed = async function() {
    const nameInput = document.getElementById('mort-lead-name');
    const phoneInput = document.getElementById('mort-lead-phone');
    const errEl = document.getElementById('mort-lead-error');
    const name = (nameInput?.value || '').trim();
    const rawPhone = (phoneInput?.value || '').trim().replace(/[^0-9]/g, '');
    if (!name) {
      if (errEl) { errEl.textContent = 'Enter your name'; errEl.style.display = 'block'; }
      if (nameInput) { nameInput.focus(); nameInput.style.animation = 'none'; nameInput.offsetHeight; nameInput.style.animation = 'shake 0.4s ease'; }
      return;
    }
    if (!rawPhone || rawPhone.length < 7) {
      if (errEl) { errEl.textContent = 'Enter a valid phone number'; errEl.style.display = 'block'; }
      if (phoneInput) { phoneInput.focus(); phoneInput.style.animation = 'none'; phoneInput.offsetHeight; phoneInput.style.animation = 'shake 0.4s ease'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    // Format phone with +971
    const phone = '+971' + rawPhone;
    window._mortData.leadName = name;
    window._mortData.leadPhone = phone;
    // Pre-fill Step 3 fields
    const step3Name = document.getElementById('mort-name');
    const step3Phone = document.getElementById('mort-phone');
    if (step3Name && !step3Name.value) step3Name.value = name;
    if (step3Phone && !step3Phone.value) step3Phone.value = rawPhone;
    // Fire-and-forget: capture as a lead for the agent immediately
    try {
      const agentId = currentAgent?.id;
      const propTitle = window._currentProperty?.title || null;
      fetch(SUPABASE_URL + '/functions/v1/capture-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId, name: name, phone: phone,
          source: 'mortgage_calculator', message: 'Mortgage pre-qualification — Max loan: ' + fmtAEDMort(window._mortData.maxLoan || 0) + (propTitle ? ' — Property: ' + propTitle : ''),
          property_title: propTitle
        })
      }).catch(() => {});
    } catch (e) {}
    logEvent('mortgage_lead_captured', { agent: currentAgent?.slug, name: name });
    mortGoStep(2);
  };

  window.mortSubmitApplication = async function() {
    const name = document.getElementById('mort-name')?.value?.trim();
    const rawPhone = document.getElementById('mort-phone')?.value?.trim().replace(/[^0-9]/g, '') || '';
    const phone = rawPhone ? '+971' + rawPhone : (window._mortData.leadPhone || null);
    const email = document.getElementById('mort-email')?.value?.trim();
    const errEl = document.getElementById('mort-submit-error');
    const btn = document.getElementById('mort-submit-btn');
    if (!name || (!phone && !email)) {
      if (errEl) { errEl.textContent = 'Name and at least phone or email required.'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
    const propVal = parseFloat((document.getElementById('mort-value')?.value || '0').replace(/[^0-9.]/g, '')) || null;
    const dpPct = document.getElementById('mort-dp-slider') ? parseInt(document.getElementById('mort-dp-slider').value) : 20;
    const payload = {
      buyer_name: name, buyer_phone: phone || null, buyer_email: email || null,
      monthly_income: window._mortData.income || null, employment_type: window._mortData.employment || null,
      residency_status: window._mortData.residency || null, existing_debt_monthly: window._mortData.debt || 0,
      property_value: propVal, down_payment_pct: dpPct, preferred_term_years: window._mortTerm,
      preferred_rate_type: window._mortRate + '%', max_loan_amount: window._mortData.maxLoan || null,
      estimated_monthly: window._mortData.maxMonthly || null,
      agent_id: currentAgent?.id || null, agent_slug: currentAgent?.slug || null,
      property_id: window._currentProperty?.id || null, property_title: window._currentProperty?.title || null,
      assigned_bank: window._mortData.selectedBank || null, source: 'profile_page', status: 'new'
    };
    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/submit-mortgage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        window._mortAppId = data?.id || null;
        mortGoStep(4);
        injectMortgageSuccessCta(payload);
        logEvent('mortgage_application_submitted', { agent: currentAgent?.slug, bank: payload.assigned_bank });
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed');
      }
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Something went wrong. Please try again.'; errEl.style.display = 'block'; }
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Get My Pre-Approval'; }
  };

  function injectMortgageSuccessCta(payload) {
    const step4 = document.getElementById('mort-step-4');
    if (!step4) return;
    // Remove previous injection if exists
    const prev = document.getElementById('mort-success-inject');
    if (prev) prev.remove();
    // Build a pre-qualification summary card
    const summaryParts = [];
    if (payload.property_value) summaryParts.push('Property: ' + fmtAEDMort(payload.property_value));
    if (payload.max_loan_amount) summaryParts.push('Max loan: ' + fmtAEDMort(payload.max_loan_amount));
    if (payload.estimated_monthly) summaryParts.push('Max monthly: ' + fmtAEDMort(payload.estimated_monthly));
    if (payload.preferred_rate_type) summaryParts.push('Rate: ' + payload.preferred_rate_type);
    if (payload.assigned_bank) summaryParts.push('Bank: ' + payload.assigned_bank);

    // No WhatsApp CTA — platform assigns a broker internally

    // Inject summary + broker reassurance before the Done button
    const doneBtn = step4.querySelector('.modal-btn:last-child');
    const injectEl = document.createElement('div');
    injectEl.id = 'mort-success-inject';

    let html = '';
    // Pre-qualification summary
    if (summaryParts.length > 0) {
      html += `<div style="background:rgba(77,101,255,0.06);border:1px solid rgba(77,101,255,0.12);border-radius:10px;padding:16px;margin-bottom:16px;">
        <div style="font-size:10px;color:rgba(77,101,255,0.7);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">Your Pre-Qualification Summary</div>
        ${summaryParts.map(s => `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="font-size:12px;color:rgba(255,255,255,0.4);font-weight:300;">${escHtml(s.split(': ')[0])}</span><span style="font-size:12px;color:#fff;font-weight:600;">${escHtml(s.split(': ')[1] || '')}</span></div>`).join('')}
      </div>`;
    }

    // Broker reassurance — no WhatsApp CTA, platform assigns broker internally
    html += `<div style="display:flex;align-items:center;gap:10px;background:rgba(37,211,102,0.06);border:1px solid rgba(37,211,102,0.12);border-radius:10px;padding:14px 16px;margin-bottom:12px;">
      <div style="width:32px;height:32px;border-radius:50%;background:rgba(37,211,102,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      </div>
      <div>
        <span style="font-size:12px;color:#fff;font-weight:600;display:block;margin-bottom:2px;">A licensed broker will WhatsApp you</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.35);font-weight:300;">Typically within 2 hours during business hours</span>
      </div>
    </div>`;

    injectEl.innerHTML = html;
    if (doneBtn) step4.insertBefore(injectEl, doneBtn);
  }

  window.mortDocUploaded = async function(input, docType) {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.getElementById('mort-doc-' + docType + '-status');
    const row = input.closest('.mort-upload-row');
    // File validation
    const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (!ALLOWED_TYPES.includes(file.type)) {
      if (statusEl) statusEl.textContent = 'Only PDF, JPG, PNG allowed';
      return;
    }
    if (file.size > MAX_SIZE) {
      if (statusEl) statusEl.textContent = 'File too large (max 10MB)';
      return;
    }
    if (statusEl) statusEl.textContent = 'Uploading...';
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const path = `${window._mortAppId || 'pending'}/${docType}_${Date.now()}.${ext}`;
      const res = await fetch(SUPABASE_URL + '/storage/v1/object/mortgage-docs/' + path, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': file.type, 'x-upsert': 'true' },
        body: file
      });
      if (res.ok) {
        if (statusEl) statusEl.textContent = file.name;
        if (row) row.classList.add('uploaded');
        const checkEl = document.getElementById('mort-doc-' + docType + '-check');
        if (checkEl) checkEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';
        if (window._mortAppId) {
          await fetch(SUPABASE_URL + '/rest/v1/mortgage_applications?id=eq.' + window._mortAppId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ ['docs_' + docType]: path })
          });
        }
        logEvent('mortgage_doc_uploaded', { type: docType });
      } else { if (statusEl) statusEl.textContent = 'Upload failed — tap to retry'; }
    } catch (e) { if (statusEl) statusEl.textContent = 'Upload failed — tap to retry'; }
  };

  // ==========================================
  // KEYBOARD NAVIGATION
  // ==========================================
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const mortModal = document.getElementById('mortgage-modal');
      if (mortModal && mortModal.classList.contains('open')) { closeMortgage(); return; }
      if (document.getElementById('photo-viewer').classList.contains('open')) { closePhotoViewer(); return; }
      if (document.getElementById('gallery-overlay').classList.contains('open')) { closeFullGallery(); return; }
      if (document.getElementById('detail-overlay').classList.contains('open')) { closeDetail(); return; }
      if (document.getElementById('filters-overlay').classList.contains('open')) { closeFilters(); return; }
      if (document.getElementById('prop-overlay').classList.contains('open')) closeProps();
      if (document.getElementById('lead-modal').classList.contains('open')) closeLead();
    }
  });

  // ==========================================
  // FOCUS TRAP UTILITY
  // ==========================================
  function trapFocus(modal, e) {
    const focusable = modal.querySelectorAll('input:not([tabindex="-1"]),select,textarea,button:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const leadModal = document.getElementById('lead-modal');
    if (leadModal && leadModal.classList.contains('open')) { trapFocus(leadModal, e); return; }
    const mortModal = document.getElementById('mortgage-modal');
    if (mortModal && mortModal.classList.contains('open')) { trapFocus(mortModal, e); }
  });

  // ==========================================
  // LEAD MODAL
  // ==========================================
  // Track previously focused element for focus restoration
  let _previousFocus = null;

  window.openLead = function() {
    if (!currentAgent) return;
    _previousFocus = document.activeElement;
    document.getElementById('lead-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('modal-agent-name').textContent = currentAgent.name || '';
    document.getElementById('lead-form').classList.remove('hidden');
    document.getElementById('lead-success').classList.add('hidden');
    document.getElementById('lead-error').classList.remove('show');
    document.getElementById('lead-error').textContent = '';
    // Focus first input after animation
    setTimeout(() => { document.getElementById('lead-name').focus(); }, 100);
  };

  window.closeLead = function() {
    document.getElementById('lead-modal').classList.remove('open');
    document.body.style.overflow = '';
    // Restore focus to the element that opened the modal
    if (_previousFocus && _previousFocus.focus) { _previousFocus.focus(); _previousFocus = null; }
    document.getElementById('lead-name').value = '';
    document.getElementById('lead-phone').value = '';
    document.getElementById('lead-email').value = '';
    document.getElementById('lead-budget').value = '';
    document.getElementById('lead-type').value = '';
    document.getElementById('lead-area').value = '';
    document.getElementById('lead-message').value = '';
    document.getElementById('lead-error').classList.remove('show');
    const btn = document.getElementById('btn-lead');
    btn.disabled = false;
    btn.textContent = 'Send My Inquiry';
    document.getElementById('lead-extra').classList.remove('open');
    document.getElementById('lead-expander').classList.remove('open');
  };

  window.toggleExtra = function() {
    const extra = document.getElementById('lead-extra');
    const btn = document.getElementById('lead-expander');
    extra.classList.toggle('open');
    btn.classList.toggle('open');
  };

  // Rate-limit state: 30s cooldown between submissions
  let _lastLeadSubmit = 0;
  const LEAD_COOLDOWN_MS = 30000;

  window.submitLead = async function() {
    const errEl = document.getElementById('lead-error');
    errEl.classList.remove('show');

    // Client-side rate limit
    const now = Date.now();
    if (now - _lastLeadSubmit < LEAD_COOLDOWN_MS) {
      const secs = Math.ceil((LEAD_COOLDOWN_MS - (now - _lastLeadSubmit)) / 1000);
      errEl.textContent = `Please wait ${secs}s before submitting again.`;
      errEl.classList.add('show');
      return;
    }

    const name = document.getElementById('lead-name').value.trim();
    const phone = document.getElementById('lead-phone').value.trim();
    const email = document.getElementById('lead-email').value.trim();

    // Honeypot check — bots fill hidden fields; don't send value to server
    const hp = document.getElementById('lead-website');
    if (hp && hp.value) { errEl.textContent = 'Submission blocked.'; errEl.classList.add('show'); return; }

    if (!name || name.length < 2) { errEl.textContent = 'Please enter your full name.'; errEl.classList.add('show'); return; }
    if (!phone && !email) { errEl.textContent = 'Please enter a phone number or email.'; errEl.classList.add('show'); return; }
    if (phone && phone.length < 7) { errEl.textContent = 'Please enter a valid phone number.'; errEl.classList.add('show'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.classList.add('show'); return; }

    const btn = document.getElementById('btn-lead');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Sending...';

    try {
      const params = new URLSearchParams(window.location.search);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const res = await fetch(CAPTURE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          agent_slug: currentAgent.slug,
          name,
          phone: phone || null,
          email: email || null,
          budget_range: document.getElementById('lead-budget').value || null,
          property_type: document.getElementById('lead-type').value || null,
          preferred_area: document.getElementById('lead-area').value.trim() || null,
          message: document.getElementById('lead-message').value.trim() || null,
          source: 'profile',
          utm_source: params.get('utm_source'),
          utm_medium: params.get('utm_medium'),
          utm_campaign: params.get('utm_campaign'),
          device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
        })
      });
      clearTimeout(timeout);
      const data = await res.json();

      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = 'Send My Inquiry';
        errEl.textContent = data.error || 'Something went wrong. Please try again.';
        errEl.classList.add('show');
        return;
      }

      _lastLeadSubmit = Date.now();
      document.getElementById('lead-form').classList.add('hidden');
      document.getElementById('lead-success').classList.remove('hidden');
      document.getElementById('success-msg').textContent =
        `${currentAgent?.name || 'The agent'} has received your inquiry. You'll hear back within 30 minutes during business hours.`;
      logEvent('lead_submit', { source: 'profile_form' });

      if (window.fbq) fbq('track', 'Lead', { content_name: 'SellingDubai Lead', content_category: 'real_estate' });
      if (window.gtag) gtag('event', 'generate_lead', { event_category: 'lead_capture', event_label: currentAgent.slug });
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Send My Inquiry';
      errEl.textContent = e.name === 'AbortError'
        ? 'Request timed out. Please check your connection and try again.'
        : 'Connection error. Please try again.';
      errEl.classList.add('show');
    }
  };

  // ==========================================
  // RENDER AGENT PAGE
  // ==========================================
  function showPage(id) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('skeleton').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('pending').classList.add('hidden');
    document.getElementById('agent-page').classList.add('hidden');
    document.getElementById(id).classList.remove('hidden');
  }

  async function renderAgent(agent) {
    currentAgent = agent;

    const DEFAULT_BG = 'https://pjyorgedaxevxophpfib.supabase.co/storage/v1/object/public/agent-images/dubai-skyline.jpg';
    const bg = document.getElementById('bg');
    const bgUrl = safeUrl(agent.background_image_url) || DEFAULT_BG;
    // Double-check the URL doesn't contain CSS-breaking characters
    if (bgUrl && /^https?:\/\//.test(bgUrl)) {
      bg.style.backgroundImage = `url('${bgUrl.replace(/'/g, "\\'")}')`;
      bg.classList.remove('bg-fallback');
    }

    // Avatar with error fallback
    const avatarContainer = document.getElementById('avatar-container');
    const safeInitials = escHtml((agent.name || '').split(' ').map(n => (n[0] || '')).join('').slice(0, 2));
    const isVerified = agent.verification_status === 'verified' || agent.dld_verified;
    if (agent.photo_url) {
      const img = document.createElement('img');
      img.className = 'avatar' + (isVerified ? ' avatar-verified' : '');
      img.src = agent.photo_url;
      img.alt = agent.name || '';
      img.onerror = function() { avatarContainer.innerHTML = `<div class="avatar-fallback${isVerified ? ' avatar-verified' : ''}">${safeInitials}</div>`; };
      avatarContainer.innerHTML = '';
      avatarContainer.appendChild(img);
    } else {
      avatarContainer.innerHTML = `<div class="avatar-fallback${isVerified ? ' avatar-verified' : ''}">${safeInitials}</div>`;
    }

    document.getElementById('agent-name').textContent = agent.name;
    if (agent.verification_status === 'verified') {
      document.getElementById('verified-badge').classList.remove('hidden');
    }

    document.getElementById('agent-bio').textContent = agent.tagline || '';

    // Bio-long removed — single tagline only for clean mobile UX

    // Trust bar — single consolidated verification line
    const trustBar = document.getElementById('trust-bar');
    let trustChips = [];
    if (agent.dld_broker_number || agent.broker_number) {
      trustChips.push(`<span class="trust-chip">BRN ${escHtml(agent.dld_broker_number || agent.broker_number)}</span>`);
    }
    if (agent.dld_verified) {
      trustChips.push(`<span class="trust-chip trust-chip-active"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> DLD Verified</span>`);
    } else if (agent.verification_status === 'verified') {
      trustChips.push(`<span class="trust-chip trust-chip-active"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> RERA Licensed</span>`);
    }
    if (trustChips.length) {
      trustBar.innerHTML = trustChips.join('');
      trustBar.classList.remove('hidden');
    }

    // DLD transaction stats — only show if agent has actual deal data (> 0)
    const dldStatsEl = document.getElementById('dld-stats');
    const hasDldDeals = agent.dld_total_deals && agent.dld_total_deals > 0;
    const hasDldVolume = agent.dld_total_volume_aed && agent.dld_total_volume_aed > 0;
    if (dldStatsEl && (hasDldDeals || hasDldVolume)) {
      let statsHtml = '<div class="dld-stats-row">';
      if (hasDldDeals) {
        statsHtml += `<div class="dld-stat"><span class="dld-stat-value">${agent.dld_total_deals}</span><span class="dld-stat-label">DLD Transactions</span></div>`;
      }
      if (hasDldVolume) {
        const vol = agent.dld_total_volume_aed >= 1000000
          ? 'AED ' + (agent.dld_total_volume_aed / 1000000).toFixed(0) + 'M'
          : 'AED ' + agent.dld_total_volume_aed.toLocaleString();
        statsHtml += `<div class="dld-stat"><span class="dld-stat-value">${vol}</span><span class="dld-stat-label">Total Volume</span></div>`;
      }
      statsHtml += '</div>';
      dldStatsEl.innerHTML = statsHtml;
      dldStatsEl.classList.remove('hidden');
    }

    // Agency badge
    const agencyEl = document.getElementById('agency-badge');
    if (agent.agency_name || agent.agency_logo_url) {
      let badgeHTML = '';
      if (agent.agency_logo_url) badgeHTML += `<img class="agency-logo" src="${agent.agency_logo_url}" alt="" onerror="this.style.display='none'">`;
      if (agent.agency_name) badgeHTML += `<span class="agency-name">${escHtml(agent.agency_name)}</span>`;
      agencyEl.innerHTML = badgeHTML;
      agencyEl.classList.remove('hidden');
    }

    // SEO — upsert meta tags (prevents duplicates on re-render)
    document.title = `${agent.name} | SellingDubai`;

    function upsertMeta(attr, key, content) {
      let tag = document.querySelector(`meta[${attr}="${key}"]`);
      if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attr, key); document.head.appendChild(tag); }
      tag.content = content;
    }

    upsertMeta('name', 'description', `${agent.name} — ${agent.tagline || 'Dubai Real Estate Agent'} | SellingDubai`);

    const ogTags = {
      'og:title': `${agent.name} | SellingDubai`,
      'og:description': agent.tagline || 'Dubai Real Estate Agent',
      'og:image': agent.photo_url || DEFAULT_BG,
      'og:type': 'profile',
      'og:url': window.location.href,
      'og:site_name': 'SellingDubai'
    };
    Object.entries(ogTags).forEach(([prop, content]) => {
      if (content) upsertMeta('property', prop, content);
    });
    const twitterTags = {
      'twitter:card': 'summary_large_image',
      'twitter:title': `${agent.name} | SellingDubai`,
      'twitter:description': agent.tagline || 'Dubai Real Estate Agent',
      'twitter:image': agent.photo_url || DEFAULT_BG
    };
    Object.entries(twitterTags).forEach(([name, content]) => {
      if (content) upsertMeta('name', name, content);
    });

    // === JSON-LD STRUCTURED DATA ===
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      'name': agent.name,
      'url': window.location.href,
      'description': agent.tagline || 'Dubai Real Estate Agent',
    };
    if (agent.photo_url) jsonLd.image = agent.photo_url;
    if (agent.agency_name) jsonLd.worksFor = { '@type': 'Organization', 'name': agent.agency_name };
    if (agent.whatsapp) jsonLd.telephone = agent.whatsapp;
    if (agent.email) jsonLd.email = agent.email;
    jsonLd.address = { '@type': 'PostalAddress', 'addressLocality': 'Dubai', 'addressCountry': 'AE' };
    // Remove any existing JSON-LD before inserting
    const existingLd = document.querySelector('script[type="application/ld+json"]');
    if (existingLd) existingLd.remove();
    const ldScript = document.createElement('script');
    ldScript.type = 'application/ld+json';
    ldScript.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(ldScript);

    // === BUTTONS ===
    const linksEl = document.getElementById('links');
    let buttonsHTML = '';

    if (agent.whatsapp) {
      const waNum = agent.whatsapp.replace(/[^0-9]/g, '');
      const waMsg = encodeURIComponent(`Hi ${agent.name}, I found your profile on SellingDubai and I'm interested in Dubai properties.`);
      const waUrl = `https://wa.me/${waNum}?text=${waMsg}`;
      buttonsHTML += `<a href="${escAttr(waUrl)}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-wa" data-track="whatsapp" data-url="${escAttr(waUrl)}">
        <span class="btn-icon">${ICONS.whatsapp}</span> WhatsApp Me
      </a>`;
    }

    const safeCalendly = safeUrl(agent.calendly_url);
    if (safeCalendly) {
      buttonsHTML += `<a href="${escAttr(safeCalendly)}" target="_blank" rel="noopener noreferrer" class="link-btn" data-track="consultation" data-url="${escAttr(safeCalendly)}">
        <span class="btn-icon">${ICONS.calendar}</span> Get Free Consultation
      </a>`;
    } else {
      buttonsHTML += `<button class="link-btn" onclick="openLead()" data-track="consultation">
        <span class="btn-icon">${ICONS.calendar}</span> Get Free Consultation
      </button>`;
    }

    const showPreapproval = agent.show_preapproval !== false;
    if (showPreapproval) {
      buttonsHTML += `<div class="btn-grid">
        <button class="link-btn link-btn-glass" onclick="openProps()" data-track="listings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.7"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
          Portfolio
        </button>
        <button class="link-btn link-btn-glass" onclick="openMortgage()" data-track="mortgage" style="border:none;cursor:pointer;">
          <span class="btn-icon" style="width:16px;height:16px;">${ICONS.shield}</span>
          Get Pre-Approved
        </button>
      </div>`;
    } else {
      buttonsHTML += `<button class="link-btn link-btn-glass" onclick="openProps()" data-track="listings" style="width:100%">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.7"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
        Portfolio
      </button>`;
    }

    const safeCustom1 = safeUrl(agent.custom_link_1_url);
    if (safeCustom1 && agent.custom_link_1_label) {
      buttonsHTML += `<a href="${escAttr(safeCustom1)}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-glass" data-track="custom" data-url="${escAttr(safeCustom1)}">
        ${escHtml(agent.custom_link_1_label)}
      </a>`;
    }
    const safeCustom2 = safeUrl(agent.custom_link_2_url);
    if (safeCustom2 && agent.custom_link_2_label) {
      buttonsHTML += `<a href="${escAttr(safeCustom2)}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-glass" data-track="custom" data-url="${escAttr(safeCustom2)}">
        ${escHtml(agent.custom_link_2_label)}
      </a>`;
    }

    buttonsHTML += `<button class="link-btn link-btn-ghost" onclick="saveContact()" data-track="save_contact">
      <span class="btn-icon" style="width:16px;height:16px;opacity:0.6">${ICONS.contact}</span> Save My Contact
    </button>`;

    linksEl.innerHTML = buttonsHTML;

    if (agent.show_golden_visa !== false) {
      document.getElementById('gv-widget').classList.remove('hidden');
    }

    loadProperties(agent.id);

    // === SOCIAL ICONS ===
    const socialsEl = document.getElementById('socials');
    const socialLinks = [];
    if (safeUrl(agent.instagram_url)) socialLinks.push({ url: safeUrl(agent.instagram_url), icon: ICONS.instagram, type: 'instagram', label: 'Instagram' });
    if (safeUrl(agent.youtube_url)) socialLinks.push({ url: safeUrl(agent.youtube_url), icon: ICONS.youtube, type: 'youtube', label: 'YouTube' });
    if (safeUrl(agent.tiktok_url)) socialLinks.push({ url: safeUrl(agent.tiktok_url), icon: ICONS.tiktok, type: 'tiktok', label: 'TikTok' });
    if (safeUrl(agent.linkedin_url)) socialLinks.push({ url: safeUrl(agent.linkedin_url), icon: ICONS.linkedin, type: 'linkedin', label: 'LinkedIn' });

    socialsEl.innerHTML = socialLinks.map(s =>
      `<a href="${escAttr(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}" data-track="${s.type}" data-url="${escAttr(s.url)}">${s.icon}</a>`
    ).join('');

    // === TRACKING SCRIPTS (sanitized) ===
    const safeFbPixel = safeTrackingId(agent.facebook_pixel_id);
    if (safeFbPixel) {
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', safeFbPixel);
      fbq('track', 'PageView');
    }
    const safeGaId = safeTrackingId(agent.ga4_measurement_id);
    if (safeGaId) {
      const gaScript = document.createElement('script');
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${safeGaId}`;
      document.head.appendChild(gaScript);
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', safeGaId);
    }

    showPage('agent-page');

    // === REFERRAL CTA (free-tier profiles only) ===
    if (agent.tier === 'free' || !agent.tier) {
      const refCta = document.getElementById('referral-cta');
      if (refCta) {
        const refLink = refCta.querySelector('.referral-cta-link');
        if (refLink) {
          refLink.href = '/join?ref=' + encodeURIComponent(agent.referral_code || agent.slug);
        }
        refCta.style.display = 'block';
      }
    }

    // === STICKY BOTTOM CTA BAR ===
    const stickyCta = document.getElementById('sticky-cta');
    const stickyWaBtn = document.getElementById('sticky-wa-btn');
    if (stickyCta) {
      // Wire WhatsApp button
      if (agent.whatsapp) {
        const waNum = agent.whatsapp.replace(/[^0-9]/g, '');
        const waMsg = encodeURIComponent(`Hi ${agent.name}, I found your profile on SellingDubai and I'm interested in Dubai properties.`);
        stickyWaBtn.style.display = 'flex';
        stickyWaBtn.onclick = () => {
          window.open(`https://wa.me/${waNum}?text=${waMsg}`, '_blank');
          logEvent('whatsapp_tap', { source: 'sticky_cta' });
        };
      }
      // Show/hide on scroll — appears after scrolling past link buttons
      const linksEl = document.getElementById('links');
      let stickyVisible = false;
      const observer = new IntersectionObserver((entries) => {
        const isVisible = entries[0].isIntersecting;
        if (!isVisible && !stickyVisible) {
          stickyCta.style.display = 'block';
          requestAnimationFrame(() => { stickyCta.classList.add('visible'); });
          stickyVisible = true;
        } else if (isVisible && stickyVisible) {
          stickyCta.classList.remove('visible');
          setTimeout(() => { if (!stickyCta.classList.contains('visible')) stickyCta.style.display = 'none'; }, 300);
          stickyVisible = false;
        }
      }, { threshold: 0 });
      if (linksEl) observer.observe(linksEl);
    }
  }

  // ==========================================
  // SHARE (Native)
  // ==========================================
  window.nativeShare = async function() {
    const url = window.location.href;
    const name = currentAgent ? currentAgent.name : 'this agent';
    const shareData = {
      title: `${name} — SellingDubai`,
      text: `Check out ${name}'s verified agent profile on SellingDubai`,
      url: url
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const ta = document.createElement('textarea');
          ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        const btn = document.getElementById('nav-share-btn');
        if (btn) {
          btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25d366" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>';
          setTimeout(() => { btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>'; }, 2000);
        }
      }
      if (currentAgent) logEvent('share', { method: navigator.share ? 'native' : 'clipboard' });
    } catch (e) { /* user cancelled share sheet */ }
  };

  // ==========================================
  // OWNER DETECTION — show Edit button if logged in
  // ==========================================
  async function showEditButtonIfOwner(agent) {
    const token = localStorage.getItem('sd_edit_token');
    if (!token) return;
    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/verify-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.agent && data.agent.id === agent.id) {
        const editBtn = document.getElementById('nav-edit-btn');
        if (editBtn) {
          editBtn.href = '/edit';
          editBtn.classList.remove('hidden');
        }
        // Hide "Get Your Page" since they already have one
        const claimBtn = document.getElementById('nav-claim-btn');
        if (claimBtn) claimBtn.style.display = 'none';
      }
    } catch (e) { /* silently fail — not critical */ }
  }

  // ==========================================
  // INIT
  // ==========================================
  function injectSchemaOrg(agent) {
    try {
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'RealEstateAgent',
        'name': agent.name || '',
        'description': agent.tagline || '',
        'url': window.location.href,
        'image': agent.photo_url || '',
        'address': { '@type': 'PostalAddress', 'addressLocality': 'Dubai', 'addressCountry': 'AE' }
      };
      if (agent.email) schema.email = agent.email;
      if (agent.whatsapp) schema.telephone = '+' + agent.whatsapp;
      if (agent.agency_name) schema.worksFor = { '@type': 'Organization', 'name': agent.agency_name };
      const el = document.getElementById('schema-agent');
      if (el) el.textContent = JSON.stringify(schema);
    } catch (e) { /* non-critical */ }
  }

  // Hydrate Open Graph + canonical URL for social sharing / crawlers
  function hydrateOgMeta(agent) {
    try {
      const url = window.location.href;
      const title = agent.name ? `${agent.name} — Dubai Real Estate Agent | SellingDubai` : 'SellingDubai';
      const desc = agent.tagline || 'Dubai real estate agent profile — verified listings, off-plan projects, and direct contact.';
      document.title = title;
      const setMeta = (id, val) => { const el = document.getElementById(id); if (el) el.setAttribute('content', val); };
      setMeta('og-title', title);
      setMeta('og-desc', desc);
      setMeta('og-url', url);
      if (agent.photo_url) setMeta('og-image', agent.photo_url);
      const canon = document.getElementById('canonical-url');
      if (canon) canon.setAttribute('href', url);
      // Update meta description
      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) descMeta.setAttribute('content', desc);
    } catch (e) { /* non-critical */ }
  }

  async function init() {
    const slug = getAgentSlug();
    if (!slug) { showPage('error'); return; }

    // Show skeleton shimmer immediately
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('skeleton').classList.remove('hidden');

    // Timeout guard — show error if fetch takes > 10s
    const timeout = setTimeout(() => { showPage('error'); }, 10000);

    try {
      const { data: agent, error } = await supabase
        .from('agents')
        .select('id,slug,name,photo_url,background_image_url,verification_status,tagline,bio,phone,dld_broker_number,broker_number,dld_total_deals,dld_total_volume_aed,dld_verified,agency_name,agency_logo_url,whatsapp,email,calendly_url,custom_link_1_url,custom_link_1_label,custom_link_2_url,custom_link_2_label,instagram_url,youtube_url,tiktok_url,linkedin_url,facebook_pixel_id,ga4_measurement_id,show_golden_visa,show_preapproval,tier,referral_code')
        .eq('slug', slug)
        .single();

      clearTimeout(timeout);

      if (error || !agent) { showPage('error'); return; }

      if (agent.verification_status !== 'verified') {
        document.getElementById('pending-agent-name').textContent = agent.name || 'This agent';
        showPage('pending');
        return;
      }

      renderAgent(agent);
      injectSchemaOrg(agent);
      hydrateOgMeta(agent);
      trackPageView(agent.id);

      // Show Edit button if this agent is viewing their own profile
      showEditButtonIfOwner(agent);

      const params = new URLSearchParams(window.location.search);
      if (params.get('open') === 'lead') {
        setTimeout(() => window.openLead(), 500);
      }
    } catch (e) {
      clearTimeout(timeout);
      console.error('Init error:', e);
      if (window.__sdTrackError) window.__sdTrackError('Agent init failed: ' + e.message, { slug: slug, stack: e.stack });
      showPage('error');
    }
  }

  // === AGENT SEARCH (error page) ===
  window.searchAgent = async function() {
    const query = document.getElementById('agent-search').value.trim();
    if (!query || query.length < 2) return;

    const { data: agents } = await supabase
      .from('agents')
      .select('name, slug')
      .eq('verification_status', 'verified')
      .ilike('name', `%${query}%`)
      .limit(5);

    const resultsEl = document.getElementById('search-results');
    if (agents && agents.length > 0) {
      resultsEl.style.display = 'block';
      resultsEl.innerHTML = agents.map(a =>
        `<a href="/a/${escAttr(a.slug)}" style="display:block;padding:12px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;margin-bottom:6px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">${escHtml(a.name)}</a>`
      ).join('');
    } else {
      resultsEl.style.display = 'block';
      resultsEl.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:13px;text-align:center;padding:8px;">No agents found — try another name</p>';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ==========================================
  // SERVICE WORKER REGISTRATION
  // ==========================================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  // ==========================================
  // OFFLINE DETECTION
  // ==========================================
  function showOfflineBanner(show) {
    let banner = document.getElementById('offline-banner');
    if (show && !banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;text-align:center;padding:8px 16px;font-family:Inter,sans-serif;font-size:13px;font-weight:600;transition:transform 0.3s;';
      banner.textContent = 'You are offline. Some features may not work.';
      document.body.prepend(banner);
    } else if (!show && banner) {
      banner.remove();
    }
  }
  window.addEventListener('offline', () => showOfflineBanner(true));
  window.addEventListener('online', () => showOfflineBanner(false));
  if (!navigator.onLine) showOfflineBanner(true);
})();