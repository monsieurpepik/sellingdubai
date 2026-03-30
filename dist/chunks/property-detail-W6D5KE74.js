import{a as T}from"./chunk-U6DZRGHU.js";import"./chunk-XRWAOUFY.js";import{a as x}from"./chunk-2DHAKTSV.js";import{a as n,b as w}from"./chunk-HD4TFP6T.js";import{a as p,b as P}from"./chunk-ZUJQAZHO.js";import"./chunk-OO245FJT.js";var B=null;window.openPropertyById=function(t){let s=P.find(l=>String(l.id)===String(t));if(!s)return;B=s,z(s);let o=document.getElementById("detail-cta-bar");o&&(o.style.display=""),document.getElementById("detail-overlay").classList.add("open"),document.body.style.overflow="hidden",x("link_click",{link_type:"property_detail",property:s.title})};window.openPropertyDetail=function(t){let o=T()[t];if(!o)return;B=o,z(o);let l=document.getElementById("detail-cta-bar");l&&(l.style.display=""),document.getElementById("detail-overlay").classList.add("open"),document.body.style.overflow="hidden",x("link_click",{link_type:"property_detail",property:o.title})};window.closeDetail=function(){document.getElementById("detail-overlay").classList.remove("open");let t=document.getElementById("prop-overlay")?.classList.contains("open");document.body.style.overflow=t?"hidden":"";let s=document.getElementById("sticky-cta");s&&s.dataset.prevDisplay!==void 0&&(s.style.display=s.dataset.prevDisplay,delete s.dataset.prevDisplay),B=null,p&&history.pushState(null,"","/a/"+p.slug)};function z(t){window._currentProperty=t;let s=document.getElementById("detail-sheet"),o=t.additional_photos||[],l=[t.image_url,...o].filter(Boolean),d="";if(l.length>0){let i=`<img id="detail-hero-img" class="detail-hero" src="${w(l[0])}" alt="${w(t.title)}" loading="lazy" onclick="openPhotoViewer(window._currentDetailHeroIdx||0)" style="cursor:pointer" onerror="handleImgError(this)">`;if(l.length>1){let e=l.slice(1,5).map((u,f)=>`<img src="${w(u)}" alt="" loading="lazy" onclick="swapDetailHero(${f+1})" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;cursor:pointer" onerror="handleImgError(this)">`).join("");d=`<div class="detail-gallery-wrap">${i}<div class="detail-gallery">${e}</div><button class="detail-show-all" onclick="openFullGallery()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>SHOW ALL PHOTOS</button></div>`}else d=i}window._currentDetailImages=l,window._currentDetailHeroIdx=0;let r=t.title?`<div class="detail-breadcrumb">${n(t.title)}</div>`:"",b=t.title?`<div class="detail-title-above">${n(t.title)}</div>`:"",M="";if(t.price){let i=n(t.price);M=/AED/i.test(i)?i:`AED ${i}`}let g=[];t.bedrooms&&g.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7v11a1 1 0 001 1h16a1 1 0 001-1V7"/><path d="M21 11H3V9a2 2 0 012-2h14a2 2 0 012 2v2z"/></svg>${t.bedrooms} Bed${t.bedrooms>1?"s":""}</div>`),t.bathrooms&&g.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"/><path d="M6 12V5a2 2 0 012-2h1a2 2 0 012 2v1"/></svg>${t.bathrooms} Bath${t.bathrooms>1?"s":""}</div>`),t.area_sqft&&g.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>${t.area_sqft.toLocaleString()} sqft</div>`);let S=g.length>0?`<div class="detail-specs-row">${g.join('<div class="detail-spec-divider"></div>')}</div>`:"",v="",h=[];t.property_type&&h.push(`<div class="detail-info-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h1m-1 4h1m-1 4h1"/></svg>${n(t.property_type)}</div>`),t.land_area&&h.push(`<div class="detail-info-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="0" stroke-dasharray="4 2"/></svg>${t.land_area} m\xB2 Land</div>`);let m=(t.features||[]).map(i=>{let e=i.toLowerCase(),a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';return e.includes("view")||e.includes("landmark")||e.includes("panoram")?a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><circle cx="12" cy="14" r="3"/></svg>':e.includes("pool")?a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M2 19c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><circle cx="8" cy="8" r="2"/><path d="M16 8h-4l-2 3"/></svg>':e.includes("gym")||e.includes("fitness")?a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 6.5h11M6.5 17.5h11"/><rect x="2" y="8" width="4" height="8" rx="1"/><rect x="18" y="8" width="4" height="8" rx="1"/><path d="M6.5 12h11"/></svg>':e.includes("garden")?a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V12"/><path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5"/><path d="M4 15c0-3.31 3.58-6 8-6s8 2.69 8 6"/></svg>':e.includes("jacuzzi")||e.includes("spa")?a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"/><path d="M8 7c0-1 .5-2 2-2s2 1 2 0 .5-2 2-2 2 1 2 2"/></svg>':e.includes("bbq")||e.includes("barbecue")?a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="10" r="6"/><path d="M12 16v4"/><path d="M8 20h8"/><path d="M9 7c1 1 2 1 3 0s2-1 3 0"/></svg>':e.includes("parking")||e.includes("garage")?a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 010 6H9"/></svg>':e.includes("balcony")&&(a='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 15h18"/><path d="M3 15v5h18v-5"/><path d="M9 15V5h6v10"/></svg>'),`<div class="detail-info-item">${a}${n(i)}</div>`});(h.length>0||m.length>0)&&(v='<div class="detail-info-card">',h.length>0&&(v+=`<div class="detail-info-title">Property Details</div><div class="detail-info-row">${h.join("")}</div>`),h.length>0&&m.length>0&&(v+='<div class="detail-info-divider"></div>'),m.length>0&&(v+=`<div class="detail-info-title">Amenities</div><div class="detail-info-row">${m.join("")}</div>`),v+="</div>");let V=t.description?`<div class="detail-description-card"><div class="detail-section-title">Description</div><div class="detail-description">${n(t.description)}</div></div>`:"",C="";if(t.location){let i=encodeURIComponent(t.location+", Dubai, UAE"),e=`https://www.google.com/maps/search/?api=1&query=${i}`;C=`<div class="detail-location-card"><div class="detail-section-title">Location</div>
      <div class="detail-location-text"><svg width="14" height="14" viewBox="0 0 24 24" fill="#c9a96e" style="vertical-align:-2px;margin-right:6px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>${n(t.location)}, Dubai, UAE</div>
      <div class="detail-map detail-map-clickable" onclick="window.open('${e}','_blank')">
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d14000!2d55.27!3d25.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z${i}!5e0!3m2!1sen!2sae!4v1" class="detail-map-iframe" allowfullscreen loading="lazy"></iframe>
        <div class="detail-map-overlay">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          <span class="detail-map-label">Open in Maps</span>
        </div>
      </div></div>`}let D="";(t.dld_permit||t.reference_number)&&(D=`<div class="detail-reg-card">
      <div class="detail-info-title">Regulatory Information</div>
      <div class="detail-reg-grid">
        ${t.dld_permit?`<div><div class="detail-reg-label">Trakheesi Permit</div><div class="detail-reg-value">${n(t.dld_permit)}</div></div>`:""}
        ${t.reference_number?`<div><div class="detail-reg-label">Reference</div><div class="detail-reg-value">${n(t.reference_number)}</div></div>`:""}
        <div><div class="detail-reg-label">Listed</div><div class="detail-reg-value">${new Date(t.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div></div>
      </div>
    </div>`);let _="";if(t.price){let i=parseFloat(String(t.price).replace(/[^0-9.]/g,""));if(i>0){let e=i*.04,a=i>=5e5?4200:2100,u=580,f=i*.021,E=2500,y=e+a+u+f+E,I=i*.8,L=I*.0025+290,H=I*.01,q=y+L+H,c=$=>"AED "+Math.round($).toLocaleString(),A=$=>($*100).toFixed(1)+"%";_=`
      <div class="cost-to-own-card">
        <div class="cost-to-own-title">Cost to Own</div>
        <div class="cost-to-own-subtitle">Estimated transaction costs for this property</div>
        <div class="cost-toggle-row">
          <button class="cost-toggle-btn active" onclick="toggleCostMode(this,'cash')">Cash Purchase</button>
          <button class="cost-toggle-btn" onclick="toggleCostMode(this,'mortgage')">With Mortgage</button>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">DLD Transfer Fee <span class="cost-pct">4%</span></span>
          <span class="cost-row-value">${c(e)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">DLD Admin Fee</span>
          <span class="cost-row-value">${c(a)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Title Deed Issuance</span>
          <span class="cost-row-value">${c(u)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Agent Commission <span class="cost-pct">2% + VAT</span></span>
          <span class="cost-row-value">${c(f)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Developer NOC</span>
          <span class="cost-row-value">~${c(E)}</span>
        </div>
        <div class="cost-mortgage-section hidden" id="cost-mortgage-rows">
          <div class="cost-row">
            <span class="cost-row-label">Mortgage Registration <span class="cost-pct">0.25%</span></span>
            <span class="cost-row-value">${c(L)}</span>
          </div>
          <div class="cost-row">
            <span class="cost-row-label">Bank Processing <span class="cost-pct">~1%</span></span>
            <span class="cost-row-value">${c(H)}</span>
          </div>
        </div>
        <div class="cost-divider"></div>
        <div class="cost-row-total">
          <span class="cost-row-label">Total Estimated Cost</span>
          <span class="cost-row-value" id="cost-total-value">${c(y)}</span>
        </div>
        <div class="cost-row-total" style="padding-top:4px;">
          <span class="cost-row-label" style="font-weight:300;font-size:11px;color:rgba(255,255,255,0.3);">% of purchase price</span>
          <span class="cost-row-value" style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.4);" id="cost-total-pct">${A(y/i)}</span>
        </div>
      </div>`,window._costData={cashTotal:y,mortgageTotal:q,rawPrice:i,fmtAED:c,fmtPct:A}}}let F=`<button class="detail-share-btn" onclick="if(navigator.share)navigator.share({title:'${w(t.title||"")}',url:window.location.href});else if(navigator.clipboard)navigator.clipboard.writeText(window.location.href).then(()=>this.textContent='Link Copied!')">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share
  </button>`;s.innerHTML=`
    <div class="detail-title-bar">${r}${b}</div>
    ${d}
    <div class="detail-body">
      <div class="detail-price-row">
        <div>
          <div class="detail-price">${M}</div>
          <span class="detail-price-label">${t.listing_type==="rent"?"Per Year":"Asking Price"}</span>
        </div>
        ${F}
      </div>
      ${S}
      ${v}
      ${V}
      ${C}
      ${D}
      ${_}
    </div>
  `,s.scrollTop=0;let k=document.getElementById("detail-wa-btn"),O=document.getElementById("detail-inquire-btn");p&&p.whatsapp?(k.style.display="flex",k.onclick=()=>{window.open(`https://wa.me/${p.whatsapp.replace(/[^0-9]/g,"")}?text=${encodeURIComponent("Hi, I'm interested in: "+(t.title||"your property"))}`,"_blank"),x("whatsapp_tap",{source:"property_detail",property:t.title})}):k.style.display="none",O.onclick=()=>openLeadForProperty(t.title)}window.toggleCostMode=function(t,s){t.parentElement.querySelectorAll(".cost-toggle-btn").forEach(b=>b.classList.remove("active")),t.classList.add("active");let o=document.getElementById("cost-mortgage-rows"),l=document.getElementById("cost-total-value"),d=document.getElementById("cost-total-pct");if(!o||!window._costData)return;let r=window._costData;s==="mortgage"?(o.classList.remove("hidden"),l.textContent=r.fmtAED(r.mortgageTotal),d.textContent=r.fmtPct(r.mortgageTotal/r.rawPrice)):(o.classList.add("hidden"),l.textContent=r.fmtAED(r.cashTotal),d.textContent=r.fmtPct(r.cashTotal/r.rawPrice))};
//# sourceMappingURL=property-detail-W6D5KE74.js.map
