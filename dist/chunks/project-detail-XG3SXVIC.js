import{a as o,b as i}from"./chunk-HD4TFP6T.js";import{a as A}from"./chunk-ZUJQAZHO.js";import{f as M}from"./chunk-OO245FJT.js";var y=(n,c)=>n?`/.netlify/images?url=${encodeURIComponent(n)}&w=${c}&fm=webp&q=80`:"",I=n=>n?"AED\xA0"+Number(n).toLocaleString("en-AE",{maximumFractionDigits:0}):null,B=n=>n==="under_construction"?"Under Construction":n==="completed"?"Completed":"Off Plan";async function U(n){let c=document.getElementById("detail-sheet"),j=document.getElementById("detail-overlay");if(!c||!j)return;c.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project\u2026</div>`,j.classList.add("open"),document.body.style.overflow="hidden";let{data:e,error:C}=await M.from("projects").select("slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,status,property_types,beds,developers(name,logo_url,website)").eq("slug",n).single();if(C||!e){c.innerHTML=`
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;return}let a=e.developers||{},b=e.cover_image_url?y(e.cover_image_url,800):"",v=I(e.min_price),u=I(e.max_price),L=v&&u?`${v} \u2013 ${u}`:v||u||"",P=e.district_name||e.location||e.area||"",h=Array.isArray(e.property_types)&&e.property_types.length?e.property_types.join(", "):"",_=e.min_area_sqft&&e.max_area_sqft?`${Number(e.min_area_sqft).toLocaleString()} \u2013 ${Number(e.max_area_sqft).toLocaleString()} sqft`:e.min_area_sqft?`From ${Number(e.min_area_sqft).toLocaleString()} sqft`:"",$=Array.isArray(e.floor_plan_urls)&&e.floor_plan_urls.length?e.floor_plan_urls.filter(Boolean):[],w=Array.isArray(e.gallery_images)&&e.gallery_images.length?e.gallery_images.filter(t=>t&&t!==e.cover_image_url&&!$.includes(t)):[],f=(b?1:0)+w.length,E=e.available_units&&typeof e.available_units=="object"?Array.isArray(e.available_units)?e.available_units:e.available_units.units||[]:[],l=null,g=null,s=null,D=null,q=null,k=e.payment_plan_detail,p=Array.isArray(k)&&k.length>0?k[0]:null;if(p&&typeof p=="object"){D=p.title||null,q=Array.isArray(p.milestones)&&p.milestones.length?p.milestones:null;let t=p.heading_percentages;if(t&&typeof t=="object")for(let[r,x]of Object.entries(t)){let d=r.toLowerCase(),m=x?parseInt(String(x),10):null;d.includes("booking")?l=m:d.includes("construction")?g=m:(d.includes("completion")||d.includes("handover"))&&(s=m)}}else{let t=e.payment_plan;t&&typeof t=="object"&&!Array.isArray(t)?(l=t.booking??t.booking_percentage??null,g=t.construction??t.construction_percentage??null,s=t.handover??t.handover_percentage??null):e.handover_percentage!=null&&(s=e.handover_percentage,l=10,g=Math.max(0,100-l-s))}let S=l!=null||g!=null||s!=null,z=e.completion_date?new Date(e.completion_date).toLocaleDateString("en-AE",{month:"long",year:"numeric"}):null;if(c.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${b||w.length?`
    <div style="position:relative;flex-shrink:0;">
      <div id="proj-gallery" style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
        ${b?`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${i(b)}" alt="${i(e.name)}" style="width:100%;height:240px;object-fit:cover;" loading="eager" onerror="handleImgError(this)"></div>`:""}
        ${w.map((t,r)=>`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${i(y(t,800))}" alt="${i(e.name)} photo ${r+2}" style="width:100%;height:240px;object-fit:cover;" loading="lazy" onerror="handleImgError(this)"></div>`).join("")}
      </div>
      ${f>1?`<div id="proj-gallery-count" style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;pointer-events:none;">1 / ${f}</div>`:""}
    </div>`:""}

    <div class="detail-body" style="padding:20px 20px 80px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${o(B(e.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${o(e.name)}</h2>
        ${P?`<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">\u{1F4CD} ${o(P)}</div>`:""}
      </div>

      <!-- Price -->
      ${L?`<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${o(L)}</div>`:""}

      <!-- Specs row -->
      ${h||e.beds||_||z?`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${h?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${o(h)}</span></div>`:""}
        ${e.beds?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${o(e.beds)}</span></div>`:""}
        ${_?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${o(_)}</span></div>`:""}
        ${z?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${o(z)}</span></div>`:""}
      </div>`:""}

      <!-- Developer card -->
      ${a.name?`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${a.logo_url?`<img src="${i(y(a.logo_url,80))}" alt="${i(a.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">`:'<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">\u{1F3D7}\uFE0F</div>'}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${o(a.name)}</div>
          ${a.website?`<a href="${i(a.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${o(a.website.replace(/^https?:\/\//,""))}</a>`:""}
        </div>
      </div>`:""}

      <!-- Payment plan -->
      ${S?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${l!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${l}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>`:""}
          ${g!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${g}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>`:""}
          ${s!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${s}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>`:""}
        </div>
      </div>`:`
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Payment Plan</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);">Contact the agent for full payment plan details.</div>
      </div>`}

      <!-- Available units -->
      ${E.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${E.map(t=>{let x=(t.bedroom?`${t.bedroom}BR `:"")+(t.property_types||"Unit"),d=t.lowest_area||t.area_sqft||t.area,m=t.lowest_price||t.price||t.min_price;return`
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <div style="font-size:13px;font-weight:600;">${o(x)}</div>
              ${m?`<div style="font-size:13px;font-weight:700;white-space:nowrap;">AED\xA0${Number(m).toLocaleString("en-AE",{maximumFractionDigits:0})}</div>`:""}
            </div>
            ${d?`<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">From ${o(Number(d).toLocaleString("en-AE",{maximumFractionDigits:0}))} sqft</div>`:""}
          </div>`}).join("")}
        </div>
      </div>`:""}

      <!-- Floor plans -->
      ${$.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Floor Plans</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${$.map((t,r)=>`<img src="${i(y(t,800))}" alt="Floor plan ${r+1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join("")}
        </div>
      </div>`:""}

      <!-- Description -->
      ${e.description?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <p style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);">${o(e.description)}</p>
      </div>`:""}

    </div>

    <div style="display:flex;gap:12px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));position:sticky;bottom:0;background:#000;border-top:1px solid rgba(255,255,255,0.06);">
      <button onclick="openLead('${i(e.name)}')" style="flex:1;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Enquire</button>
      ${A?.whatsapp?`<a href="https://wa.me/${encodeURIComponent(A.whatsapp.replace(/[^0-9]/g,""))}?text=${encodeURIComponent("Hi, I'm interested in "+e.name+" \u2014 can you tell me more?")}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-decoration:none;">WhatsApp</a>`:""}
    </div>`,f>1){let t=document.getElementById("proj-gallery"),r=document.getElementById("proj-gallery-count");t&&r&&t.addEventListener("scroll",()=>{let x=Math.round(t.scrollLeft/t.clientWidth);r.textContent=`${x+1} / ${f}`},{passive:!0})}}export{U as openProjectDetail};
//# sourceMappingURL=project-detail-XG3SXVIC.js.map
