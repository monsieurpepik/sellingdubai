import{a as o,b as r}from"./chunk-HD4TFP6T.js";import{a as A}from"./chunk-ZUJQAZHO.js";import{f as B}from"./chunk-OO245FJT.js";var f=(n,g)=>n?`/.netlify/images?url=${encodeURIComponent(n)}&w=${g}&fm=webp&q=80`:"",C=n=>n?"AED\xA0"+Number(n).toLocaleString("en-AE",{maximumFractionDigits:0}):null,U=n=>n?n.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<iframe[\s\S]*?<\/iframe>/gi,"").replace(/\s+on\w+="[^"]*"/gi,"").replace(/\s+on\w+='[^']*'/gi,""):"",F=n=>n==="under_construction"?"Under Construction":n==="completed"?"Completed":"Off Plan";async function V(n){let g=document.getElementById("detail-sheet"),L=document.getElementById("detail-overlay");if(!g||!L)return;g.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project\u2026</div>`,L.classList.add("open"),document.body.style.overflow="hidden";let{data:e,error:D}=await B.from("projects").select("slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,facilities,nearby_locations,brochure_url,images_categorized,status,property_types,beds,developers(name,logo_url,website)").eq("slug",n).single();if(D||!e){g.innerHTML=`
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;return}let a=e.developers||{},v=e.cover_image_url?f(e.cover_image_url,800):"",h=C(e.min_price),w=C(e.max_price),P=h&&w?`${h} \u2013 ${w}`:h||w||"",I=e.district_name||e.location||e.area||"",_=Array.isArray(e.property_types)&&e.property_types.length?e.property_types.join(", "):"",$=e.min_area_sqft&&e.max_area_sqft?`${Number(e.min_area_sqft).toLocaleString()} \u2013 ${Number(e.max_area_sqft).toLocaleString()} sqft`:e.min_area_sqft?`From ${Number(e.min_area_sqft).toLocaleString()} sqft`:"",l=e.images_categorized,y=[];if(l&&(l.interior?.length||l.exterior?.length))y=[...l.interior||[],...l.exterior||[]].filter(i=>i&&i!==e.cover_image_url);else if(Array.isArray(e.gallery_images)&&e.gallery_images.length){let t=new Set(l?.general||[]);y=e.gallery_images.filter(i=>i&&i!==e.cover_image_url&&!t.has(i))}let S=l?.general?.filter(Boolean).length?l.general.filter(Boolean):Array.isArray(e.floor_plan_urls)?e.floor_plan_urls.filter(Boolean):[],u=(v?1:0)+y.length,E=Array.isArray(e.facilities)&&e.facilities.length?e.facilities:[],k=Array.isArray(e.nearby_locations)&&e.nearby_locations.length?e.nearby_locations:[],M=e.available_units&&typeof e.available_units=="object"?Array.isArray(e.available_units)?e.available_units:e.available_units.units||[]:[],s=null,b=null,d=null,q=null,H=null,z=e.payment_plan_detail,p=Array.isArray(z)&&z.length>0?z[0]:null;if(p&&typeof p=="object"){q=p.title||null,H=Array.isArray(p.milestones)&&p.milestones.length?p.milestones:null;let t=p.heading_percentages;if(t&&typeof t=="object")for(let[i,x]of Object.entries(t)){let c=i.toLowerCase(),m=x?parseInt(String(x),10):null;c.includes("booking")?s=m:c.includes("construction")?b=m:(c.includes("completion")||c.includes("handover"))&&(d=m)}}else{let t=e.payment_plan;t&&typeof t=="object"&&!Array.isArray(t)?(s=t.booking??t.booking_percentage??null,b=t.construction??t.construction_percentage??null,d=t.handover??t.handover_percentage??null):e.handover_percentage!=null&&(d=e.handover_percentage,s=10,b=Math.max(0,100-s-d))}let N=s!=null||b!=null||d!=null,j=e.completion_date?new Date(e.completion_date).toLocaleDateString("en-AE",{month:"long",year:"numeric"}):null;if(g.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${v||y.length?`
    <div style="position:relative;flex-shrink:0;">
      <div id="proj-gallery" style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
        ${v?`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${r(v)}" alt="${r(e.name)}" style="width:100%;height:240px;object-fit:cover;" loading="eager" onerror="handleImgError(this)"></div>`:""}
        ${y.map((t,i)=>`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${r(f(t,800))}" alt="${r(e.name)} photo ${i+2}" style="width:100%;height:240px;object-fit:cover;" loading="lazy" onerror="handleImgError(this)"></div>`).join("")}
      </div>
      ${u>1?`<div id="proj-gallery-count" style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;pointer-events:none;">1 / ${u}</div>`:""}
    </div>`:""}

    <div class="detail-body" style="padding:20px 20px 80px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${o(F(e.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${o(e.name)}</h2>
        ${I?`<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">\u{1F4CD} ${o(I)}</div>`:""}
      </div>

      <!-- Price -->
      ${P?`<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${o(P)}</div>`:""}

      <!-- Specs row -->
      ${_||e.beds||$||j?`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${_?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${o(_)}</span></div>`:""}
        ${e.beds?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${o(e.beds)}</span></div>`:""}
        ${$?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${o($)}</span></div>`:""}
        ${j?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${o(j)}</span></div>`:""}
      </div>`:""}

      <!-- Developer card -->
      ${a.name?`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${a.logo_url?`<img src="${r(f(a.logo_url,80))}" alt="${r(a.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">`:'<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">\u{1F3D7}\uFE0F</div>'}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${o(a.name)}</div>
          ${a.website?`<a href="${r(a.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${o(a.website.replace(/^https?:\/\//,""))}</a>`:""}
        </div>
      </div>`:""}

      <!-- Payment plan -->
      ${N?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${s!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${s}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>`:""}
          ${b!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${b}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>`:""}
          ${d!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${d}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>`:""}
        </div>
      </div>`:`
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Payment Plan</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);">Contact the agent for full payment plan details.</div>
      </div>`}

      <!-- Available units -->
      ${M.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${M.map(t=>{let x=(t.bedroom?`${t.bedroom}BR `:"")+(t.property_types||"Unit"),c=t.lowest_area||t.area_sqft||t.area,m=t.lowest_price||t.price||t.min_price;return`
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <div style="font-size:13px;font-weight:600;">${o(x)}</div>
              ${m?`<div style="font-size:13px;font-weight:700;white-space:nowrap;">AED\xA0${Number(m).toLocaleString("en-AE",{maximumFractionDigits:0})}</div>`:""}
            </div>
            ${c?`<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">From ${o(Number(c).toLocaleString("en-AE",{maximumFractionDigits:0}))} sqft</div>`:""}
          </div>`}).join("")}
        </div>
      </div>`:""}

      <!-- Site Plan -->
      ${S.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Site Plan</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${S.map((t,i)=>`<img src="${r(f(t,800))}" alt="Site plan ${i+1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join("")}
        </div>
      </div>`:""}

      <!-- Facilities -->
      ${E.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Amenities</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${E.map(t=>`
          <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px;">
            ${t.image?`<img src="${r(f(t.image,80))}" alt="${r(t.name)}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;background:rgba(255,255,255,0.06);flex-shrink:0;" loading="lazy" onerror="this.style.background='rgba(255,255,255,0.06)';this.style.display='none'">`:'<div style="width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>'}
            <div style="font-size:12px;font-weight:500;color:rgba(255,255,255,0.8);line-height:1.3;">${o(t.name)}</div>
          </div>`).join("")}
        </div>
      </div>`:""}

      <!-- Nearby locations -->
      ${k.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Nearby</h3>
        <div style="display:flex;flex-direction:column;gap:0;">
          ${k.map((t,i)=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;${i<k.length-1?"border-bottom:1px solid rgba(255,255,255,0.06);":""}">
            <span style="font-size:13px;color:rgba(255,255,255,0.75);">\u{1F4CD} ${o(t.name)}</span>
            ${t.distance?`<span style="font-size:12px;color:rgba(255,255,255,0.4);white-space:nowrap;margin-left:8px;">${o(t.distance)}</span>`:""}
          </div>`).join("")}
        </div>
      </div>`:""}

      <!-- Description -->
      ${e.description?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <div id="proj-desc" style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${U(e.description)}</div>
        <button id="proj-desc-more" onclick="(function(){var d=document.getElementById('proj-desc');d.style.webkitLineClamp='unset';d.style.overflow='visible';d.style.display='block';document.getElementById('proj-desc-more').style.display='none';})()" style="background:none;border:none;color:rgba(255,255,255,0.45);font-size:12px;padding:4px 0 0;cursor:pointer;font-family:'Inter',sans-serif;">Read more</button>
      </div>`:""}

      <!-- Brochure download -->
      ${e.brochure_url?`
      <div style="margin-bottom:20px;">
        <a href="${r(e.brochure_url)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-decoration:none;box-sizing:border-box;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Brochure
        </a>
      </div>`:""}

    </div>

    <div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));position:sticky;bottom:0;background:#000;border-top:1px solid rgba(255,255,255,0.06);">
      <button onclick="openLead('${r(e.name)}')" style="flex:1;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Enquire</button>
      ${A?.whatsapp?`<a href="https://wa.me/${encodeURIComponent(A.whatsapp.replace(/[^0-9]/g,""))}?text=${encodeURIComponent("Hi, I'm interested in "+e.name+" \u2014 can you tell me more?")}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-decoration:none;">WhatsApp</a>`:""}
    </div>`,u>1){let t=document.getElementById("proj-gallery"),i=document.getElementById("proj-gallery-count");t&&i&&t.addEventListener("scroll",()=>{let x=Math.round(t.scrollLeft/t.clientWidth);i.textContent=`${x+1} / ${u}`},{passive:!0})}}export{V as openProjectDetail};
//# sourceMappingURL=project-detail-FKSNIOZZ.js.map
