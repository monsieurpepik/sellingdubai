import{a as T}from"./chunk-4VHTAKFU.js";import"./chunk-E6R7PVYD.js";import{a as r,b as g}from"./chunk-HD4TFP6T.js";import{a as y,b as H,g as x}from"./chunk-34Y3FG7V.js";import"./chunk-OO245FJT.js";var M=null;window.openPropertyById=function(t){let a=H.find(o=>String(o.id)===String(t));a&&(M=a,z(a),document.getElementById("detail-overlay").classList.add("open"),document.body.style.overflow="hidden",x("link_click",{link_type:"property_detail",property:a.title}))};window.openPropertyDetail=function(t){let o=T()[t];o&&(M=o,z(o),document.getElementById("detail-overlay").classList.add("open"),document.body.style.overflow="hidden",x("link_click",{link_type:"property_detail",property:o.title}))};window.closeDetail=function(){document.getElementById("detail-overlay").classList.remove("open"),document.body.style.overflow="hidden",M=null};function z(t){window._currentProperty=t;let a=document.getElementById("detail-sheet"),o=t.additional_photos||[],c=[t.image_url,...o].filter(Boolean),d="";if(c.length>0){let i=`<img class="detail-hero" src="${g(c[0])}" alt="${g(t.title)}" loading="lazy" onclick="openPhotoViewer(0)" style="cursor:pointer" onerror="handleImgError(this)">`;if(c.length>1){let e=c.slice(1,5).map((m,u)=>`<img src="${g(m)}" alt="" loading="lazy" onclick="openPhotoViewer(${u+1})" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;cursor:pointer" onerror="handleImgError(this)">`).join("");d=`<div class="detail-gallery-wrap">${i}<div class="detail-gallery">${e}</div><button class="detail-show-all" onclick="openFullGallery()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>SHOW ALL PHOTOS</button></div>`}else d=i}window._currentDetailImages=c;let l=t.title?`<div class="detail-breadcrumb">${r(t.title)}</div>`:"",b=t.title?`<div class="detail-title-above">${r(t.title)}</div>`:"",C="";if(t.price){let i=r(t.price);C=/AED/i.test(i)?i:`AED ${i}`}let p=[];t.bedrooms&&p.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7v11a1 1 0 001 1h16a1 1 0 001-1V7"/><path d="M21 11H3V9a2 2 0 012-2h14a2 2 0 012 2v2z"/></svg>${t.bedrooms} Bed${t.bedrooms>1?"s":""}</div>`),t.bathrooms&&p.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"/><path d="M6 12V5a2 2 0 012-2h1a2 2 0 012 2v1"/></svg>${t.bathrooms} Bath${t.bathrooms>1?"s":""}</div>`),t.area_sqft&&p.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>${t.area_sqft.toLocaleString()} sqft</div>`);let V=p.length>0?`<div class="detail-specs-row">${p.join('<div class="detail-spec-divider"></div>')}</div>`:"",h="",v=[];t.property_type&&v.push(`<div class="detail-info-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h1m-1 4h1m-1 4h1"/></svg>${r(t.property_type)}</div>`),t.land_area&&v.push(`<div class="detail-info-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="0" stroke-dasharray="4 2"/></svg>${t.land_area} m\xB2 Land</div>`);let w=(t.features||[]).map(i=>{let e=i.toLowerCase(),s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';return e.includes("view")||e.includes("landmark")||e.includes("panoram")?s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><circle cx="12" cy="14" r="3"/></svg>':e.includes("pool")?s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M2 19c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><circle cx="8" cy="8" r="2"/><path d="M16 8h-4l-2 3"/></svg>':e.includes("gym")||e.includes("fitness")?s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 6.5h11M6.5 17.5h11"/><rect x="2" y="8" width="4" height="8" rx="1"/><rect x="18" y="8" width="4" height="8" rx="1"/><path d="M6.5 12h11"/></svg>':e.includes("garden")?s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V12"/><path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5"/><path d="M4 15c0-3.31 3.58-6 8-6s8 2.69 8 6"/></svg>':e.includes("jacuzzi")||e.includes("spa")?s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"/><path d="M8 7c0-1 .5-2 2-2s2 1 2 0 .5-2 2-2 2 1 2 2"/></svg>':e.includes("bbq")||e.includes("barbecue")?s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="10" r="6"/><path d="M12 16v4"/><path d="M8 20h8"/><path d="M9 7c1 1 2 1 3 0s2-1 3 0"/></svg>':e.includes("parking")||e.includes("garage")?s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 010 6H9"/></svg>':e.includes("balcony")&&(s='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 15h18"/><path d="M3 15v5h18v-5"/><path d="M9 15V5h6v10"/></svg>'),`<div class="detail-info-item">${s}${r(i)}</div>`});(v.length>0||w.length>0)&&(h='<div class="detail-info-card">',v.length>0&&(h+=`<div class="detail-info-title">Property Details</div><div class="detail-info-row">${v.join("")}</div>`),v.length>0&&w.length>0&&(h+='<div class="detail-info-divider"></div>'),w.length>0&&(h+=`<div class="detail-info-title">Amenities</div><div class="detail-info-row">${w.join("")}</div>`),h+="</div>");let F=t.description?`<div class="detail-description-card"><div class="detail-section-title">Description</div><div class="detail-description">${r(t.description)}</div></div>`:"",B="";if(t.location){let i=encodeURIComponent(t.location+", Dubai, UAE"),e=`https://www.google.com/maps/search/?api=1&query=${i}`;B=`<div class="detail-location-card"><div class="detail-section-title">Location</div>
      <div class="detail-location-text"><svg width="14" height="14" viewBox="0 0 24 24" fill="#c9a96e" style="vertical-align:-2px;margin-right:6px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>${r(t.location)}, Dubai, UAE</div>
      <div class="detail-map detail-map-clickable" onclick="window.open('${e}','_blank')">
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d14000!2d55.27!3d25.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z${i}!5e0!3m2!1sen!2sae!4v1" class="detail-map-iframe" allowfullscreen loading="lazy"></iframe>
        <div class="detail-map-overlay">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          <span class="detail-map-label">Open in Maps</span>
        </div>
      </div></div>`}let _="";(t.dld_permit||t.reference_number)&&(_=`<div class="detail-reg-card">
      <div class="detail-info-title">Regulatory Information</div>
      <div class="detail-reg-grid">
        ${t.dld_permit?`<div><div class="detail-reg-label">Trakheesi Permit</div><div class="detail-reg-value">${r(t.dld_permit)}</div></div>`:""}
        ${t.reference_number?`<div><div class="detail-reg-label">Reference</div><div class="detail-reg-value">${r(t.reference_number)}</div></div>`:""}
        <div><div class="detail-reg-label">Listed</div><div class="detail-reg-value">${new Date(t.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div></div>
      </div>
    </div>`);let D="";if(t.price){let i=parseFloat(String(t.price).replace(/[^0-9.]/g,""));if(i>0){let e=i*.04,s=i>=5e5?4200:2100,m=580,u=i*.021,E=2500,f=e+s+m+u+E,L=i*.8,I=L*.0025+290,A=L*.01,R=f+I+A,n=$=>"AED "+Math.round($).toLocaleString(),P=$=>($*100).toFixed(1)+"%";D=`
      <div class="cost-to-own-card">
        <div class="cost-to-own-title">Cost to Own</div>
        <div class="cost-to-own-subtitle">Estimated transaction costs for this property</div>
        <div class="cost-toggle-row">
          <button class="cost-toggle-btn active" onclick="toggleCostMode(this,'cash')">Cash Purchase</button>
          <button class="cost-toggle-btn" onclick="toggleCostMode(this,'mortgage')">With Mortgage</button>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">DLD Transfer Fee <span class="cost-pct">4%</span></span>
          <span class="cost-row-value">${n(e)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">DLD Admin Fee</span>
          <span class="cost-row-value">${n(s)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Title Deed Issuance</span>
          <span class="cost-row-value">${n(m)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Agent Commission <span class="cost-pct">2% + VAT</span></span>
          <span class="cost-row-value">${n(u)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Developer NOC</span>
          <span class="cost-row-value">~${n(E)}</span>
        </div>
        <div class="cost-mortgage-section hidden" id="cost-mortgage-rows">
          <div class="cost-row">
            <span class="cost-row-label">Mortgage Registration <span class="cost-pct">0.25%</span></span>
            <span class="cost-row-value">${n(I)}</span>
          </div>
          <div class="cost-row">
            <span class="cost-row-label">Bank Processing <span class="cost-pct">~1%</span></span>
            <span class="cost-row-value">${n(A)}</span>
          </div>
        </div>
        <div class="cost-divider"></div>
        <div class="cost-row-total">
          <span class="cost-row-label">Total Estimated Cost</span>
          <span class="cost-row-value" id="cost-total-value">${n(f)}</span>
        </div>
        <div class="cost-row-total" style="padding-top:4px;">
          <span class="cost-row-label" style="font-weight:300;font-size:11px;color:rgba(255,255,255,0.3);">% of purchase price</span>
          <span class="cost-row-value" style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.4);" id="cost-total-pct">${P(f/i)}</span>
        </div>
      </div>`,window._costData={cashTotal:f,mortgageTotal:R,rawPrice:i,fmtAED:n,fmtPct:P}}}let S=`<button class="detail-share-btn" onclick="if(navigator.share)navigator.share({title:'${g(t.title||"")}',url:window.location.href});else if(navigator.clipboard)navigator.clipboard.writeText(window.location.href).then(()=>this.textContent='Link Copied!')">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share
  </button>`;a.innerHTML=`
    <div class="detail-title-bar">${l}${b}</div>
    ${d}
    <div class="detail-body">
      <div class="detail-price-row">
        <div>
          <div class="detail-price">${C}</div>
          <span class="detail-price-label">${t.listing_type==="rent"?"Per Year":"Asking Price"}</span>
        </div>
        ${S}
      </div>
      ${V}
      ${h}
      ${F}
      ${B}
      ${_}
      ${D}
    </div>
  `,a.scrollTop=0;let k=document.getElementById("detail-wa-btn"),q=document.getElementById("detail-inquire-btn");y&&y.whatsapp?(k.style.display="flex",k.onclick=()=>{window.open(`https://wa.me/${y.whatsapp.replace(/[^0-9]/g,"")}?text=${encodeURIComponent("Hi, I'm interested in: "+(t.title||"your property"))}`,"_blank"),x("whatsapp_tap",{source:"property_detail",property:t.title})}):k.style.display="none",q.onclick=()=>openLeadForProperty(t.title)}window.toggleCostMode=function(t,a){t.parentElement.querySelectorAll(".cost-toggle-btn").forEach(b=>b.classList.remove("active")),t.classList.add("active");let o=document.getElementById("cost-mortgage-rows"),c=document.getElementById("cost-total-value"),d=document.getElementById("cost-total-pct");if(!o||!window._costData)return;let l=window._costData;a==="mortgage"?(o.classList.remove("hidden"),c.textContent=l.fmtAED(l.mortgageTotal),d.textContent=l.fmtPct(l.mortgageTotal/l.rawPrice)):(o.classList.add("hidden"),c.textContent=l.fmtAED(l.cashTotal),d.textContent=l.fmtPct(l.cashTotal/l.rawPrice))};
//# sourceMappingURL=property-detail-F7RIEBGX.js.map
