import{a as i,b as o}from"./chunk-HD4TFP6T.js";import{a as w}from"./chunk-ZUJQAZHO.js";import{f as q}from"./chunk-OO245FJT.js";var m=(n,p)=>n?`/.netlify/images?url=${encodeURIComponent(n)}&w=${p}&fm=webp&q=80`:"",C=n=>n?"AED\xA0"+Number(n).toLocaleString("en-AE",{maximumFractionDigits:0}):null,E=n=>n==="under_construction"?"Under Construction":n==="completed"?"Completed":"Off Plan";async function T(n){let p=document.getElementById("detail-sheet"),$=document.getElementById("detail-overlay");if(!p||!$)return;p.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project\u2026</div>`,$.classList.add("open"),document.body.style.overflow="hidden";let{data:e,error:D}=await q.from("projects").select("slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,status,property_types,beds,developers(name,logo_url,website)").eq("slug",n).single();if(D||!e){p.innerHTML=`
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;return}let a=e.developers||{},x=e.cover_image_url?m(e.cover_image_url,800):"",b=C(e.min_price),f=C(e.max_price),k=b&&f?`${b} \u2013 ${f}`:b||f||"",z=e.district_name||e.location||e.area||"",y=Array.isArray(e.property_types)&&e.property_types.length?e.property_types.join(", "):"",v=e.min_area_sqft&&e.max_area_sqft?`${Number(e.min_area_sqft).toLocaleString()} \u2013 ${Number(e.max_area_sqft).toLocaleString()} sqft`:e.min_area_sqft?`From ${Number(e.min_area_sqft).toLocaleString()} sqft`:"",A=Array.isArray(e.gallery_images)&&e.gallery_images.length?e.gallery_images.filter(t=>t&&t!==e.cover_image_url):[],P=Array.isArray(e.floor_plan_urls)&&e.floor_plan_urls.length?e.floor_plan_urls.filter(Boolean):[],j=e.available_units&&typeof e.available_units=="object"?Array.isArray(e.available_units)?e.available_units:e.available_units.units||[]:[],r=null,d=null,l=null,I=null,L=null,u=e.payment_plan_detail,s=Array.isArray(u)&&u.length>0?u[0]:null;if(s&&typeof s=="object"){I=s.title||null,L=Array.isArray(s.milestones)&&s.milestones.length?s.milestones:null;let t=s.heading_percentages;if(t&&typeof t=="object")for(let[g,M]of Object.entries(t)){let c=g.toLowerCase(),_=M?parseInt(String(M),10):null;c.includes("booking")?r=_:c.includes("construction")?d=_:(c.includes("completion")||c.includes("handover"))&&(l=_)}}else{let t=e.payment_plan;t&&typeof t=="object"&&!Array.isArray(t)?(r=t.booking??t.booking_percentage??null,d=t.construction??t.construction_percentage??null,l=t.handover??t.handover_percentage??null):e.handover_percentage!=null&&(l=e.handover_percentage,r=10,d=Math.max(0,100-r-l))}let S=r!=null||d!=null||l!=null,h=e.completion_date?new Date(e.completion_date).toLocaleDateString("en-AE",{month:"long",year:"numeric"}):null;p.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${x||A.length?`
    <div style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;flex-shrink:0;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
      ${x?`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${o(x)}" alt="${o(e.name)}" style="width:100%;height:240px;object-fit:cover;" loading="eager" onerror="handleImgError(this)"></div>`:""}
      ${A.map((t,g)=>`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${o(m(t,800))}" alt="${o(e.name)} photo ${g+2}" style="width:100%;height:240px;object-fit:cover;" loading="lazy" onerror="handleImgError(this)"></div>`).join("")}
    </div>`:""}

    <div class="detail-body" style="padding:20px 20px 40px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${i(E(e.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${i(e.name)}</h2>
        ${z?`<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">\u{1F4CD} ${i(z)}</div>`:""}
      </div>

      <!-- Price -->
      ${k?`<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${i(k)}</div>`:""}

      <!-- Specs row -->
      ${y||e.beds||v||h?`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${y?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${i(y)}</span></div>`:""}
        ${e.beds?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${i(e.beds)}</span></div>`:""}
        ${v?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${i(v)}</span></div>`:""}
        ${h?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${i(h)}</span></div>`:""}
      </div>`:""}

      <!-- Developer card -->
      ${a.name?`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${a.logo_url?`<img src="${o(m(a.logo_url,80))}" alt="${o(a.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">`:'<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">\u{1F3D7}\uFE0F</div>'}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${i(a.name)}</div>
          ${a.website?`<a href="${o(a.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${i(a.website.replace(/^https?:\/\//,""))}</a>`:""}
        </div>
      </div>`:""}

      <!-- Payment plan -->
      ${S?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${r!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${r}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>`:""}
          ${d!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${d}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>`:""}
          ${l!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${l}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>`:""}
        </div>
      </div>`:`
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Payment Plan</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);">Contact the agent for full payment plan details.</div>
      </div>`}

      <!-- Available units -->
      ${j.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${j.map(t=>`
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
      ${P.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Floor Plans</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${P.map((t,g)=>`<img src="${o(m(t,800))}" alt="Floor plan ${g+1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join("")}
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
        <button onclick="openLead('${o(e.name)}')" style="width:100%;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Send Enquiry</button>
        ${w?.whatsapp?`<a href="https://wa.me/${encodeURIComponent(w.whatsapp.replace(/[^0-9]/g,""))}?text=${encodeURIComponent("Hi, I'm interested in "+e.name+" \u2014 can you tell me more?")}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-align:center;text-decoration:none;">WhatsApp Agent</a>`:""}
      </div>

    </div>`}export{T as openProjectDetail};
//# sourceMappingURL=project-detail-UJMUPH3P.js.map
