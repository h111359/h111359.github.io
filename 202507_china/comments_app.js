const byId = (id) => document.getElementById(id);
const src = byId('src');
const grid = byId('grid');

// ---- Sample & actions (keep existing workflow) ----
const SAMPLE = `window.GALLERY_ITEMS = [
  { type: "text", title: "Ден първи", body: "Първият посетен обект беше Храмът на Нефритения Буда в Шанхай - едно от най-свещените будистки места в Китай и истински духовен оазис в сърцето на мегаполиса. Построен през 1882 г., той приютява две изключителни нефритени статуи на Буда, донесени от монаха Хуиген след поклонничество в Бирма. Будизмът в Китай съчетава елементи от махаяна традицията и местни вярвания, като акцентира върху състраданието, мъдростта и стремежа към хармония.", desc: "Бележка" },
  { name: "20250721_180222.jpg", preview: "https://drive.google.com/file/d/1xvpiwUPikjLHbelx5GLxvqMELYtZwu6s/preview?authuser=0", desc: "Снимка – временно описание." },
  { name: "20250721_193611.mp4", preview: "https://drive.google.com/file/d/1cCYAzAWaCQehku8F7hzJwZz0SJusPXBk/preview?authuser=0", desc: "Видео – временно описание." },
  { type: "text", title: "Край", body: "Финален текстов блок.", desc: "" }
];`;

byId('sample').addEventListener('click', () => { src.value = SAMPLE; });
byId('clear').addEventListener('click', () => { src.value = ''; grid.innerHTML = ''; });

// Add copy button functionality
const copyBtn = document.createElement('button');
copyBtn.textContent = 'Copy Input';
copyBtn.className = 'primary';
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(src.value);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy Input'; }, 1200);
  } catch {
    src.select();
    document.execCommand('copy');
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy Input'; }, 1200);
  }
});

// Insert the button next to the input field
window.addEventListener('DOMContentLoaded', () => {
  const controls = src.parentElement.querySelector('.controls');
  if (controls) controls.appendChild(copyBtn);
  // Add Download Input button
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download Input';
  downloadBtn.className = 'primary';
  downloadBtn.addEventListener('click', () => {
    const blob = new Blob([src.value], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gallery_items.js';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  });
  controls.appendChild(downloadBtn);
});
byId('load').addEventListener('click', () => {
  try {
    const items = tryParseItems(src.value);
    if (!items.length) { alert('No items found.'); return; }
    render(items);
  } catch (err) {
    alert(err.message);
  }
});

// ---- Parsing ----
function tryParseItems(text) {
  if (!text || !text.trim()) return [];
  // Strictly extract only the array part
  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first === -1 || last === -1 || last < first) throw new Error('No array found');
  let arrStr = text.substring(first + 1, last); // exclude [ and ]

  // Split into lines, detect commented-out items
  const lines = arrStr.split('\n');
  let jsonLines = [];
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === ',' || trimmed === ']') return; // skip empty lines and stray commas
    if (trimmed.startsWith('//')) {
      const uncommented = trimmed.replace(/^\/\/\s*/, '').replace(/,$/, '');
      if (uncommented) jsonLines.push({ line: uncommented, checked: false });
    } else {
      const cleanLine = trimmed.replace(/,$/, '');
      if (cleanLine) jsonLines.push({ line: cleanLine, checked: true });
    }
  });

  // Rebuild array string for JSON.parse
  const arrStrClean = '[' + jsonLines.map(l => l.line).join(',') + ']';
  let arrStrQuoted = arrStrClean.replace(/([{\,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":');
  arrStrQuoted = arrStrQuoted.replace(/,([\s]*[}\]])/g, '$1');

  // Advanced logging
  console.log('Extracted array string:', arrStrClean);
  console.log('Quoted array string:', arrStrQuoted);

  try {
    const raw = JSON.parse(arrStrQuoted);
    if (!Array.isArray(raw)) throw new Error('Parsed value is not an array');
    return raw.map((it, idx) => {
      const checked = jsonLines[idx]?.checked !== false;
      if (it.type === 'text') {
        return { _kind: 'text', type: String(it.type || 'text'), title: String(it.title || ''), body: String(it.body || ''), desc: String(it.desc || ''), _checked: checked, _id: idx };
      }
      return { _kind: 'media', name: String(it.name || ''), preview: String(it.preview || ''), desc: String(it.desc || ''), _checked: checked, _id: idx };
    });
  } catch (e) {
    // Log error details
    console.error('JSON parse error:', e.message);
    let pos = 0;
    const match = e.message.match(/position (\\d+)/);
    if (match) pos = parseInt(match[1], 10);
    console.error('Error context:', arrStrQuoted.slice(Math.max(0, pos - 40), pos + 40));
    throw new Error('Could not parse the list. Details: ' + e.message);
  }
}

// ---- Rendering ----
function mediaElementFor(item) {
  const lowerName = (item.name || '').toLowerCase();
  const isVideo = lowerName.endsWith('.mp4') || /[?&]format=mp4/.test(item.preview || '');
  const isDrivePreview = /\/preview(\?|$)/.test(item.preview || '');
  if (isDrivePreview) {
    const ifr = document.createElement('iframe');
    ifr.src = item.preview; ifr.allow = 'autoplay; encrypted-media'; ifr.loading = 'lazy'; ifr.referrerPolicy = 'no-referrer';
    ifr.title = item.name || '';
    return ifr;
  }
  if (isVideo) {
    const v = document.createElement('video');
    v.src = item.preview; v.controls = true; v.playsInline = true; v.preload = 'metadata';
    return v;
  }
  const img = document.createElement('img');
  img.src = item.preview; img.alt = item.name || ''; img.loading = 'lazy';
  return img;
}

function field(label, kind, value) {
  const wrap = document.createElement('div'); wrap.className = 'field';
  const lab = document.createElement('div'); lab.className = 'label'; lab.textContent = label;
  let input;
  if (kind === 'area') {
    input = document.createElement('textarea'); input.className = 'area';
  } else {
    input = document.createElement('input'); input.type = 'text'; input.className = 'text';
  }
  input.value = value || '';
  wrap.append(lab, input);
  return { el: wrap, input };
}

function render(items) {
  grid.innerHTML = '';
  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'media';
    card.dataset.kind = item._kind;

    const head = document.createElement('div');
    head.className = 'head';
    const left = document.createElement('div');
    left.className = 'name';

    const pill = document.createElement('label');
    pill.className = 'pill';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = item._checked !== false;
    cb.addEventListener('change', () => { item._checked = cb.checked; throttleRegenerate(items); });
    pill.append(cb, document.createTextNode(' include'));

    if (item._kind === 'text') {
      left.innerHTML = `<b>Text block</b> — <span class="muted">${escapeHtml(item.title || 'Untitled')}</span>`;
      head.append(left, pill);

      const typeField = field('Type', 'text', item.type || 'text');
      typeField.input.addEventListener('input', () => { item.type = typeField.input.value; throttleRegenerate(items); });

      const titleField = field('Title', 'text', item.title || '');
      titleField.input.addEventListener('input', () => { item.title = titleField.input.value; throttleRegenerate(items); });

      const bodyField = field('Body', 'area', item.body || '');
      bodyField.input.classList.add('body');
      bodyField.input.addEventListener('input', () => { item.body = bodyField.input.value; throttleRegenerate(items); });

      const descField = field('Desc (note)', 'area', item.desc || '');
      descField.input.addEventListener('input', () => { item.desc = descField.input.value; throttleRegenerate(items); });

      card.append(head, typeField.el, titleField.el, bodyField.el, descField.el);
    } else {
      left.innerHTML = `<b>${escapeHtml(item.name || 'Unnamed')}</b>`;
      head.append(left, pill);

      // Add a button to insert a text block BEFORE the media item
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ text above';
      addBtn.className = 'btn';
      addBtn.addEventListener('click', () => {
        items.splice(idx, 0, { _kind: 'text', type: 'text', title: '', body: '', desc: '', _checked: true });
        render(items);
      });
      head.append(addBtn);

      const media = mediaElementFor(item);
      const descField = field('Description', 'area', item.desc || '');
      descField.input.addEventListener('input', () => { item.desc = descField.input.value; throttleRegenerate(items); });

      card.append(head, media, descField.el);
    }
    grid.append(card);
  });
  regenerate(items);
}

// ---- Utilities & output builder ----
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function jsStringEscape(str) { return String(str).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\r/g,'').replace(/\t/g,'\\t').replace(/\"/g,'\\"'); }

function buildOutput(items) {
  const lines = [];
  lines.push('window.GALLERY_ITEMS = [');
  items.forEach((it, idx) => {
    let line = '';
    if (it._kind === 'text') {
      line = `  { type: "${jsStringEscape(it.type || 'text')}", title: "${jsStringEscape(it.title || '')}", body: "${jsStringEscape(it.body || '')}", desc: "${jsStringEscape(it.desc || '')}" }`;
    } else {
      line = `  { name: "${jsStringEscape(it.name || '')}", preview: "${jsStringEscape(it.preview || '')}", desc: "${jsStringEscape(it.desc || '')}" }`;
    }
    lines.push((it._checked === false ? '  // ' : '  ') + line + (idx < items.length - 1 ? ',' : ''));
  });
  lines.push('];');
  return lines.join('\n');
}

// Live update the TOP textarea instead of a bottom output box
let regenTimer = null;
function throttleRegenerate(itemsRef) {
  if (regenTimer) cancelAnimationFrame(regenTimer);
  regenTimer = requestAnimationFrame(() => { regenerate(itemsRef); });
}
function regenerate(items) {
  const txt = buildOutput(items);
  src.value = txt; // write into the top input field
}

// Toggle all
byId('allToggle').addEventListener('change', (e) => {
  const c = e.target.checked;
  document.querySelectorAll('.media input[type="checkbox"]').forEach(cb => { cb.checked = c; cb.dispatchEvent(new Event('change')); });
});
