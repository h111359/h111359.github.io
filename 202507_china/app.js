/* app.js — Multi-event gallery
   Expects:
   - window.GALLERY_EVENT_INDEX from data/events.js
   - Per-event files (data/event-*.js) defining window.GALLERY_ITEMS = [...]
*/

(function () {
  // ---------- Utilities ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const esc = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  // Drive helpers
  function extractId(previewUrl){ const m=String(previewUrl).match(/\/d\/([^/]+)\/preview/); return m?m[1]:null; }
  const viewImg = (id)=>`https://drive.google.com/uc?export=view&id=${id}`;
  const thumb   = (id,w=1600)=>`https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

  // Hash routing
  function getHashParams(){
    const h = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    const params = new URLSearchParams(h.replace(/^[?]/,''));
    return Object.fromEntries(params.entries());
  }
  function setHashParam(key, val){
    const params = new URLSearchParams(location.hash.replace(/^#?/,''));
    params.set(key, val);
    const newHash = '#' + params.toString();
    if (newHash !== location.hash) history.pushState(null, '', newHash);
  }

  // ---------- App State ----------
  const state = {
    events: Array.isArray(window.GALLERY_EVENT_INDEX) ? window.GALLERY_EVENT_INDEX.slice() : [],
    currentSlug: null,
    media: [],
  };

  // ---------- UI Refs ----------
  const refs = {
    tabs: null, select: null, grid: null, counts: null, q: null,
    lightbox: null, closeBtn: null, lbBody: null, lbCaption: null,
  };
  function cacheRefs(){
    refs.tabs = document.getElementById('tabs');
    refs.select = document.getElementById('eventSelect');
    refs.grid = document.getElementById('grid');
    refs.counts = document.getElementById('counts');
    refs.q = document.getElementById('q');
    refs.lightbox = document.getElementById('lightbox');
    refs.closeBtn = document.getElementById('closeBtn');
    refs.lbBody = document.getElementById('lbBody');
    refs.lbCaption = document.getElementById('lbCaption');
  }

  // ---------- Event Registry UI ----------
  function buildEventNav(){
    // Tabs
    refs.tabs.innerHTML = '';
    state.events.forEach(ev=>{
      const b = el('button','tab');
      b.type = 'button';
      b.setAttribute('role','tab');
      b.setAttribute('data-slug', ev.slug);
      b.textContent = ev.title || ev.slug;
      b.addEventListener('click', ()=> navigateTo(ev.slug));
      refs.tabs.appendChild(b);
    });

    // Mobile select
    refs.select.innerHTML = '';
    state.events.forEach(ev=>{
      const opt = el('option');
      opt.value = ev.slug; opt.textContent = ev.title || ev.slug;
      refs.select.appendChild(opt);
    });
    refs.select.addEventListener('change', ()=> navigateTo(refs.select.value));
  }

  function updateActiveNav(slug){
    // Tabs
    Array.from(refs.tabs.querySelectorAll('.tab')).forEach(b=>{
      const on = b.getAttribute('data-slug') === slug;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    // Select
    if (refs.select.value !== slug) refs.select.value = slug;
  }

  // ---------- Load Event Data ----------
  function normalize(items){
    return (items||[]).map(it=>{

      const t = String(it.type || '').toLowerCase();

      // New: text blocks
      if (t === 'text') {
        return {
          kind: 'text',
          title: it.title || it.name || '',
          body: it.body || '',
          desc: it.desc || ''
        };
      }

      const id = extractId(it.preview || '');
      if(!id) return null;
      const lower = String(it.name||'').toLowerCase();
      const kind = lower.endsWith('.mp4') ? 'video' : 'image';
      return { name: it.name || id, preview: it.preview, desc: it.desc || '', id, kind };
    }).filter(Boolean);
  }

  function loadEventData(ev) {
    return new Promise((resolve, reject)=>{
      // Clean any previous dynamic script
      const old = document.getElementById('eventDataScript');
      if (old) old.remove();
      // Clear global to avoid mixing items
      delete window.GALLERY_ITEMS;

      const s = document.createElement('script');
      s.id = 'eventDataScript';
      s.src = ev.data;
      s.async = true;
      s.onload = ()=>{
        const raw = window.GALLERY_ITEMS;
        if (!Array.isArray(raw) || raw.length === 0){
          reject(new Error('No items found in ' + ev.data));
          return;
        }
        // Clone and clean up
        const cloned = JSON.parse(JSON.stringify(raw));
        delete window.GALLERY_ITEMS;
        resolve(normalize(cloned));
      };
      s.onerror = ()=> reject(new Error('Failed loading ' + ev.data));
      document.head.appendChild(s);
    });
  }

  // ---------- Grid Rendering ----------
  function makeImageCard(item, openLightboxImage){
    const card = el('article','card');
    const btn  = el('button','media-btn'); btn.type='button';
    const img  = el('img','thumb');
    img.loading='lazy'; img.decoding='async'; img.referrerPolicy='no-referrer';
    img.alt=item.name; img.src=viewImg(item.id);
    let tried=false; img.onerror=()=>{ if(!tried){ tried=true; img.src=thumb(item.id,1600); } };
    btn.addEventListener('click',()=>openLightboxImage(item));
    btn.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openLightboxImage(item); } });
    btn.appendChild(img);

    const cap=el('div','caption');
    cap.innerHTML = `
      <div class="cap-top"><span class="name" title="${esc(item.name)}">${esc(item.name)}</span><span></span></div>
      ${item.desc ? `<div class="desc">${esc(item.desc)}</div>` : ''}`;
    card.appendChild(btn); card.appendChild(cap);
    return card;
  }

  function makeVideoCard(item, openLightboxVideo){
    const card = el('article','card');
    const btn  = el('button','media-btn'); btn.type='button';
    const wrap = el('div','video-wrap');
    const poster = el('img','poster');
    poster.loading='lazy'; poster.decoding='async'; poster.referrerPolicy='no-referrer';
    poster.alt=item.name+' (video)'; poster.src=thumb(item.id,1600);
    const play = el('div','play');
    play.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" opacity=".7"></circle><polygon points="10,8 16,12 10,16" fill="#e5e7eb"></polygon></svg>`;
    btn.addEventListener('click',()=>openLightboxVideo(item.preview, item));
    btn.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openLightboxVideo(item.preview, item); } });
    wrap.appendChild(poster); wrap.appendChild(play); btn.appendChild(wrap);

    const cap=el('div','caption');
    cap.innerHTML = `
      <div class="cap-top"><span class="name" title="${esc(item.name)}">${esc(item.name)}</span><span></span></div>
      ${item.desc ? `<div class="desc">${esc(item.desc)}</div>` : ''}`;
    card.appendChild(btn); card.appendChild(cap);
    return card;
  }

//function makeTextCard(item, openLightboxText){
//  const card = el('article','card text-card');
//
//  const btn = el('button','media-btn'); btn.type = 'button';
//  btn.addEventListener('click', ()=> openLightboxText(item));
//  btn.addEventListener('keydown', e => {
//    if (e.key==='Enter' || e.key===' ') { e.preventDefault(); openLightboxText(item); }
//  });
//   const wrap = el('div','text-wrap');
//   wrap.innerHTML = `
//     <div class="text-icon" aria-hidden="true">📝</div>
//     <div class="text-title">${esc(item.title || 'Note')}</div>
//     ${item.desc ? `<div class="text-sub">${esc(item.desc)}</div>` : ''}
//     <div class="text-excerpt">${esc(item.body).slice(0, 220)}${item.body.length > 220 ? '…' : ''}</div>
//   `;
//   btn.appendChild(wrap);

//   card.appendChild(btn);
//   return card;
// }

function makeTextCard(item){
  const card = el('article','card text-card');      // full-row via CSS
  const wrap = el('div','text-wrap');
  const hasTitle = (item.title || '').trim().length > 0;

  wrap.innerHTML = `
    ${hasTitle ? `<div class="text-title">${esc(item.title)}</div>` : ''}
    ${item.desc ? `<div class="text-sub">${esc(item.desc)}</div>` : ''}
    <div class="text-body">${esc(item.body).replace(/\n/g,'<br>')}</div>
  `;

  card.appendChild(wrap);
  return card;
}



function renderGrid(list){
  refs.grid.innerHTML = '';
  for (const m of list) {
  refs.grid.appendChild(
    m.kind === 'video' ? makeVideoCard(m, openLightboxVideo) :
    m.kind === 'image' ? makeImageCard(m, openLightboxImage) :
    /* text */           makeTextCard(m)                // <- no openLightboxText
  );
  }
  const imgs = list.filter(x => x.kind === 'image').length;
  const vids = list.filter(x => x.kind === 'video').length;
  const notes = list.filter(x => x.kind === 'text').length;
  refs.counts.textContent = `${list.length} items • ${imgs} images • ${vids} videos • ${notes} notes`;
}

  // ---------- Lightbox ----------
  function captionHtml(item){
    const d = item.desc ? `<div>${esc(item.desc)}</div>` : '';
    return `<div><strong>${esc(item.name)}</strong></div>${d}<div class="lb-meta">${item.kind==='video'?'Video':'Image'}</div>`;
  }

  function clearLightbox(){ refs.lbBody.innerHTML=''; refs.lbCaption.textContent=''; }

  function openLightboxImage(item){
    clearLightbox();
    const frame = el('iframe','frame');
    frame.allow = 'fullscreen; picture-in-picture';
    frame.referrerPolicy = 'no-referrer';
    frame.src = item.preview; // Drive preview page (works for images reliably)
    refs.lbBody.appendChild(frame);
    refs.lbCaption.innerHTML = captionHtml(item);
    document.body.classList.add('no-scroll');
    $('#lightbox').classList.add('open');
  }

  function openLightboxVideo(previewUrl, item){
    clearLightbox();
    const url = new URL(previewUrl);
    url.searchParams.set('autoplay','1');
    const frame = el('iframe','frame');
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.referrerPolicy = 'no-referrer';
    frame.src = url.toString();
    refs.lbBody.appendChild(frame);
    refs.lbCaption.innerHTML = captionHtml(item);
    document.body.classList.add('no-scroll');
    $('#lightbox').classList.add('open');
  }

  // function openLightboxText(item){
  //   clearLightbox();
  //   const box = el('div','text-frame');
  //   box.innerHTML = `
  //     <h2 class="lb-title">${esc(item.title || 'Note')}</h2>
  //     ${item.desc ? `<div class="lb-sub">${esc(item.desc)}</div>` : ''}
  //     <div class="lb-text">${esc(item.body).replace(/\n/g,'<br>')}</div>
  //   `;
  //   refs.lbBody.appendChild(box);
  //   refs.lbCaption.innerHTML = `<div><strong>${esc(item.title || 'Note')}</strong></div><div class="lb-meta">Text</div>`;
  //   document.body.classList.add('no-scroll');
  //   document.getElementById('lightbox').classList.add('open');
  // }

  function openLightboxText(item){
    clearLightbox();
    const box = el('div','text-frame');
    const hasTitle = (item.title || '').trim().length > 0;

    box.innerHTML = `
      ${hasTitle ? `<h2 class="lb-title">${esc(item.title)}</h2>` : ''}
      ${item.desc ? `<div class="lb-sub">${esc(item.desc)}</div>` : ''}
      <div class="lb-text">${esc(item.body).replace(/\n/g,'<br>')}</div>
    `;
    refs.lbBody.appendChild(box);

    // Caption: if no title, just show "Text"
    refs.lbCaption.innerHTML = hasTitle
      ? `<div><strong>${esc(item.title)}</strong></div><div class="lb-meta">Text</div>`
      : `<div class="lb-meta">Text</div>`;

    document.body.classList.add('no-scroll');
    document.getElementById('lightbox').classList.add('open');
  }

  function closeLightbox(){
    $('#lightbox').classList.remove('open');
    document.body.classList.remove('no-scroll');
    const frame=refs.lbBody.querySelector('iframe'); if(frame) frame.src='about:blank';
    const img=refs.lbBody.querySelector('img'); if(img) img.removeAttribute('src');
    clearLightbox();
  }

  // ---------- Search ----------
  function bindSearch(){
    refs.q.addEventListener('input', ()=>{
      const term = refs.q.value.trim().toLowerCase();
      const list = term
        ? state.media.filter(m => {
            if (m.kind === 'text') {
              return (m.title || '').toLowerCase().includes(term)
                  || (m.body || '').toLowerCase().includes(term)
                  || (m.desc || '').toLowerCase().includes(term);
            }
            return (m.name || '').toLowerCase().includes(term)
                || (m.desc || '').toLowerCase().includes(term);
          })
        : state.media;
      renderGrid(list);
    });
  }

  // ---------- Navigation ----------
  async function navigateTo(slug){
    if (!slug) return;
    if (!state.events.some(e=>e.slug===slug)) return;

    updateActiveNav(slug);
    setHashParam('event', slug);

    // Load data
    const ev = state.events.find(e=>e.slug===slug);
    refs.grid.innerHTML = '<div style="padding:12px;border:1px solid #374151;border-radius:12px;background:#111827;color:#e5e7eb">Loading…</div>';
    try{
      const media = await loadEventData(ev);
      state.currentSlug = slug;
      state.media = media;
      refs.q.value = '';
      renderGrid(media);
    } catch (err){
      console.error(err);
      refs.grid.innerHTML = '<div style="padding:12px;border:1px solid #ef4444;border-radius:12px;background:#111827;color:#fecaca">Failed to load event data.</div>';
      refs.counts.textContent = '0 items';
    }
  }

  // ---------- Init ----------
  function init(){
    cacheRefs();

    if (!state.events.length){
      refs.grid.innerHTML = '<div style="padding:12px;border:1px solid #374151;border-radius:12px;background:#111827;color:#e5e7eb">No events in <code>data/events.js</code>.</div>';
      return;
    }

    buildEventNav();
    bindSearch();

    // Lightbox bindings
    refs.closeBtn.addEventListener('click', closeLightbox);
    $('#lightbox').addEventListener('click', (e)=>{ if(e.target===refs.lightbox) closeLightbox(); });
    window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeLightbox(); });

    // Select event from hash or default to first
    const { event } = getHashParams();
    const startSlug = state.events.some(e=>e.slug===event) ? event : state.events[0].slug;
    navigateTo(startSlug);

    // Back/forward support
    window.addEventListener('hashchange', ()=>{
      const { event:ev } = getHashParams();
      if (ev && ev !== state.currentSlug) navigateTo(ev);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
