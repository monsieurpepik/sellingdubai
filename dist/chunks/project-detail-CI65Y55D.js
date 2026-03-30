import{a,b as l}from"./chunk-HD4TFP6T.js";import{a as S}from"./chunk-ZUJQAZHO.js";import{f as H}from"./chunk-OO245FJT.js";var w=(i,n)=>i?`/.netlify/images?url=${encodeURIComponent(i)}&w=${n}&fm=webp&q=80`:"",T=i=>i?"AED\xA0"+Number(i).toLocaleString("en-AE",{maximumFractionDigits:0}):null,R=i=>i?i.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<iframe[\s\S]*?<\/iframe>/gi,"").replace(/\s+on\w+="[^"]*"/gi,"").replace(/\s+on\w+='[^']*'/gi,""):"",Y=i=>i==="under_construction"?"Under Construction":i==="completed"?"Completed":"Off Plan",G=i=>/[/_-]thumb(nail)?[/_.-]/i.test(i);function O(i){let n=(i||"").toLowerCase();return/pool|swim/.test(n)?"pool":/gym|gymnasium|fitness/.test(n)?"fitness_center":/spa|sauna|steam/.test(n)?"spa":/tennis/.test(n)?"sports_tennis":/basketball|sport/.test(n)?"sports_basketball":/park|garden|landscap/.test(n)?"park":/beach|sea|waterfront/.test(n)?"beach_access":/security|guard|surveillance/.test(n)?"security":/parking|garage/.test(n)?"local_parking":/elevator|lift/.test(n)?"elevator":/concierge|reception|lobby/.test(n)?"concierge":/restaurant|dine|dining|cafe|food/.test(n)?"restaurant":/retail|shop|mall|store/.test(n)?"shopping_bag":/balcony|terrace/.test(n)?"balcony":/pet/.test(n)?"pets":/kids|child|play/.test(n)?"child_care":/storage/.test(n)?"storage":/smart|iot/.test(n)?"home_iot_device":/cctv|camera/.test(n)?"videocam":/bedroom|master/.test(n)?"bedroom_parent":"check_circle"}var _=[],$=0,y=1;function V(){if(document.getElementById("proj-lb"))return;let i=document.createElement("div");i.id="proj-lb",i.style.cssText="position:fixed;inset:0;z-index:9999;background:#000;display:none;flex-direction:column;align-items:stretch;",i.innerHTML=`
    <div style="position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;z-index:1;background:linear-gradient(#000a,transparent);">
      <div style="width:44px;"></div>
      <div id="proj-lb-counter" style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;font-family:'Inter',sans-serif;"></div>
      <button onclick="closeProjLightbox()" aria-label="Close" style="width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2715;</button>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">
      <button onclick="window._lbStep(-1)" aria-label="Previous" id="proj-lb-prev" style="position:absolute;left:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2039;</button>
      <img id="proj-lb-img" style="max-width:100%;max-height:100%;object-fit:contain;touch-action:none;" src="" alt="">
      <button onclick="window._lbStep(1)" aria-label="Next" id="proj-lb-next" style="position:absolute;right:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x203A;</button>
    </div>`,document.body.appendChild(i);let n=i.querySelector("#proj-lb-img"),s=!1,e=0,g=0;n.addEventListener("touchstart",o=>{o.touches.length===2?(s=!0,e=Math.hypot(o.touches[0].clientX-o.touches[1].clientX,o.touches[0].clientY-o.touches[1].clientY)):(g=o.touches[0].clientX,s=!1)},{passive:!0}),n.addEventListener("touchmove",o=>{if(s&&o.touches.length===2){let d=Math.hypot(o.touches[0].clientX-o.touches[1].clientX,o.touches[0].clientY-o.touches[1].clientY);y=Math.max(1,Math.min(4,y*(d/e))),e=d,n.style.transform=`scale(${y})`}},{passive:!0}),n.addEventListener("touchend",o=>{if(o.touches.length<2&&(s=!1),!s&&o.changedTouches.length===1&&y<=1.1){let d=o.changedTouches[0].clientX-g;Math.abs(d)>50&&window._lbStep(d<0?1:-1)}},{passive:!0})}function N(){let i=document.getElementById("proj-lb-img"),n=document.getElementById("proj-lb-counter"),s=document.getElementById("proj-lb-prev"),e=document.getElementById("proj-lb-next");if(!i)return;i.src=w(_[$],1200),i.style.transform=`scale(${y})`,n&&(n.textContent=`${$+1} / ${_.length}`);let g=_.length>1;s&&(s.style.display=g?"flex":"none"),e&&(e.style.display=g?"flex":"none")}window._lbStep=function(i){$=($+i+_.length)%_.length,y=1,N()};window.openProjLightbox=function(i){V(),$=i,y=1;let n=document.getElementById("proj-lb");n.style.display="flex",document.body.style.overflow="hidden",N()};window.closeProjLightbox=function(){let i=document.getElementById("proj-lb");i&&(i.style.display="none"),document.body.style.overflow=""};async function Q(i){let n=document.getElementById("detail-sheet"),s=document.getElementById("detail-overlay");if(!n||!s)return;n.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project\u2026</div>`,s.classList.add("open"),document.body.style.overflow="hidden";let{data:e,error:g}=await H.from("projects").select("slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,facilities,nearby_locations,brochure_url,images_categorized,status,property_types,beds,developers(name,logo_url,website)").eq("slug",i).single();if(g||!e){n.innerHTML=`
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;return}let o=e.developers||{},d=e.cover_image_url?w(e.cover_image_url,800):"",j=T(e.min_price),z=T(e.max_price),B=j&&z?`${j} \u2013 ${z}`:j||z||"",M=e.district_name||e.location||e.area||"",I=Array.isArray(e.property_types)&&e.property_types.length?e.property_types.join(", "):"",L=e.min_area_sqft&&e.max_area_sqft?`${Number(e.min_area_sqft).toLocaleString()} \u2013 ${Number(e.max_area_sqft).toLocaleString()} sqft`:e.min_area_sqft?`From ${Number(e.min_area_sqft).toLocaleString()} sqft`:"",c=e.images_categorized,p=[];if(c&&(c.interior?.length||c.exterior?.length))p=[...c.interior||[],...c.exterior||[]].filter(r=>r&&r!==e.cover_image_url);else if(Array.isArray(e.gallery_images)&&e.gallery_images.length){let t=new Set(c?.general||[]);p=e.gallery_images.filter(r=>r&&r!==e.cover_image_url&&!t.has(r))}p=p.filter(t=>!G(t)),_=e.cover_image_url?[e.cover_image_url,...p]:[...p];let C=c?.general?.filter(Boolean).length?c.general.filter(Boolean):Array.isArray(e.floor_plan_urls)?e.floor_plan_urls.filter(Boolean):[],k=(d?1:0)+p.length,D=Array.isArray(e.facilities)&&e.facilities.length?e.facilities:[],A=Array.isArray(e.nearby_locations)&&e.nearby_locations.length?e.nearby_locations:[],q=e.available_units&&typeof e.available_units=="object"?Array.isArray(e.available_units)?e.available_units:e.available_units.units||[]:[],b=null,h=null,f=null,F=null,U=null,E=e.payment_plan_detail,m=Array.isArray(E)&&E.length>0?E[0]:null;if(m&&typeof m=="object"){F=m.title||null,U=Array.isArray(m.milestones)&&m.milestones.length?m.milestones:null;let t=m.heading_percentages;if(t&&typeof t=="object")for(let[r,u]of Object.entries(t)){let x=r.toLowerCase(),v=u?parseInt(String(u),10):null;x.includes("booking")?b=v:x.includes("construction")?h=v:(x.includes("completion")||x.includes("handover"))&&(f=v)}}else{let t=e.payment_plan;t&&typeof t=="object"&&!Array.isArray(t)?(b=t.booking??t.booking_percentage??null,h=t.construction??t.construction_percentage??null,f=t.handover??t.handover_percentage??null):e.handover_percentage!=null&&(f=e.handover_percentage,b=10,h=Math.max(0,100-b-f))}let X=b!=null||h!=null||f!=null,P=e.completion_date?new Date(e.completion_date).toLocaleDateString("en-AE",{month:"long",year:"numeric"}):null;if(n.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${d||p.length?`
    <div style="position:relative;flex-shrink:0;">
      <div id="proj-gallery" style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
        ${d?`<div style="flex:0 0 100%;scroll-snap-align:start;cursor:pointer;" onclick="openProjLightbox(0)"><img src="${l(d)}" alt="${l(e.name)}" style="width:100%;height:240px;object-fit:cover;pointer-events:none;" loading="eager" onerror="handleImgError(this)"></div>`:""}
        ${p.map((t,r)=>`<div style="flex:0 0 100%;scroll-snap-align:start;cursor:pointer;" onclick="openProjLightbox(${(d?1:0)+r})"><img src="${l(w(t,800))}" alt="${l(e.name)} photo ${r+2}" style="width:100%;height:240px;object-fit:cover;pointer-events:none;" loading="lazy" onerror="handleImgError(this)"></div>`).join("")}
      </div>
      ${k>1?`<div id="proj-gallery-count" style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;pointer-events:none;">1 / ${k}</div>`:""}
    </div>`:""}

    <div class="detail-body" style="padding:20px 20px 80px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${a(Y(e.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${a(e.name)}</h2>
        ${M?`<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">\u{1F4CD} ${a(M)}</div>`:""}
      </div>

      <!-- Price -->
      ${B?`<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${a(B)}</div>`:""}

      <!-- Specs row -->
      ${I||e.beds||L||P?`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${I?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${a(I)}</span></div>`:""}
        ${e.beds?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${a(e.beds)}</span></div>`:""}
        ${L?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${a(L)}</span></div>`:""}
        ${P?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${a(P)}</span></div>`:""}
      </div>`:""}

      <!-- Developer card -->
      ${o.name?`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${o.logo_url?`<img src="${l(w(o.logo_url,80))}" alt="${l(o.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">`:'<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">\u{1F3D7}\uFE0F</div>'}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${a(o.name)}</div>
          ${o.website?`<a href="${l(o.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${a(o.website.replace(/^https?:\/\//,""))}</a>`:""}
        </div>
      </div>`:""}

      <!-- Payment plan -->
      ${X?`
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
      ${q.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${q.map(t=>{let u=(t.bedroom?`${t.bedroom}BR `:"")+(t.property_types||"Unit"),x=t.lowest_area||t.area_sqft||t.area,v=t.lowest_price||t.price||t.min_price;return`
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
      ${C.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Site Plan</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${C.map((t,r)=>`<img src="${l(w(t,800))}" alt="Site plan ${r+1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join("")}
        </div>
      </div>`:""}

      <!-- Facilities -->
      ${D.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Amenities</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${D.map(t=>`
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 10px;text-align:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:32px;color:#1127D2;line-height:1;">${a(O(t.name))}</span>
            <div style="font-size:11px;color:rgba(255,255,255,0.8);line-height:1.3;">${a(t.name)}</div>
          </div>`).join("")}
        </div>
      </div>`:""}

      <!-- Nearby locations -->
      ${A.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Nearby</h3>
        <div style="display:flex;flex-direction:column;gap:0;">
          ${A.map((t,r)=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;${r<A.length-1?"border-bottom:1px solid rgba(255,255,255,0.06);":""}">
            <span style="font-size:13px;color:rgba(255,255,255,0.75);">\u{1F4CD} ${a(t.name)}</span>
            ${t.distance?`<span style="font-size:12px;color:rgba(255,255,255,0.4);white-space:nowrap;margin-left:8px;">${a(t.distance)}</span>`:""}
          </div>`).join("")}
        </div>
      </div>`:""}

      <!-- Description -->
      ${e.description?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <div id="proj-desc" style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${R(e.description)}</div>
        <button id="proj-desc-more" onclick="(function(){var d=document.getElementById('proj-desc');d.style.webkitLineClamp='unset';d.style.overflow='visible';d.style.display='block';document.getElementById('proj-desc-more').style.display='none';})()" style="background:none;border:none;color:rgba(255,255,255,0.45);font-size:12px;padding:4px 0 0;cursor:pointer;font-family:'Inter',sans-serif;">Read more</button>
      </div>`:""}

      <!-- Brochure download (gate behind lead capture) -->
      ${e.brochure_url?`
      <div style="margin-bottom:20px;">
        <button data-brochure="${l(e.brochure_url)}" onclick="openLeadForBrochure('${l(e.name)}', this.dataset.brochure)" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;box-sizing:border-box;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Get Brochure \u2014 Free
        </button>
      </div>`:""}

    </div>

    <div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));position:sticky;bottom:0;background:#000;border-top:1px solid rgba(255,255,255,0.06);">
      <button onclick="openLead('${l(e.name)}')" style="flex:1;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Enquire</button>
      ${S?.whatsapp?`<a href="https://wa.me/${encodeURIComponent(S.whatsapp.replace(/[^0-9]/g,""))}?text=${encodeURIComponent("Hi, I'm interested in "+e.name+" \u2014 can you tell me more?")}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-decoration:none;">WhatsApp</a>`:""}
    </div>`,k>1){let t=document.getElementById("proj-gallery"),r=document.getElementById("proj-gallery-count");t&&r&&t.addEventListener("scroll",()=>{let u=Math.round(t.scrollLeft/t.clientWidth);r.textContent=`${u+1} / ${k}`},{passive:!0})}}export{Q as openProjectDetail};
//# sourceMappingURL=project-detail-CI65Y55D.js.map
