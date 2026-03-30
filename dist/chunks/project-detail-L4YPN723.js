import{a as t,b as i}from"./chunk-HD4TFP6T.js";import{a as m}from"./chunk-ZUJQAZHO.js";import{f as v}from"./chunk-OO245FJT.js";var h=(n,a)=>n?`/.netlify/images?url=${encodeURIComponent(n)}&w=${a}&fm=webp&q=80`:"",_=n=>n?"AED\xA0"+Number(n).toLocaleString("en-AE",{maximumFractionDigits:0}):null,k=n=>n==="under_construction"?"Under Construction":n==="completed"?"Completed":"Off Plan";async function C(n){let a=document.getElementById("detail-sheet"),b=document.getElementById("detail-overlay");if(!a||!b)return;a.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project\u2026</div>`,b.classList.add("open"),document.body.style.overflow="hidden";let{data:e,error:w}=await v.from("projects").select("slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,status,property_types,beds,developers(name,logo_url,website)").eq("slug",n).single();if(w||!e){a.innerHTML=`
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;return}let o=e.developers||{},f=e.cover_image_url?h(e.cover_image_url,800):"",p=_(e.min_price),d=_(e.max_price),y=p&&d?`${p} \u2013 ${d}`:p||d||"",u=e.district_name||e.location||e.area||"",g=Array.isArray(e.property_types)&&e.property_types.length?e.property_types.join(", "):"",c=e.min_area_sqft&&e.max_area_sqft?`${Number(e.min_area_sqft).toLocaleString()} \u2013 ${Number(e.max_area_sqft).toLocaleString()} sqft`:e.min_area_sqft?`From ${Number(e.min_area_sqft).toLocaleString()} sqft`:"",r=null,l=null,s=null;e.payment_plan&&typeof e.payment_plan=="object"?(r=e.payment_plan.booking??e.payment_plan.booking_percentage??null,l=e.payment_plan.construction??e.payment_plan.construction_percentage??null,s=e.payment_plan.handover??e.payment_plan.handover_percentage??null):e.handover_percentage!=null&&(s=e.handover_percentage,r=10,l=Math.max(0,100-r-s));let $=r!=null||l!=null||s!=null,x=e.completion_date?new Date(e.completion_date).toLocaleDateString("en-AE",{month:"long",year:"numeric"}):null;a.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${f?`<div style="height:240px;overflow:hidden;background:#111;flex-shrink:0;"><img src="${i(f)}" alt="${i(e.name)}" style="width:100%;height:100%;object-fit:cover;" loading="eager" onerror="handleImgError(this)"></div>`:""}

    <div class="detail-body" style="padding:20px 20px 40px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${t(k(e.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${t(e.name)}</h2>
        ${u?`<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">\u{1F4CD} ${t(u)}</div>`:""}
      </div>

      <!-- Price -->
      ${y?`<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${t(y)}</div>`:""}

      <!-- Specs row -->
      ${g||e.beds||c||x?`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${g?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${t(g)}</span></div>`:""}
        ${e.beds?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${t(e.beds)}</span></div>`:""}
        ${c?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${t(c)}</span></div>`:""}
        ${x?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${t(x)}</span></div>`:""}
      </div>`:""}

      <!-- Developer card -->
      ${o.name?`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${o.logo_url?`<img src="${i(h(o.logo_url,80))}" alt="${i(o.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">`:'<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">\u{1F3D7}\uFE0F</div>'}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${t(o.name)}</div>
          ${o.website?`<a href="${i(o.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${t(o.website.replace(/^https?:\/\//,""))}</a>`:""}
        </div>
      </div>`:""}

      <!-- Payment plan -->
      ${$?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${r!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${r}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>`:""}
          ${l!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${l}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>`:""}
          ${s!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${s}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>`:""}
        </div>
      </div>`:`
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Payment Plan</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);">Contact the agent for full payment plan details.</div>
      </div>`}

      <!-- Description -->
      ${e.description?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <p style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);">${t(e.description)}</p>
      </div>`:""}

      <!-- CTAs -->
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
        <button onclick="openLead('${i(e.name)}')" style="width:100%;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Send Enquiry</button>
        ${m?.whatsapp?`<a href="https://wa.me/${encodeURIComponent(m.whatsapp.replace(/[^0-9]/g,""))}?text=${encodeURIComponent("Hi, I'm interested in "+e.name+" \u2014 can you tell me more?")}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-align:center;text-decoration:none;">WhatsApp Agent</a>`:""}
      </div>

    </div>`}export{C as openProjectDetail};
//# sourceMappingURL=project-detail-L4YPN723.js.map
