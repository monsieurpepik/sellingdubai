import{a as o,b as n}from"./chunk-HD4TFP6T.js";import{a as k}from"./chunk-ZUJQAZHO.js";import{f as M}from"./chunk-OO245FJT.js";var b=(i,d)=>i?`/.netlify/images?url=${encodeURIComponent(i)}&w=${d}&fm=webp&q=80`:"",C=i=>i?"AED\xA0"+Number(i).toLocaleString("en-AE",{maximumFractionDigits:0}):null,E=i=>i==="under_construction"?"Under Construction":i==="completed"?"Completed":"Off Plan";async function N(i){let d=document.getElementById("detail-sheet"),z=document.getElementById("detail-overlay");if(!d||!z)return;d.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project\u2026</div>`,z.classList.add("open"),document.body.style.overflow="hidden";let{data:e,error:D}=await M.from("projects").select("slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,status,property_types,beds,developers(name,logo_url,website)").eq("slug",i).single();if(D||!e){d.innerHTML=`
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;return}let a=e.developers||{},f=e.cover_image_url?b(e.cover_image_url,800):"",y=C(e.min_price),v=C(e.max_price),A=y&&v?`${y} \u2013 ${v}`:y||v||"",P=e.district_name||e.location||e.area||"",u=Array.isArray(e.property_types)&&e.property_types.length?e.property_types.join(", "):"",h=e.min_area_sqft&&e.max_area_sqft?`${Number(e.min_area_sqft).toLocaleString()} \u2013 ${Number(e.max_area_sqft).toLocaleString()} sqft`:e.min_area_sqft?`From ${Number(e.min_area_sqft).toLocaleString()} sqft`:"",_=Array.isArray(e.floor_plan_urls)&&e.floor_plan_urls.length?e.floor_plan_urls.filter(Boolean):[],j=Array.isArray(e.gallery_images)&&e.gallery_images.length?e.gallery_images.filter(t=>t&&t!==e.cover_image_url&&!_.includes(t)):[],L=e.available_units&&typeof e.available_units=="object"?Array.isArray(e.available_units)?e.available_units:e.available_units.units||[]:[],r=null,g=null,l=null,q=null,I=null,w=e.payment_plan_detail,s=Array.isArray(w)&&w.length>0?w[0]:null;if(s&&typeof s=="object"){q=s.title||null,I=Array.isArray(s.milestones)&&s.milestones.length?s.milestones:null;let t=s.heading_percentages;if(t&&typeof t=="object")for(let[c,x]of Object.entries(t)){let p=c.toLowerCase(),m=x?parseInt(String(x),10):null;p.includes("booking")?r=m:p.includes("construction")?g=m:(p.includes("completion")||p.includes("handover"))&&(l=m)}}else{let t=e.payment_plan;t&&typeof t=="object"&&!Array.isArray(t)?(r=t.booking??t.booking_percentage??null,g=t.construction??t.construction_percentage??null,l=t.handover??t.handover_percentage??null):e.handover_percentage!=null&&(l=e.handover_percentage,r=10,g=Math.max(0,100-r-l))}let S=r!=null||g!=null||l!=null,$=e.completion_date?new Date(e.completion_date).toLocaleDateString("en-AE",{month:"long",year:"numeric"}):null;d.innerHTML=`
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${f||j.length?`
    <div style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;flex-shrink:0;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
      ${f?`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${n(f)}" alt="${n(e.name)}" style="width:100%;height:240px;object-fit:cover;" loading="eager" onerror="handleImgError(this)"></div>`:""}
      ${j.map((t,c)=>`<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${n(b(t,800))}" alt="${n(e.name)} photo ${c+2}" style="width:100%;height:240px;object-fit:cover;" loading="lazy" onerror="handleImgError(this)"></div>`).join("")}
    </div>`:""}

    <div class="detail-body" style="padding:20px 20px 40px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${o(E(e.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${o(e.name)}</h2>
        ${P?`<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">\u{1F4CD} ${o(P)}</div>`:""}
      </div>

      <!-- Price -->
      ${A?`<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${o(A)}</div>`:""}

      <!-- Specs row -->
      ${u||e.beds||h||$?`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${u?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${o(u)}</span></div>`:""}
        ${e.beds?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${o(e.beds)}</span></div>`:""}
        ${h?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${o(h)}</span></div>`:""}
        ${$?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${o($)}</span></div>`:""}
      </div>`:""}

      <!-- Developer card -->
      ${a.name?`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${a.logo_url?`<img src="${n(b(a.logo_url,80))}" alt="${n(a.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">`:'<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">\u{1F3D7}\uFE0F</div>'}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${o(a.name)}</div>
          ${a.website?`<a href="${n(a.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${o(a.website.replace(/^https?:\/\//,""))}</a>`:""}
        </div>
      </div>`:""}

      <!-- Payment plan -->
      ${S?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${r!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${r}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>`:""}
          ${g!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${g}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>`:""}
          ${l!=null?`<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${l}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>`:""}
        </div>
      </div>`:`
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Payment Plan</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);">Contact the agent for full payment plan details.</div>
      </div>`}

      <!-- Available units -->
      ${L.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${L.map(t=>{let x=(t.bedroom?`${t.bedroom}BR `:"")+(t.property_types||"Unit"),p=t.lowest_area||t.area_sqft||t.area,m=t.lowest_price||t.price||t.min_price;return`
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <div style="font-size:13px;font-weight:600;">${o(x)}</div>
              ${m?`<div style="font-size:13px;font-weight:700;white-space:nowrap;">AED\xA0${Number(m).toLocaleString("en-AE",{maximumFractionDigits:0})}</div>`:""}
            </div>
            ${p?`<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">From ${o(Number(p).toLocaleString("en-AE",{maximumFractionDigits:0}))} sqft</div>`:""}
          </div>`}).join("")}
        </div>
      </div>`:""}

      <!-- Floor plans -->
      ${_.length?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Floor Plans</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${_.map((t,c)=>`<img src="${n(b(t,800))}" alt="Floor plan ${c+1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join("")}
        </div>
      </div>`:""}

      <!-- Description -->
      ${e.description?`
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <p style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);">${o(e.description)}</p>
      </div>`:""}

      <!-- CTAs -->
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
        <button onclick="openLead('${n(e.name)}')" style="width:100%;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Send Enquiry</button>
        ${k?.whatsapp?`<a href="https://wa.me/${encodeURIComponent(k.whatsapp.replace(/[^0-9]/g,""))}?text=${encodeURIComponent("Hi, I'm interested in "+e.name+" \u2014 can you tell me more?")}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-align:center;text-decoration:none;">WhatsApp Agent</a>`:""}
      </div>

    </div>`}export{N as openProjectDetail};
//# sourceMappingURL=project-detail-6JEWRFAE.js.map
