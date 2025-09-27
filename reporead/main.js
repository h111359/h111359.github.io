// Mobile sidebar toggle
window.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('menu-toggle');
  const fileTree = document.getElementById('file-tree');
  function isMobile() {
    return window.innerWidth <= 700;
  }
  function updateSidebarVisibility() {
    if (isMobile()) {
      fileTree.classList.remove('open');
      fileTree.style.display = '';
    } else {
      fileTree.classList.remove('open');
      fileTree.style.display = '';
    }
  }
  if (menuToggle && fileTree) {
    menuToggle.addEventListener('click', function() {
      if (isMobile()) {
        fileTree.classList.toggle('open');
      }
    });
    window.addEventListener('resize', updateSidebarVisibility);
    updateSidebarVisibility();
    // Collapse menu when a link in the sidebar is clicked (mobile only)
    fileTree.addEventListener('click', function(e) {
      if (isMobile() && e.target.tagName === 'A') {
        fileTree.classList.remove('open');
      }
    });
  }
});
// Loads repo list from setup.js, fetches .md files, builds navigation, renders markdown
const repoNav = document.getElementById('repo-nav');
const fileTree = document.getElementById('file-tree');
const mdContent = document.getElementById('md-content');

let REPOS = [];
let currentRepo = null;
let fileStructure = {};
let currentFile = null;

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
}

function buildRepoNav() {
  repoNav.innerHTML = '';
  REPOS.forEach((repo, idx) => {
    const a = document.createElement('a');
    a.textContent = repo.name;
    a.href = '#';
    a.className = 'repo-link';
    a.addEventListener('click', e => {
      e.preventDefault();
      loadRepo(idx);
    });
    repoNav.appendChild(a);
  });
}

function buildFileTree(structure, prefix = '') {
  fileTree.innerHTML = '';
  function walk(node, path) {
    Object.entries(node).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const link = document.createElement('a');
        link.textContent = key;
        link.href = '#';
        link.className = 'file-link' + (currentFile === value ? ' active' : '');
        link.addEventListener('click', e => {
          e.preventDefault();
          loadMarkdownFile(currentRepo, value);
        });
        fileTree.appendChild(link);
      } else {
        const folder = document.createElement('div');
        folder.textContent = key;
        folder.style.fontWeight = 'bold';
        fileTree.appendChild(folder);
        walk(value, path + key + '/');
      }
    });
  }
  walk(structure, prefix);
}

function loadRepo(idx) {
  currentRepo = REPOS[idx];
  fetchRepoMdFiles(currentRepo)
    .then(structure => {
      fileStructure = structure;
      buildFileTree(fileStructure);
      const repoUrl = `https://github.com/${currentRepo.owner}/${currentRepo.repo}`;
  mdContent.innerHTML = `<div style='margin-top:2em;text-align:center;'><a href="${repoUrl}" target="_blank" class="repo-link" style='font-size:1.2em;padding:1em 2em;background:#222;color:#fff;border-radius:8px;display:inline-block;border:2px solid #4cc9f0;text-decoration:none;'>Open <b>${currentRepo.name}</b> on GitHub</a></div>`;
      currentFile = null;
    })
    .catch(() => {
      // Always show the link even if fetch fails
      const repoUrl = `https://github.com/${currentRepo.owner}/${currentRepo.repo}`;
  mdContent.innerHTML = `<div style='margin-top:2em;text-align:center;'><a href="${repoUrl}" target="_blank" class="repo-link" style='font-size:1.2em;padding:1em 2em;background:#222;color:#fff;border-radius:8px;display:inline-block;border:2px solid #4cc9f0;text-decoration:none;'>Open <b>${currentRepo.name}</b> on GitHub</a></div>`;
      currentFile = null;
    });
}

function fetchRepoMdFiles(repo) {
  // Uses GitHub API to list .md files, builds nested structure
  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${repo.branch}?recursive=1`;
  return fetch(apiUrl)
    .then(r => r.json())
    .then(data => {
      const files = data.tree.filter(f => f.type === 'blob' && f.path.endsWith('.md'));
      // Build nested structure
      const structure = {};
      files.forEach(f => {
        const parts = f.path.split('/');
        let node = structure;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node[parts[i]]) node[parts[i]] = {};
          node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = f.path;
      });
      return structure;
    });
}

function loadMarkdownFile(repo, filePath) {
  currentFile = filePath;
  buildFileTree(fileStructure);
  const rawUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.branch}/${filePath}`;
  fetch(rawUrl)
    .then(r => r.text())
    .then(md => {
      mdContent.innerHTML = renderMarkdown(md);
    });
}

function renderMarkdown(md) {
  // Basic markdown rendering (headings, links, code, lists, paragraphs, newlines)
  // Add anchors to headings for TOC navigation
  let html = escapeHtml(md)
    .replace(/^###### (.*)$/gm, function(_, t) {
      const id = t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `<h6 id="${id}">${t}</h6>`;
    })
    .replace(/^##### (.*)$/gm, function(_, t) {
      const id = t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `<h5 id="${id}">${t}</h5>`;
    })
    .replace(/^#### (.*)$/gm, function(_, t) {
      const id = t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `<h4 id="${id}">${t}</h4>`;
    })
    .replace(/^### (.*)$/gm, function(_, t) {
      const id = t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `<h3 id="${id}">${t}</h3>`;
    })
    .replace(/^## (.*)$/gm, function(_, t) {
      const id = t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `<h2 id="${id}">${t}</h2>`;
    })
    .replace(/^# (.*)$/gm, function(_, t) {
      const id = t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `<h1 id="${id}">${t}</h1>`;
    })
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, function(_, text, url) {
      if (url.startsWith('#')) {
        return `<a href="${url}" class="toc-link">${text}</a>`;
      }
      return `<a href="${url}" target="_blank">${text}</a>`;
    });

  // Render lists (fix indentation)
  // Replace all consecutive list items with a single <ul> block
  // Special handling for Markdown All in One TOC blocks
  html = html.replace(/(^|\n)((?:\s*[-*] \[.*?\]\(#[^)]+\)(?:\n|$))+)/g, function(match, p1, p2) {
    // Each line is a TOC entry: - [Title](#anchor)
    const items = p2.trim().split(/\n/).filter(Boolean).map(line => {
      const m = line.match(/^(\s*)([-*]) \[(.*?)\]\((#[^)]+)\)/);
      if (!m) return '';
      const indent = m[1].length;
      const text = m[3];
      const anchor = m[4];
      return { text, anchor, indent };
    });
    // Build nested lists with anchor links
    let htmlList = '';
    let lastIndent = 0;
    items.forEach((it, idx) => {
      if (it.indent > lastIndent) {
        htmlList += '<ul>'.repeat((it.indent - lastIndent) / 2);
      } else if (it.indent < lastIndent) {
        htmlList += '</ul>'.repeat((lastIndent - it.indent) / 2);
      }
  htmlList += `<li><a href="${it.anchor}" class="toc-link">${it.text}</a></li>`;
      lastIndent = it.indent;
    });
    htmlList += '</ul>'.repeat(lastIndent / 2);
    return '<ul>' + htmlList + '</ul>';
  });

  // Render other lists (fix indentation and line breaks)
  html = html.replace(/(^|\n)((?:\s*[-*] (?!\[.*?\]\(#[^)]+\)).*(?:\n|$))+)/g, function(match, p1, p2) {
    const items = p2.trim().split(/\n/).filter(Boolean).map(line => {
      // Detect nested list by leading spaces
      const m = line.match(/^(\s*)([-*]) (.*)$/);
      if (!m) return '';
      const indent = m[1].length;
      return { text: m[3], indent };
    });
    // Build nested lists
    let htmlList = '';
    let lastIndent = 0;
    items.forEach((it, idx) => {
      if (it.indent > lastIndent) {
        htmlList += '<ul>'.repeat((it.indent - lastIndent) / 2);
      } else if (it.indent < lastIndent) {
        htmlList += '</ul>'.repeat((lastIndent - it.indent) / 2);
      }
      htmlList += `<li>${it.text}</li>`;
      lastIndent = it.indent;
    });
    htmlList += '</ul>'.repeat(lastIndent / 2);
    return '<ul>' + htmlList + '</ul>';
  });

  // Paragraphs: replace double newlines with <p>
  html = html.replace(/\n{2,}/g, '</p><p>');
  // Single newlines: replace with <br> (but not inside <pre> or <code>)
  html = html.replace(/([^>])\n(?!\n)/g, '$1<br>');
  html = `<p>${html}</p>`;
  // Remove empty <p></p> at start/end
  html = html.replace(/^<p><\/p>/, '').replace(/<p><\/p>$/, '');
  return `<div class=\"markdown-body\">${html}</div>`;
}

// Delegate TOC anchor clicks to scroll to header
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('toc-link')) {
    e.preventDefault();
    const hash = e.target.getAttribute('href');
    if (hash && hash.startsWith('#')) {
      const el = document.querySelector('.markdown-body ' + hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
});

// Load repo list from setup.js
window.addEventListener('DOMContentLoaded', () => {
  if (window.GITHUB_MD_REPOS) {
    REPOS = window.GITHUB_MD_REPOS;
    buildRepoNav();
    if (REPOS.length) loadRepo(0);
  } else {
    mdContent.innerHTML = '<p>No repositories configured. Please edit setup.js.</p>';
  }
});
// Load repo list from setup.js
window.addEventListener('DOMContentLoaded', () => {
  if (window.GITHUB_MD_REPOS) {
    REPOS = window.GITHUB_MD_REPOS;
    buildRepoNav();
    if (REPOS.length) loadRepo(0);
  } else {
    mdContent.innerHTML = '<p>No repositories configured. Please edit setup.js.</p>';
  }
});
