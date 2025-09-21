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

  async function waitForData(timeoutMs = 10000, pollMs = 100){
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (Array.isArray(window.GALLERY_ITEMS)) return window.GALLERY_ITEMS;
      await new Promise(r => setTimeout(r, pollMs));
    }
    return window.GALLERY_ITEMS || [];
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

  // ENSURE STYLES: try link (cache-busted) -> blob stylesheet
  async function ensureStyles() {
    const gridEl = document.getElementById('grid');
    if (!gridEl) return;
    const looksApplied = () => getComputedStyle(gridEl).display === 'grid';

    // If already applied, bail
    if (looksApplied()) return;

    // 1) Try adding a cache-busted <link rel="stylesheet">
    try {
      await new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'gallery.css?v=' + Date.now();
        link.onload = resolve;
        link.onerror = () => reject(new Error('link load error'));
        document.head.appendChild(link);
      });
      if (looksApplied()) return;
    } catch (_) {
      // ignore and try blob fallback
    }

    // 2) Fetch CSS and attach as a Blob stylesheet (respects CSP style-src blob:)
    try {
      const resp = await fetch('gallery.css', { cache: 'no-store' });
      if (!resp.ok) throw new Error('gallery.css fetch failed: ' + resp.status);
      const cssText = await resp.text();
      const blob = new Blob([cssText], { type: 'text/css' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);

      // Give the browser a tick to apply
      await new Promise(r => setTimeout(r, 30));
      if (!looksApplied()) {
        console.warn('Gallery: stylesheet loaded but CSS still not applied. Check server CSP headers for style-src.');
      }
    } catch (err) {
      console.error('Gallery: failed to load CSS via blob stylesheet:', err);
    }
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

    const cap=d
