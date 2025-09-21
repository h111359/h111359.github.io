/* ----- CONFIG: edit only this items list ----- */
const items = window.GALLERY_ITEMS || [];
/* -------------------------------------------- */

(function () {
  // Helpers for Google Drive
  function extractId(previewUrl){ const m=String(previewUrl).match(/\/d\/([^/]+)\/preview/); return m?m[1]:null; }
  const viewImg = (id)=>`https://drive.google.com/uc?export=view&id=${id}`;
  const thumb   = (id,w=1600)=>`https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
  const iframeSrc = (previewUrl)=>{ const u=new URL(previewUrl); u.searchParams.set('autoplay','1'); return u.toString(); };

  // Normalize items
  const media = items.map(it=>{
    const id = extractId(it.preview);
    const lower = it.name.toLowerCase();
    const kind = lower.endsWith('.mp4') ? 'video' : 'image';
    return id ? { ...it, id, kind } : null;
  }).filter(Boolean);

  // DOM refs
  const grid   = document.getElementById('grid');
  const counts = document.getElementById('counts');
  const q      = document.getElementById('q');

  // Card builders
  function makeImageCard(item){
    const card = document.createElement('article'); card.className='card';
    const btn  = document.createElement('button'); btn.className='media-btn'; btn.type='button';
    const img  = document.createElement('img');
    img.className='thumb'; img.loading='lazy'; img.decoding='async'; img.referrerPolicy='no-referrer';
    img.alt=item.name; img.src=viewImg(item.id);
    let triedThumb=false;
    img.onerror=()=>{ if(!triedThumb){ triedThumb=true; img.src=thumb(item.id,1600); } };

    btn.addEventListener('click',()=>openLightboxImage(item));
    btn.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openLightboxImage(item); } });
    btn.appendChild(img);

    const cap=document.createElement('div'); cap.className='caption';
    cap.innerHTML=`
      <div class="cap-top"><span class="name" title="${item.name}">${item.name}</span><span></span></div>
      ${item.desc ? `<div class="desc">${escapeHtml(item.desc)}</div>` : ''}`;
    card.appendChild(btn); card.appendChild(cap);
    return card;
  }

  function makeVideoCard(item){
    const card=document.createElement('article'); card.className='card';
    const btn=document.createElement('button'); btn.className='media-btn'; btn.type='button';
    const wrap=document.createElement('div'); wrap.className='video-wrap';
    const poster=document.createElement('img');
    poster.className='poster'; poster.loading='lazy'; poster.decoding='async'; poster.referrerPolicy='no-referrer';
    poster.alt=item.name+' (video)'; poster.src=thumb(item.id,1600);
    const play=document.createElement('div'); play.className='play';
    play.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" opacity=".7"></circle><polygon points="10,8 16,12 10,16" fill="#e5e7eb"></polygon></svg>`;
    btn.addEventListener('click',()=>openLightboxVideo(item.preview, item));
    btn.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openLightboxVideo(item.preview, item); } });
    wrap.appendChild(poster); wrap.appendChild(play); btn.appendChild(wrap);

    const cap=document.createElement('div'); cap.className='caption';
    cap.innerHTML=`
      <div class="cap-top"><span class="name" title="${item.name}">${item.name}</span><span></span></div>
      ${item.desc ? `<div class="desc">${escapeHtml(item.desc)}</div>` : ''}`;
    card.appendChild(btn); card.appendChild(cap);
    return card;
  }

  function render(list){
    grid.innerHTML='';
    for(const m of list){ grid.appendChild(m.kind==='video'?makeVideoCard(m):makeImageCard(m)); }
    const imgs=list.filter(x=>x.kind==='image').length, vids=list.filter(x=>x.kind==='video').length;
    counts.textContent=`${list.length} items • ${imgs} images • ${vids} videos`;
  }

  q.addEventListener('input',()=>{
    const term=q.value.trim().toLowerCase();
    render(term?media.filter(m=>(m.name.toLowerCase().includes(term) || (m.desc||'').toLowerCase().includes(term))):media);
  });

  // Lightbox logic
  const lightbox = document.getElementById('lightbox');
  const closeBtn = document.getElementById('closeBtn');
  const lbBody   = document.getElementById('lbBody');
  const lbCaption= document.getElementById('lbCaption');

function openLightboxImage(item){
  clearLightbox();
  const frame = document.createElement('iframe');
  frame.className = 'frame';
  frame.allow = 'fullscreen; picture-in-picture';
  frame.referrerPolicy = 'no-referrer';
  // Use Drive's preview page inside the lightbox (works even when direct image fetch is blocked)
  frame.src = item.preview;
  lbBody.appendChild(frame);
  lbCaption.innerHTML = captionHtml(item);
  lightbox.classList.add('open');
}

  function openLightboxVideo(previewUrl, item){
    clearLightbox();
    const frame=document.createElement('iframe');
    frame.className='frame';
    frame.allow='autoplay; fullscreen; picture-in-picture';
    frame.referrerPolicy='no-referrer';
    frame.src=iframeSrc(previewUrl);
    lbBody.appendChild(frame);
    lbCaption.innerHTML = captionHtml(item);
    lightbox.classList.add('open');
  }

  function captionHtml(item){
    const d = item.desc ? `<div>${escapeHtml(item.desc)}</div>` : '';
    return `<div><strong>${escapeHtml(item.name)}</strong></div>${d}<div class="lb-meta">${item.kind==='video'?'Video':'Image'}</div>`;
  }

  function showFallback(message){
    const fb=document.createElement('div');
    fb.className='lb-fallback';
    fb.innerHTML = message;
    lbBody.innerHTML=''; lbBody.appendChild(fb);
  }

  function clearLightbox(){
    lbBody.innerHTML=''; lbCaption.textContent='';
  }

  function closeLightbox(){
    lightbox.classList.remove('open');
    const frame=lbBody.querySelector('iframe'); if(frame) frame.src='about:blank';
    const img=lbBody.querySelector('img'); if(img) img.removeAttribute('src');
    clearLightbox();
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  closeBtn.addEventListener('click',closeLightbox);
  lightbox.addEventListener('click',(e)=>{ if(e.target===lightbox) closeLightbox(); });
  window.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeLightbox(); });

  // Init after DOM is ready (defer ensures this has DOM)
  render(media);
})();
