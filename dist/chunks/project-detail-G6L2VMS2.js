import{a,b as s}from"./chunk-HD4TFP6T.js";import{a as S}from"./chunk-ZUJQAZHO.js";import{f as T}from"./chunk-OO245FJT.js";var $=(i,n)=>i?`/.netlify/images?url=${encodeURIComponent(i)}&w=${n}&fm=webp&q=80`:"",N=i=>i?"AED\xA0"+Number(i).toLocaleString("en-AE",{maximumFractionDigits:0}):null,Y=i=>i?i.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<iframe[\s\S]*?<\/iframe>/gi,"").replace(/\s+on\w+="[^"]*"/gi,"").replace(/\s+on\w+='[^']*'/gi,""):"",G=i=>i==="under_construction"?"Under Construction":i==="completed"?"Completed":"Off Plan",O=i=>/[/_-]thumb(nail)?[/_.-]/i.test(i);function V(i){let n=(i||"").toLowerCase();return/pool|swim/.test(n)?"pool":/gym|gymnasium|fitness/.test(n)?"fitness_center":/spa|sauna|steam/.test(n)?"spa":/tennis/.test(n)?"sports_tennis":/basketball|sport/.test(n)?"sports_basketball":/park|garden|landscap/.test(n)?"park":/beach|sea|waterfront/.test(n)?"beach_access":/security|guard|surveillance/.test(n)?"security":/parking|garage/.test(n)?"local_parking":/elevator|lift/.test(n)?"elevator":/concierge|reception|lobby/.test(n)?"concierge":/restaurant|dine|dining|cafe|food/.test(n)?"restaurant":/retail|shop|mall|store/.test(n)?"shopping_bag":/balcony|terrace/.test(n)?"balcony":/pet/.test(n)?"pets":/kids|child|play/.test(n)?"child_care":/storage/.test(n)?"storage":/smart|iot/.test(n)?"home_iot_device":/cctv|camera/.test(n)?"videocam":/bedroom|master/.test(n)?"bedroom_parent":"check_circle"}var _=[],k=0,y=1;function W(){if(document.getElementById("proj-lb"))return;let i=document.createElement("div");i.id="proj-lb",i.style.cssText="position:fixed;inset:0;z-index:9999;background:#000;display:none;flex-direction:column;align-items:stretch;",i.innerHTML=`
    <div style="position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;z-index:1;background:linear-gradient(#000a,transparent);">
      <div style="width:44px;"></div>
      <div id="proj-lb-counter" style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;font-family:'Inter',sans-serif;"></div>
      <button onclick="closeProjLightbox()" aria-label="Close" style="width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2715;</button>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">
      <button onclick="window._lbStep(-1)" aria-label="Previous" id="proj-lb-prev" style="position:absolute;left:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2039;</button>
      <img id="proj-lb-img" style="max-width:100%;max-height:100%;object-fit:contain;touch-action:none;" src="" alt="">
      <button onclick="window._lbStep(1)" aria-label="Next" id="proj-lb-next" style="position:absolute;right:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x203A;</button>
    </div>`,document.body.appendChild(i);let n=i.querySelector("#proj-lb-img"),d=!1,p=0,e=0;n.addEventListener("touchstart",r=>{r.touches.length===2?(d=!0,p=Math.hypot(r.touches[0].clientX-r.touches[1].clientX,r.touches[0].clientY-r.touches[1].clientY)):(e=r.touches[0].clientX,d=!1)},{passive:!0}),n.addEventListener("touchmove",r=>{if(d&&r.touches.length===2){let l=Math.hypot(r.touches[0].clientX-r.touches[1].clientX,r.touches[0].clientY-r.touches[1].clientY);y=Math.max(1,Math.min(4,y*(l/p))),p=l,n.style.transform=`scale(${y})`}},{passive:!0}),n.addEventListener("touchend",r=>{if(r.touches.length<2&&(d=!1),!d&&r.changedTouches.length===1&&y<=1.1){let l=r.changedTouches[0].clientX-e;Math.abs(l)>50&&window._lbStep(l<0?1:-1)}},{passive:!0})}function F(){let i=document.getElementById("proj-lb-img"),n=document.getElementById("proj-lb-counter"),d=document.getElementById("proj-lb-prev"),p=document.getElementById("proj-lb-next");if(!i)return;i.src=$(_[k],1200),i.style.transform=`scale(${y})`,n&&(n.textContent=`${k+1} / ${_.length}`);let e=_.length>1;d&&(d.style.display=e?"flex":"none"),p&&(p.style.display=e?"flex":"none")}window._lbStep=function(i){k=(k+i+_.length)%_.length,y=1,F()};window.openProjLightbox=function(i){W(),k=i,y=1;let n=document.getElementById("proj-lb");n.style.display="flex",document.body.style.overflow="hidden",F()};window.closeProjLightbox=function(){let i=document.getElementById("proj-lb");i&&(i.style.display="none"),document.body.style.overflow=""};async function Z(i){let n=document.getElementById("detail-sheet"),d=document.getElementById("detail-overlay");if(!n||!d)return;n.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project\u2026</div>`,d.classList.add("open"),document.body.style.overflow="hidden";let p=document.getElementById("detail-cta-bar");p&&(p.style.display="none");let{data:e,error:r}=await T.from("projects").select("slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,facilities,nearby_locations,brochure_url,images_categorized,status,property_types,beds,developers(name,logo_url,website)").eq("slug",i).single();if(r||!e){n.innerHTML=`
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;return}let l=e.developers||{},w=e.cover_image_url?$(e.cover_image_url,800):"",z=N(e.min_price),I=N(e.max_price),M=z&&I?`${z} \u2013 ${I}`:z||I||"",C=e.district_name||e.location||e.area||"",L=Array.isArray(e.property_types)&&e.property_types.length?e.property_types.join(", "):"",A=e.min_area_sqft&&e.max_area_sqft?`${Number(e.min_area_sqft).toLocaleString()} \u2013 ${Number(e.max_area_sqft).toLocaleString()} sqft`:e.min_area_sqft?`From ${Number(e.min_area_sqft).toLocaleString()} sqft`:"",g=e.images_categorized,c=[];if(g&&(g.interior?.length||g.exterior?.length))c=[...g.interior||[],...g.exterior||[]].filter(o=>o&&o!==e.cover_image_url);else if(Array.isArray(e.gallery_images)&&e.gallery_images.length){let t=new Set(g?.general||[]);c=e.gallery_images.filter(o=>o&&o!==e.cover_image_url&&!t.has(o))}c=c.filter(t=>!O(t)),_=e.cover_image_url?[e.cover_image_url,...c]:[...c];let D=g?.general?.filter(Boolean).length?g.general.filter(Boolean):Array.isArray(e.floor_plan_urls)?e.floor_plan_urls.filter(Boolean):[],j=(w?1:0)+c.length,q=Array.isArray(e.facilities)&&e.facilities.length?e.facilities:[],E=Array.isArray(e.nearby_locations)&&e.nearby_locations.length?e.nearby_locations:[],H=e.available_units&&typeof e.available_units=="object"?Array.isArray(e.available_units)?e.available_units:e.available_units.units||[]:[],b=null,h=null,f=null,U=null,X=null,P=e.payment_plan_detail,m=Array.isArray(P)&&P.length>0?P[0]:null;if(m&&typeof m=="object"){U=m.title||null,X=Array.isArray(m.milestones)&&m.milestones.length?m.milestones:null;let t=m.heading_percentages;if(t&&typeof t=="object")for(let[o,u]of Object.entries(t)){let x=o.toLowerCase(),v=u?parseInt(String(u),10):null;x.includes("booking")?b=v:x.includes("construction")?h=v:(x.includes("completion")||x.includes("handover"))&&(f=v)}}else{let t=e.payment_plan;t&&typeof t=="object"&&!Array.isArray(t)?(b=t.booking??t.booking_percentage??null,h=t.construction??t.construction_percentage??null,f=t.handover??t.handover_percentage??null):e.handover_percentage!=null&&(f=e.handover_percentage,b=10,h=Math.max(0,100-b-f))}let R=b!=null||h!=null||f!=null,B=e.completion_date?new Date(e.completion_date).toLocaleDateString("en-AE",{month:"long",year:"numeric"}):null;if(n.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${w||c.length?`
    <div style="position:relative;flex-shrink:0;">
      <div id="proj-gallery" style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
        ${w?`<div style="flex:0 0 100%;scroll-snap-align:start;cursor:pointer;" onclick="openProjLightbox(0)"><img src="${s(w)}" alt="${s(e.name)}" style="width:100%;height:240px;object-fit:cover;pointer-events:none;" loading="eager" onerror="handleImgError(this)"></div>`:""}
        ${c.map((t,o)=>`<div style="flex:0 0 100%;scroll-snap-align:start;cursor:pointer;" onclick="openProjLightbox(${(w?1:0)+o})"><img src="${s($(t,800))}" alt="${s(e.name)} photo ${o+2}" style="width:100%;height:240px;object-fit:cover;pointer-events:none;" loading="lazy" onerror="handleImgError(this)"></div>`).join("")}
      </div>
      ${j>1?`<div id="proj-gallery-count" style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;pointer-events:none;">1 / ${j}</div>`:""}
    </div>`:""}

    <div class="detail-body" style="padding:20px 20px 80px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${a(G(e.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${a(e.name)}</h2>
        ${C?`<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">\u{1F4CD} ${a(C)}</div>`:""}
      </div>

      <!-- Price -->
      ${M?`<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${a(M)}</div>`:""}

      <!-- Specs row -->
      ${L||e.beds||A||B?`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${L?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${a(L)}</span></div>`:""}
        ${e.beds?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${a(e.beds)}</span></div>`:""}
        ${A?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${a(A)}</span></div>`:""}
        ${B?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${a(B)}</span></div>`:""}
      </div>`:""}

      <!-- Developer card -->
      ${l.name?`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${l.logo_url?`<img src="${s($(l.logo_url,80))}" alt="${s(l.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">`:'<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">\u{1F3D7}\uFE0F</div>'}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${a(l.name)}</div>
          ${l.website?`<a href="${s(l.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${a(l.website.replace(/^https?:\/\//,""))}</a>`:""}
        </div>
      </div>`:""}

      <!-- Payment plan -->
      ${R?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${b!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${b}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>`:""}
          ${h!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${h}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>`:""}
          ${f!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${f}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>`:""}
        </div>
      </div>`:`
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Payment Plan</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);">Contact the agent for full payment plan details.</div>
      </div>`}

      <!-- Available units -->
      ${H.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${H.map(t=>{let u=(t.bedroom?`${t.bedroom}BR `:"")+(t.property_types||"Unit"),x=t.lowest_area||t.area_sqft||t.area,v=t.lowest_price||t.price||t.min_price;return`
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <div style="font-size:13px;font-weight:600;">${a(u)}</div>
              ${v?`<div style="font-size:13px;font-weight:700;white-space:nowrap;">AED\xA0${Number(v).toLocaleString("en-AE",{maximumFractionDigits:0})}</div>`:""}
            </div>
            ${x?`<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">From ${a(Number(x).toLocaleString("en-AE",{maximumFractionDigits:0}))} sqft</div>`:""}
          </div>`}).join("")}
        </div>
      </div>`:""}

      <!-- Site Plan -->
      ${D.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Site Plan</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${D.map((t,o)=>`<img src="${s($(t,800))}" alt="Site plan ${o+1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join("")}
        </div>
      </div>`:""}

      <!-- Facilities -->
      ${q.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Amenities</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${q.map(t=>`
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 10px;text-align:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:32px;color:#1127D2;line-height:1;">${a(V(t.name))}</span>
            <div style="font-size:11px;color:rgba(255,255,255,0.8);line-height:1.3;">${a(t.name)}</div>
          </div>`).join("")}
        </div>
      </div>`:""}

      <!-- Nearby locations -->
      ${E.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Nearby</h3>
        <div style="display:flex;flex-direction:column;gap:0;">
          ${E.map((t,o)=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;${o<E.length-1?"border-bottom:1px solid rgba(255,255,255,0.06);":""}">
            <span style="font-size:13px;color:rgba(255,255,255,0.75);">\u{1F4CD} ${a(t.name)}</span>
            ${t.distance?`<span style="font-size:12px;color:rgba(255,255,255,0.4);white-space:nowrap;margin-left:8px;">${a(t.distance)}</span>`:""}
          </div>`).join("")}
        </div>
      </div>`:""}

      <!-- Description -->
      ${e.description?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <div id="proj-desc" style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${Y(e.description)}</div>
        <button id="proj-desc-more" onclick="(function(){var d=document.getElementById('proj-desc');d.style.webkitLineClamp='unset';d.style.overflow='visible';d.style.display='block';document.getElementById('proj-desc-more').style.display='none';})()" style="background:none;border:none;color:rgba(255,255,255,0.45);font-size:12px;padding:4px 0 0;cursor:pointer;font-family:'Inter',sans-serif;">Read more</button>
      </div>`:""}

      <!-- Brochure download (gate behind lead capture) -->
      ${e.brochure_url?`
      <div style="margin-bottom:20px;">
        <button data-brochure="${s(e.brochure_url)}" onclick="openLeadForBrochure('${s(e.name)}', this.dataset.brochure)" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;box-sizing:border-box;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Get Brochure \u2014 Free
        </button>
      </div>`:""}

    </div>

    <div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));position:sticky;bottom:0;background:#000;border-top:1px solid rgba(255,255,255,0.06);">
      <button onclick="openLead('${s(e.name)}')" style="flex:1;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Enquire</button>
      ${S?.whatsapp?`<a href="https://wa.me/${encodeURIComponent(S.whatsapp.replace(/[^0-9]/g,""))}?text=${encodeURIComponent("Hi, I'm interested in "+e.name+" \u2014 can you tell me more?")}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-decoration:none;">WhatsApp</a>`:""}
    </div>`,j>1){let t=document.getElementById("proj-gallery"),o=document.getElementById("proj-gallery-count");t&&o&&t.addEventListener("scroll",()=>{let u=Math.round(t.scrollLeft/t.clientWidth);o.textContent=`${u+1} / ${j}`},{passive:!0})}}export{Z as openProjectDetail};
//# sourceMappingURL=project-detail-G6L2VMS2.js.map
