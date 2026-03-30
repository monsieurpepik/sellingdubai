import{a as i,b as n}from"./chunk-HD4TFP6T.js";import{a as u}from"./chunk-ZUJQAZHO.js";import{f as A}from"./chunk-OO245FJT.js";var g=(o,l)=>o?`/.netlify/images?url=${encodeURIComponent(o)}&w=${l}&fm=webp&q=80`:"",P=o=>o?"AED\xA0"+Number(o).toLocaleString("en-AE",{maximumFractionDigits:0}):null,M=o=>o==="under_construction"?"Under Construction":o==="completed"?"Completed":"Off Plan";async function L(o){let l=document.getElementById("detail-sheet"),h=document.getElementById("detail-overlay");if(!l||!h)return;l.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project\u2026</div>`,h.classList.add("open"),document.body.style.overflow="hidden";let{data:e,error:j}=await A.from("projects").select("slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,status,property_types,beds,developers(name,logo_url,website)").eq("slug",o).single();if(j||!e){l.innerHTML=`
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;return}let r=e.developers||{},c=e.cover_image_url?g(e.cover_image_url,800):"",x=P(e.min_price),m=P(e.max_price),_=x&&m?`${x} \u2013 ${m}`:x||m||"",w=e.district_name||e.location||e.area||"",b=Array.isArray(e.property_types)&&e.property_types.length?e.property_types.join(", "):"",f=e.min_area_sqft&&e.max_area_sqft?`${Number(e.min_area_sqft).toLocaleString()} \u2013 ${Number(e.max_area_sqft).toLocaleString()} sqft`:e.min_area_sqft?`From ${Number(e.min_area_sqft).toLocaleString()} sqft`:"",$=Array.isArray(e.gallery_images)&&e.gallery_images.length?e.gallery_images.filter(t=>t&&t!==e.cover_image_url):[],k=Array.isArray(e.floor_plan_urls)&&e.floor_plan_urls.length?e.floor_plan_urls.filter(Boolean):[],z=e.available_units&&typeof e.available_units=="object"?Array.isArray(e.available_units)?e.available_units:e.available_units.units||[]:[],s=null,d=null,p=null,a=e.payment_plan_detail||e.payment_plan;a&&typeof a=="object"&&!Array.isArray(a)?(s=a.booking??a.booking_percentage??null,d=a.construction??a.construction_percentage??null,p=a.handover??a.handover_percentage??null):e.handover_percentage!=null&&(p=e.handover_percentage,s=10,d=Math.max(0,100-s-p));let q=s!=null||d!=null||p!=null,y=e.completion_date?new Date(e.completion_date).toLocaleDateString("en-AE",{month:"long",year:"numeric"}):null;l.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${c||$.length?`
    <div style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;flex-shrink:0;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
      ${c?`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${n(c)}" alt="${n(e.name)}" style="width:100%;height:240px;object-fit:cover;" loading="eager" onerror="handleImgError(this)"></div>`:""}
      ${$.map((t,v)=>`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${n(g(t,800))}" alt="${n(e.name)} photo ${v+2}" style="width:100%;height:240px;object-fit:cover;" loading="lazy" onerror="handleImgError(this)"></div>`).join("")}
    </div>`:""}

    <div class="detail-body" style="padding:20px 20px 40px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${i(M(e.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${i(e.name)}</h2>
        ${w?`<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">\u{1F4CD} ${i(w)}</div>`:""}
      </div>

      <!-- Price -->
      ${_?`<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${i(_)}</div>`:""}

      <!-- Specs row -->
      ${b||e.beds||f||y?`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${b?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${i(b)}</span></div>`:""}
        ${e.beds?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${i(e.beds)}</span></div>`:""}
        ${f?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${i(f)}</span></div>`:""}
        ${y?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${i(y)}</span></div>`:""}
      </div>`:""}

      <!-- Developer card -->
      ${r.name?`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${r.logo_url?`<img src="${n(g(r.logo_url,80))}" alt="${n(r.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">`:'<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">\u{1F3D7}\uFE0F</div>'}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${i(r.name)}</div>
          ${r.website?`<a href="${n(r.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${i(r.website.replace(/^https?:\/\//,""))}</a>`:""}
        </div>
      </div>`:""}

      <!-- Payment plan -->
      ${q?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${s!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${s}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>`:""}
          ${d!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${d}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>`:""}
          ${p!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${p}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>`:""}
        </div>
      </div>`:`
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Payment Plan</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);">Contact the agent for full payment plan details.</div>
      </div>`}

      <!-- Available units -->
      ${z.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${z.map(t=>`
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:600;">${i(t.unit_type||t.type||t.name||"Unit")}</div>
              ${t.area_sqft||t.area?`<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px;">${i(String(t.area_sqft||t.area))} sqft</div>`:""}
            </div>
            ${t.price||t.min_price?`<div style="font-size:13px;font-weight:700;">AED\xA0${Number(t.price||t.min_price).toLocaleString("en-AE",{maximumFractionDigits:0})}</div>`:""}
          </div>`).join("")}
        </div>
      </div>`:""}

      <!-- Floor plans -->
      ${k.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Floor Plans</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${k.map((t,v)=>`<img src="${n(g(t,800))}" alt="Floor plan ${v+1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join("")}
        </div>
      </div>`:""}

      <!-- Description -->
      ${e.description?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <p style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);">${i(e.description)}</p>
      </div>`:""}

      <!-- CTAs -->
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
        <button onclick="openLead('${n(e.name)}')" style="width:100%;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Send Enquiry</button>
        ${u?.whatsapp?`<a href="https://wa.me/${encodeURIComponent(u.whatsapp.replace(/[^0-9]/g,""))}?text=${encodeURIComponent("Hi, I'm interested in "+e.name+" \u2014 can you tell me more?")}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-align:center;text-decoration:none;">WhatsApp Agent</a>`:""}
      </div>

    </div>`}export{L as openProjectDetail};
//# sourceMappingURL=project-detail-MFZWHGWE.js.map
