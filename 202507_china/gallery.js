/* Use data from separate file */
const items = window.GALLERY_ITEMS || [];

(function () {
  // Helpers for Google Drive
  function extractId(previewUrl){ const m=String(previewUrl).match(/\/d\/([^/]+)\/preview/); return m?m[1]:null; }
  const viewImg = (id)=>`https://drive.google.com/uc?export=view&id=${id}`;
  const thumb   = (id,w=1600)=>`https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
  const iframeSrc = (previewUrl)=>{ const u=new URL(previewUrl); u.searchParams.set('autoplay','1'); return u.toString(); };

  // DOM refs
  function getRefs(){
    return {
      grid: document.getElementById('grid'),
      counts: document.getElementById('counts'),
      q: document.getElementById('q'),
      lightbox: document.getElementById('lightbox'),
      closeBtn: document.getElementById('closeBtn'),
      lbBody: document.getElementById('lbBody'),
      lbCaption: document.getElementById('lbCaption'),
    };
  }

  function onReady(fn){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    } else {
      fn();
    }
  }

  function normalize(items){
    return items.map(it=>{
      const id = extractId(it.preview || '');
      if(!id) return null;
      const lower = String(it.name || '').toLowerCase();
      const kind = lower.endsWith('.mp4') ? 'video' : 'image';
      return { name: it.name || id, preview: it.preview, desc: it.desc || '', id, kind };
    }).filter(Boolean);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  // Card builders
  function makeImageCard(item, openLightboxImage){
    const card = document.createElement('article'); card.className='card';
    const btn  = document.createElement('button'); btn.className='media-btn'; btn.type='button';
    const img  = document.createElement('img');
    img.className='thumb'; img.loading='lazy'; img.decoding='async'; img.referrerPolicy='no-referrer';
    img.alt=item.name; img.src=viewImg(item.id);
    let triedThumb=false;
    img.onerror=()=>{ if(!triedThumb){ triedThumb=true; img.src=thumb(item.id,1600); } };
    btn.addEventListener('click',()=>openLightboxImage(item));
    btn.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openLightboxImage(item); } });
    btn.appendChild(img);

    const cap=document.createElement('div'); cap.className='caption';
    cap.innerHTML=`
      <div class="cap-top"><span class="name" title="${item.name}">${item.name}</span><span></span></div>
      ${item.desc ? `<div class="desc">${escapeHtml(item.desc)}</div>` : ''}`;
    card.appendChild(btn); card.appendChild(cap);
    return card;
  }

  function makeVideoCard(item, openLightboxVideo){
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

  function startApp(media){
    const { grid, counts, q, lightbox, closeBtn, lbBody, lbCaption } = getRefs();

    function render(list){
      grid.innerHTML='';
      for(const m of list){
        grid.appendChild(m.kind==='video'
          ? makeVideoCard(m, openLightboxVideo)
          : makeImageCard(m, openLightboxImage));
      }
      const imgs=list.filter(x=>x.kind==='image').length, vids=list.filter(x=>x.kind==='video').length;
      counts.textContent=`${list.length} items • ${imgs} images • ${vids} videos`;
    }

    // Search
    q.addEventListener('input',()=>{
      const term=q.value.trim().toLowerCase();
      render(term
        ? media.filter(m => m.name.toLowerCase().includes(term) || (m.desc||'').toLowerCase().includes(term))
        : media);
    });

    // Lightbox
    function captionHtml(item){
      const d = item.desc ? `<div>${escapeHtml(item.desc)}</div>` : '';
      return `<div><strong>${escapeHtml(item.name)}</strong></div>${d}<div class="lb-meta">${item.kind==='video'?'Video':'Image'}</div>`;
    }

    function clearLightbox(){ lbBody.innerHTML=''; lbCaption.textContent=''; }

    function openLightboxImage(item){
      clearLightbox();
      const frame = document.createElement('iframe');
      frame.className = 'frame';
      frame.allow = 'fullscreen; picture-in-picture';
      frame.referrerPolicy = 'no-referrer';
      frame.src = item.preview; // Drive preview page
      lbBody.appendChild(frame);
      lbCaption.innerHTML = captionHtml(item);
      document.body.classList.add('no-scroll');
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
      document.body.classList.add('no-scroll');
      lightbox.classList.add('open');
    }

    function closeLightbox(){
      lightbox.classList.remove('open');
      document.body.classList.remove('no-scroll');
      const frame=lbBody.querySelector('iframe'); if(frame) frame.src='about:blank';
      const img=lbBody.querySelector('img'); if(img) img.removeAttribute('src');
      clearLightbox();
    }

    closeBtn.addEventListener('click',closeLightbox);
    lightbox.addEventListener('click',(e)=>{ if(e.target===lightbox) closeLightbox(); });
    window.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeLightbox(); });

    // Initial render
    render(media);
  }

  function showNoDataMessage(){
    const { grid, counts } = getRefs();
    counts.textContent = '0 items';
    const msg = document.createElement('div');
    msg.style.cssText = 'padding:12px;border:1px solid #374151;border-radius:12px;background:#111827;color:#e5e7eb';
    msg.innerHTML = 'No gallery items loaded.<br>' +
      'Make sure <code>media-data.js</code> is in the same folder and included <strong>before</strong> <code>gallery.js</code>.';
    grid.innerHTML = '';
    grid.appendChild(msg);
  }

  onReady(()=>{
    try{
      const media = normalize(items);
      if (!media.length) { showNoDataMessage(); return; }
      startApp(media);
    } catch (e){
      console.error('Gallery init error:', e);
      showNoDataMessage();
    }
  });
})();
