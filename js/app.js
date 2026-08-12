/* ============================================================
   SHADOW.PROTOCOL — Main Application
   Author: Ilyas
   ============================================================ */

(function() {
  'use strict';

  // ============ CONFIG ============
  const CONFIG = {
    // Ganti dengan URL Apps Script kamu setelah deploy
    API_URL: 'https://script.google.com/macros/s/AKfycbx1E2HUIQ47EBE_9KI0gF7TL4kjY-uI-uwLncJAFUlyZP3Fwa4ix7UoVCEOueP8268-/exec',
    // Token rahasia - HARUS SAMA dengan yang di Apps Script
    API_TOKEN: 'akwjJUUIUHwhidc8956w',
    SHEET_TABS: {
      artikel: 'ARTIKEL',
      proyek: 'PROYEK',
      karya: 'KARYA'
    }
  };

  // ============ STATE ============
  const state = {
    loaded: false,
    theme: localStorage.getItem('theme') || 'dark',
    musicEnabled: false,
    currentChapter: null,
    currentKaryaFilter: 'semua',  // ← TAMBAHAN: simpan filter aktif
    data: {
      artikel: [],
      proyek: [],
      karya: []
    }
  };

  // ← TAMBAHAN: Pagination state
  const paginationState = {
    artikel: { page: 1 },
    proyek: { page: 1 },
    karya: { page: 1 }
  };

  // ← TAMBAHAN: Jumlah item per halaman
  const PAGE_LIMIT = 5;

  // ← TAMBAHAN: Alias kategori (FIX filter bug)
  const KATEGORI_ALIASES = {
    'photography': 'fotografi',
    'foto': 'fotografi',
    'fotografi': 'fotografi',
    'design': 'desain',
    'desain': 'desain',
    'graphic design': 'desain',
    'desain grafis': 'desain',
    'graphic': 'desain'
  };

  // ============ UTILITIES ============
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function debounce(fn, delay = 100) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ============ LOADER ============
  function initLoader() {
    const loader = $('#loader');
    const fill = $('#loader-fill');
    const percent = $('#loader-percent');
    const lines = ['#term-line-1', '#term-line-2', '#term-line-3'].map(id => $(id));

    const messages = [
      'loading assets...',
      'connecting to protocol...',
      'rendering shadows... ready.'
    ];

    let progress = 0;
    let msgIndex = 0;

    document.body.classList.add('loading');

    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) progress = 100;

      fill.style.width = progress + '%';
      percent.textContent = Math.floor(progress) + '%';

      if (progress > (msgIndex + 1) * 33 && msgIndex < 3) {
        lines[msgIndex].textContent = '> ' + messages[msgIndex];
        lines[msgIndex].classList.add('visible');
        msgIndex++;
      }

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(finishLoader, 400);
      }
    }, 180);
  }

  function finishLoader() {
    const loader = $('#loader');
    loader.classList.add('fade-out');
    document.body.classList.remove('loading');
    setTimeout(() => {
      loader.remove();
      state.loaded = true;
      initAfterLoad();
    }, 800);
  }

  // ============ THEME ============
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
    $('#theme-toggle').addEventListener('click', toggleTheme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('theme', state.theme);
    updateThemeIcon();
    // Update Three.js colors jika diperlukan
    if (window.updateThreeTheme) window.updateThreeTheme(state.theme);
  }

  function updateThemeIcon() {
    const icon = $('#theme-toggle .lucide');
    if (!icon) return;
    // Re-render icon with different name
    const newIcon = state.theme === 'dark' ? 'moon' : 'sun';
    icon.setAttribute('data-lucide', newIcon);
    if (window.lucide) lucide.createIcons();
  }

  // ============ MUSIC ============
  function initMusic() {
    const audio = $('#ambient-audio');
    const btn = $('#music-toggle');
    if (!audio || !btn) return;

    audio.volume = 0.18;

    btn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play().then(() => {
          state.musicEnabled = true;
          updateMusicIcon(true);
        }).catch(() => {
          // Autoplay blocked - user gesture still works
        });
      } else {
        audio.pause();
        state.musicEnabled = false;
        updateMusicIcon(false);
      }
    });
  }

  function updateMusicIcon(playing) {
    const icon = $('#music-toggle .lucide');
    if (!icon) return;
    const newIcon = playing ? 'volume-2' : 'volume-x';
    icon.setAttribute('data-lucide', newIcon);
    if (window.lucide) lucide.createIcons();
    $('#music-toggle').classList.toggle('active', playing);
  }

  // ============ NAVIGATION ============
  function initNav() {
    const nav = $('#nav');
    const scrollHandler = debounce(() => {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    }, 10);
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // Smooth scroll for anchor links
    $$('[data-scroll]').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          const target = $(href);
          if (target) {
            const offset = 80;
            const top = target.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: 'smooth' });
          }
        }
      });
    });
  }

  // ============ REVEAL ON SCROLL ============
  function initReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -60px 0px'
    });

    $$('.reveal').forEach(el => observer.observe(el)); // ← hanya .reveal
  }

  // ============ CHAPTER MARKER ============
  function initChapterMarker() {
    const marker = $('#chapter-marker');
    const kanji = $('#chapter-kanji');
    const label = $('#chapter-label');
    const sections = $$('section[data-chapter]');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const section = entry.target;
          const newChapter = section.dataset.chapter;
          if (newChapter !== state.currentChapter) {
            state.currentChapter = newChapter;
            const newKanji = section.dataset.kanji;
            const newLabel = section.dataset.label;
            // Animate change
            kanji.style.transform = 'translateY(-10px)';
            kanji.style.opacity = '0';
            setTimeout(() => {
              kanji.textContent = newKanji;
              label.textContent = `${newChapter} / ${newLabel}`;
              kanji.style.transform = 'translateY(10px)';
              setTimeout(() => {
                kanji.style.transform = 'translateY(0)';
                kanji.style.opacity = '1';
              }, 50);
            }, 200);
          }
          marker.classList.add('visible');
        }
      });
    }, { threshold: 0.4 });

    sections.forEach(s => observer.observe(s));

    // Hide marker when at top
    window.addEventListener('scroll', debounce(() => {
      if (window.scrollY < 300) marker.classList.remove('visible');
    }, 50), { passive: true });
  }

  // ============ TYPING EFFECT ============
  function initTyping() {
    const el = $('#typed-text');
    if (!el) return;
    const phrases = [
      'Web Developer',
      'Graphic Designer',
      'Photographer',
      'Informatika Student',
      'Problem Solver'
    ];
    let pi = 0, ci = 0, deleting = false;

    function tick() {
      const current = phrases[pi];
      if (deleting) {
        el.textContent = current.substring(0, ci--);
        if (ci < 0) {
          deleting = false;
          pi = (pi + 1) % phrases.length;
          setTimeout(tick, 500);
          return;
        }
      } else {
        el.textContent = current.substring(0, ci++);
        if (ci > current.length) {
          deleting = true;
          setTimeout(tick, 2000);
          return;
        }
      }
      setTimeout(tick, deleting ? 40 : 100);
    }
    tick();
  }

  // ============ COUNTER ANIMATION ============
  function initCounters() {
    const statProjects = $('#stat-projects');
    const statArticles = $('#stat-articles');
    if (!statProjects || !statArticles) return;

    // Update when data loaded
    window.updateStats = () => {
      animateCounter(statProjects, state.data.proyek.length);
      animateCounter(statArticles, state.data.artikel.length);
    };
  }

  function animateCounter(el, target) {
    const duration = 1500;
    const start = performance.now();
    const initial = parseInt(el.textContent) || 0;

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(initial + (target - initial) * ease);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ============ API FETCHER ============
  async function fetchSheet(tab) {
  try {
    const url = CONFIG.API_URL;
    const payload = {
      tab: tab,
      token: CONFIG.API_TOKEN
    };
    
    console.log(`[FETCH] POST ${tab} to Apps Script...`);
    
    // Trik utama: gunakan text/plain untuk bypass CORS preflight
    const res = await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // ⚠️ PENTING: no-cors mode
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
    
    // Masalah: mode 'no-cors' tidak bisa baca response
    // Solusi: gunakan JSONP-style dengan callback
    
    // Coba pendekatan alternatif: gunakan form submission
    return await fetchViaForm(tab);
    
  } catch (err) {
    console.error(`[FETCH] Error ${tab}:`, err);
    return [];
  }
}

// Alternatif yang lebih reliable: JSONP-style via script tag
function fetchViaForm(tab) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonpCallback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout'));
    }, 15000);
    
    window[callbackName] = function(data) {
      clearTimeout(timeout);
      cleanup();
      if (data && data.error) {
        reject(new Error(data.error));
      } else {
        resolve(Array.isArray(data) ? data : []);
      }
    };
    
    const script = document.createElement('script');
    const url = `${CONFIG.API_URL}?tab=${encodeURIComponent(tab)}&token=${encodeURIComponent(CONFIG.API_TOKEN)}&callback=${callbackName}`;
    script.src = url;
    
    script.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error('Script load error'));
    };
    
    function cleanup() {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    
    document.body.appendChild(script);
  });
}

  async function loadAllData() {
    const [artikel, proyek, karya] = await Promise.all([
      fetchSheet(CONFIG.SHEET_TABS.artikel),
      fetchSheet(CONFIG.SHEET_TABS.proyek),
      fetchSheet(CONFIG.SHEET_TABS.karya)
    ]);

    state.data = { artikel, proyek, karya };
    renderArtikel();
    renderProyek();
    renderKarya();
    if (window.updateStats) window.updateStats();
    // Re-observe new cards
    setTimeout(initReveal, 100);
  }

  // ============================================================
  // PAGINATION & FILTER SYSTEM
  // ============================================================

    function getLimit() {
    // Desktop: 5 card per halaman | Mobile: 6 card
    return window.innerWidth <= 600 ? 6 : 5;
  }

  function normalizeKategori(kategori) {
    const key = String(kategori || '').trim().toLowerCase();
    return KATEGORI_ALIASES[key] || key;
  }

  function withIndex(items) {
    return (items || []).map((item, idx) => ({ ...item, _index: idx }));
  }

  function getFilteredKarya() {
    let items = withIndex(state.data.karya);
    const filter = state.currentKaryaFilter;
    if (filter && filter !== 'semua') {
      items = items.filter(k => normalizeKategori(k.kategori) === normalizeKategori(filter));
    }
    return items;
  }

  function getEmptyMessage(type) {
    if (type === 'karya') {
      return state.currentKaryaFilter !== 'semua'
        ? 'Tidak ada karya dalam kategori ini.'
        : 'Belum ada karya.';
    }
    if (type === 'artikel') return 'Belum ada artikel.';
    if (type === 'proyek') return 'Belum ada proyek.';
    return 'Belum ada data.';
  }

  // Buat/inject container dots secara otomatis setelah grid
  function ensurePaginationContainer(type) {
    const container = $(`#${type}-container`);
    if (!container) return null;
    let pagination = $(`#${type}-pagination`);
    if (!pagination) {
      pagination = document.createElement('div');
      pagination.className = 'pagination-dots';
      pagination.id = `${type}-pagination`;
      container.insertAdjacentElement('afterend', pagination);
    }
    return pagination;
  }

  // Render dots navigasi
    function renderDots(type, pagination, totalPages) {
    if (!pagination) return;
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    const currentPage = paginationState[type].page;

    const dots = Array.from({ length: totalPages }, (_, i) => `
      <button class="pagination-dot ${i + 1 === currentPage ? 'active' : ''}"
              data-page="${i + 1}"
              aria-label="Halaman ${i + 1}"></button>
    `).join('');

    pagination.innerHTML = `
      <button class="pagination-arrow" data-dir="-1" ${currentPage === 1 ? 'disabled' : ''} aria-label="Sebelumnya">
        <i data-lucide="chevron-left" class="lucide icon-sm"></i>
      </button>
      <div class="dots-wrap">${dots}</div>
      <button class="pagination-arrow" data-dir="1" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Berikutnya">
        <i data-lucide="chevron-right" class="lucide icon-sm"></i>
      </button>
    `;

    if (window.lucide) lucide.createIcons();

    $$('.pagination-dot', pagination).forEach(dot => {
      dot.addEventListener('click', () => goToPage(type, parseInt(dot.dataset.page, 10)));
    });

    $$('.pagination-arrow', pagination).forEach(btn => {
      btn.addEventListener('click', () => {
        goToPage(type, paginationState[type].page + parseInt(btn.dataset.dir, 10));
      });
    });
  }

  // Helper: ambil items per section
  function getSectionItems(type) {
    if (type === 'artikel') return withIndex(state.data.artikel);
    if (type === 'proyek') return withIndex(state.data.proyek);
    return getFilteredKarya();
  }

  // Helper: render ulang section
  function rerenderSection(type) {
    if (type === 'artikel') renderArtikel();
    else if (type === 'proyek') renderProyek();
    else renderKarya();
  }

  // Navigasi halaman (dot / panah)
  function goToPage(type, page) {
    const totalPages = Math.max(1, Math.ceil(getSectionItems(type).length / getLimit()));
    if (page < 1 || page > totalPages || page === paginationState[type].page) return;

    paginationState[type].page = page;
    rerenderSection(type);

    const container = $(`#${type}-container`);
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.5) {
        window.scrollTo({ top: rect.top + window.scrollY - 100, behavior: 'smooth' });
      }
    }
  }

  // Animasi masuk kartu secara stagger
  function animateCardsIn(container) {
    $$('.card', container).forEach((card, i) => {
      card.classList.remove('visible');
      setTimeout(() => card.classList.add('visible'), 50 + i * 70);
    });
  }

  // Generic renderer dengan pagination
  function renderPaginatedSection(type, container, items, renderCardFn) {
    const pagination = ensurePaginationContainer(type);
    const limit = getLimit();
    const totalPages = Math.max(1, Math.ceil(items.length / limit));

    // Clamp page agar tidak out of range
    if (paginationState[type].page > totalPages) paginationState[type].page = totalPages;
    if (paginationState[type].page < 1) paginationState[type].page = 1;
    const page = paginationState[type].page;

    if (!items.length) {
      container.innerHTML = `
        <div class="loading-state">
          <p>${getEmptyMessage(type)}</p>
        </div>`;
      if (pagination) pagination.innerHTML = '';
      return;
    }

    const start = (page - 1) * limit;
    const pageItems = items.slice(start, start + limit);

    container.innerHTML = pageItems.map((item, i) => renderCardFn(item, i)).join('');

    if (window.lucide) lucide.createIcons();
    attachCardListeners(container, type);
    renderDots(type, pagination, totalPages);
    animateCardsIn(container);
  }

  // ============================================================
  // CARD TEMPLATES
  // ============================================================

  function renderArtikelCard(item, i) {
    const judul = escapeHtml(item.judul);
    const kategori = escapeHtml(item.kategori || 'Article');
    const preview = escapeHtml(stripHtml(item.konten || '').substring(0, 100));
    const tanggal = formatDate(item.tanggal);
    const imgUrl = item.thumbnail_url || `https://picsum.photos/seed/artikel${item._index}/600/400`;

    return `
      <div class="card" data-type="artikel" data-index="${item._index}">
        <div class="card-image">
          <img src="${imgUrl}" alt="${judul}" loading="lazy" />
        </div>
        <div class="card-body">
          <span class="card-category">${kategori}</span>
          <h3 class="card-title">${judul}</h3>
          <p class="card-desc">${preview}${preview.length >= 100 ? '...' : ''}</p>
          <div class="card-meta">
            <span class="card-meta-text">${tanggal}</span>
            <button class="card-arrow" aria-label="Baca artikel"><i data-lucide="arrow-right" class="lucide icon-sm"></i></button>
          </div>
        </div>
      </div>
    `;
  }

  function renderProyekCard(item, i) {
    const judul = escapeHtml(item.judul);
    const kategori = escapeHtml(item.kategori || 'Project');
    const deskripsi = escapeHtml(item.deskripsi || '').substring(0, 100);
    const tech = escapeHtml(item.tech_stack || 'Various');
    const imgUrl = item.thumbnail_url || `https://picsum.photos/seed/proyek${item._index}/600/400`;

    return `
      <div class="card" data-type="proyek" data-index="${item._index}">
        <div class="card-image">
          <img src="${imgUrl}" alt="${judul}" loading="lazy" />
        </div>
        <div class="card-body">
          <span class="card-category">${kategori}</span>
          <h3 class="card-title">${judul}</h3>
          <p class="card-desc">${deskripsi}${deskripsi.length >= 100 ? '...' : ''}</p>
          <div class="card-meta">
            <span class="card-meta-text">${tech}</span>
            <button class="card-arrow" aria-label="Lihat proyek"><i data-lucide="arrow-right" class="lucide icon-sm"></i></button>
          </div>
        </div>
      </div>
    `;
  }

  function renderKaryaCard(item, i) {
    const judul = escapeHtml(item.judul);
    const kategori = escapeHtml(item.kategori || 'Work');
    const deskripsi = escapeHtml(item.deskripsi || '').substring(0, 100);
    const tahun = escapeHtml(item.tahun || '');
    const imgUrl = item.image_url || `https://picsum.photos/seed/karya${item._index}/600/400`;

    return `
      <div class="card" data-type="karya" data-index="${item._index}">
        <div class="card-image">
          <img src="${imgUrl}" alt="${judul}" loading="lazy" />
        </div>
        <div class="card-body">
          <span class="card-category">${kategori}</span>
          <h3 class="card-title">${judul}</h3>
          <p class="card-desc">${deskripsi}${deskripsi.length >= 100 ? '...' : ''}</p>
          <div class="card-meta">
            <span class="card-meta-text">${tahun}</span>
            <button class="card-arrow" aria-label="Lihat karya"><i data-lucide="arrow-right" class="lucide icon-sm"></i></button>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // RENDER WRAPPERS (dipanggil dari loadAllData & filter)
  // ============================================================

  function renderArtikel() {
    const container = $('#artikel-container');
    if (!container) return;
    renderPaginatedSection('artikel', container, withIndex(state.data.artikel), renderArtikelCard);
  }

  function renderProyek() {
    const container = $('#proyek-container');
    if (!container) return;
    renderPaginatedSection('proyek', container, withIndex(state.data.proyek), renderProyekCard);
  }

  function renderKarya() {
    const container = $('#karya-container');
    if (!container) return;
    renderPaginatedSection('karya', container, getFilteredKarya(), renderKaryaCard);
  }

  function attachCardListeners(container, type) {
    $$('.card', container).forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index, 10);
        const item = state.data[type][idx];
        if (item) openModal(type, item);
      });
    });
  }

  // ============ KARYA FILTER ============
  function initKaryaFilter() {
    $$('.karya-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.karya-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentKaryaFilter = tab.dataset.filter || 'semua';
        paginationState.karya.page = 1; // Reset ke halaman 1 saat ganti filter
        renderKarya();
      });
    });
  }

  // ============ MODAL ============
  function openModal(type, item) {
    const modal = $('#modal');
    const body = $('#modal-body');
    if (!modal || !body) return;

    let html = '';
    if (type === 'artikel') {
      html = `
        <span class="badge">${escapeHtml(item.kategori || 'Article')}</span>
        <h2>${escapeHtml(item.judul)}</h2>
        <div class="modal-meta">
          <span><i data-lucide="calendar" class="lucide icon-sm"></i> ${formatDate(item.tanggal)}</span>
          <span><i data-lucide="user" class="lucide icon-sm"></i> Ilyas</span>
        </div>
        ${item.thumbnail_url ? `<div class="modal-image"><img src="${item.thumbnail_url}" alt="${escapeHtml(item.judul)}" /></div>` : ''}
        <div class="modal-content">${item.konten || ''}</div>
      `;
    } else if (type === 'proyek') {
      html = `
        <span class="badge">${escapeHtml(item.kategori || 'Project')}</span>
        <h2>${escapeHtml(item.judul)}</h2>
        ${item.thumbnail_url ? `<div class="modal-image"><img src="${item.thumbnail_url}" alt="${escapeHtml(item.judul)}" /></div>` : ''}
        <div class="modal-meta">
          <span><i data-lucide="wrench" class="lucide icon-sm"></i> ${escapeHtml(item.tech_stack || 'Various')}</span>
        </div>
        <div class="modal-content">${escapeHtml(item.deskripsi || '')}</div>
        <div class="modal-actions">
          ${item.link_live ? `<a href="${item.link_live}" target="_blank" rel="noopener" class="btn btn-primary"><i data-lucide="external-link" class="lucide icon-sm"></i> Live Demo</a>` : ''}
          ${item.link_github ? `<a href="${item.link_github}" target="_blank" rel="noopener" class="btn btn-outline"><i data-lucide="github" class="lucide icon-sm"></i> Source Code</a>` : ''}
        </div>
      `;
    } else if (type === 'karya') {
      html = `
        <span class="badge">${escapeHtml(item.kategori || 'Work')}</span>
        <h2>${escapeHtml(item.judul)}</h2>
        ${item.image_url ? `<div class="modal-image"><img src="${item.image_url}" alt="${escapeHtml(item.judul)}" /></div>` : ''}
        <div class="modal-meta">
          <span><i data-lucide="calendar" class="lucide icon-sm"></i> ${escapeHtml(item.tahun || '')}</span>
          ${item.tags ? `<span><i data-lucide="tag" class="lucide icon-sm"></i> ${escapeHtml(item.tags)}</span>` : ''}
        </div>
        <div class="modal-content">${escapeHtml(item.deskripsi || '')}</div>
      `;
    }

    body.innerHTML = html;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons();
  }

  function closeModal() {
    const modal = $('#modal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function initModal() {
    const modal = $('#modal');
    if (!modal) return;
    $('.modal-close', modal).addEventListener('click', closeModal);
    $('.modal-backdrop', modal).addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  // ============ CONTACT FORM ============
  function initContactForm() {
    const form = $('#contact-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#submit-btn');
      const alert = $('#form-alert');
      const originalHTML = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div><span>Sending...</span>';

      const formData = {
        nama: $('#nama').value.trim(),
        email: $('#email').value.trim(),
        pesan: $('#pesan').value.trim()
      };

      try {
        // Gunakan URLSearchParams karena Apps Script doPost butuh
        const url = `${CONFIG.API_URL}?action=contact&token=${encodeURIComponent(CONFIG.API_TOKEN)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();

        if (data.success) {
          showAlert(alert, 'success', '✓ Transmisi berhasil! Saya akan membalas via email.');
          form.reset();
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (err) {
        showAlert(alert, 'error', '✗ Gagal mengirim. Silakan coba lagi atau hubungi via email.');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  function showAlert(el, type, message) {
    el.className = 'form-alert ' + type;
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  // ============ HELPERS ============
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function stripHtml(str) {
    const tmp = document.createElement('div');
    tmp.innerHTML = str;
    return tmp.textContent || tmp.innerText || '';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d)) return String(dateStr);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return String(dateStr);
    }
  }

  // ============ THREE.JS BACKGROUND ============
  function initThree() {
    if (typeof THREE === 'undefined') return;

    const canvas = $('#three-bg');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Particle network
    const particleCount = 120;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
      velocities.push({
        x: (Math.random() - 0.5) * 0.01,
        y: (Math.random() - 0.5) * 0.01,
        z: (Math.random() - 0.5) * 0.005
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x60a5fa,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true
    });
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Connection lines
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.15
    });
    let lineGroup = new THREE.Group();
    scene.add(lineGroup);

    camera.position.z = 10;

    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    function updateLines() {
      // Remove old lines
      while (lineGroup.children.length) lineGroup.remove(lineGroup.children[0]);

      const pos = geometry.attributes.position.array;
      const lines = [];
      for (let i = 0; i < particleCount; i++) {
        for (let j = i + 1; j < particleCount; j++) {
          const dx = pos[i * 3] - pos[j * 3];
          const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
          const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 3 && lines.length < 80) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(
              new Float32Array([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2],
                               pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]]), 3));
            lines.push(new THREE.Line(g, lineMaterial));
          }
        }
      }
      lines.forEach(l => lineGroup.add(l));
    }

    let frame = 0;
    function animate() {
      requestAnimationFrame(animate);
      frame++;

      const pos = geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        pos[i * 3] += velocities[i].x;
        pos[i * 3 + 1] += velocities[i].y;
        pos[i * 3 + 2] += velocities[i].z;

        if (Math.abs(pos[i * 3]) > 15) velocities[i].x *= -1;
        if (Math.abs(pos[i * 3 + 1]) > 15) velocities[i].y *= -1;
        if (Math.abs(pos[i * 3 + 2]) > 7.5) velocities[i].z *= -1;
      }
      geometry.attributes.position.needsUpdate = true;

      // Update lines every 4 frames for performance
      if (frame % 4 === 0) updateLines();

      // Subtle rotation with mouse
      particles.rotation.y += 0.0005;
      particles.rotation.x += 0.0002;
      camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
      camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    window.addEventListener('resize', debounce(() => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }, 100));

    // Theme update
    window.updateThreeTheme = (theme) => {
      const color = theme === 'dark' ? 0x60a5fa : 0x2563eb;
      material.color.setHex(color);
      lineMaterial.color.setHex(color);
    };
  }

  // ============ EASTER EGGS ============
  function initEasterEggs() {
    const konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let konamiIndex = 0;
    let typed = '';

    document.addEventListener('keydown', (e) => {
      // Konami code
      if (e.key === konami[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konami.length) {
          triggerEasterEgg();
          konamiIndex = 0;
        }
      } else {
        konamiIndex = 0;
      }

      // Secret word "cuan"
      typed += e.key.toLowerCase();
      if (typed.length > 10) typed = typed.slice(-10);
      if (typed.includes('cuan')) {
        alert('💰 Cuan mode activated! Keep building, keep shipping.');
        typed = '';
      }
    });
  }

  function triggerEasterEgg() {
    document.body.style.animation = 'none';
    setTimeout(() => {
      document.body.style.filter = 'hue-rotate(180deg)';
      setTimeout(() => { document.body.style.filter = ''; }, 3000);
    }, 10);
  }

    // ============ MOBILE SIDE MENU ============
  function initMobileMenu() {
    const menu = $('#side-menu');
    const openBtn = $('#menu-toggle');
    const closeBtn = $('#menu-close');
    if (!menu || !openBtn) return;

    const open = () => {
      menu.classList.add('active');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      menu.classList.remove('active');
      document.body.style.overflow = '';
    };

    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    $('.side-menu-backdrop', menu).addEventListener('click', close);
    $$('.side-menu-links a', menu).forEach(a => a.addEventListener('click', close));
  }

  // ============ MOBILE ACCORDION (About/Skills/Education) ============
  function initMobileAccordion() {
    const targets = [
      ...$$('.about-card'),
      ...$$('.skill-card'),
      ...$$('.timeline-item')
    ];

    targets.forEach(el => {
      el.addEventListener('click', () => {
        if (window.innerWidth > 600) return; // hanya aktif di mobile
        el.classList.toggle('expanded');
      });
    });
  }

  // ============ RESPONSIVE RE-RENDER (saat rotate/resize) ============
  function initResponsiveRerender() {
    let lastIsMobile = window.innerWidth <= 600;

    window.addEventListener('resize', debounce(() => {
      const isMobile = window.innerWidth <= 600;
      if (isMobile !== lastIsMobile) {
        lastIsMobile = isMobile;
        paginationState.artikel.page = 1;
        paginationState.proyek.page = 1;
        paginationState.karya.page = 1;
        renderArtikel();
        renderProyek();
        renderKarya();
      }
    }, 200));
  }

  // ============ INIT ============
  function initAfterLoad() {
    if (window.lucide) lucide.createIcons();
    initTyping();
    initCounters();
    initReveal();
    initChapterMarker();
    initKaryaFilter();
    initContactForm();
    initModal();
    initEasterEggs();
    loadAllData();
  }

  function init() {
    initLoader();
    initTheme();
    initNav();
    initMusic();
    initMobileMenu();        
    initMobileAccordion();   
    initResponsiveRerender(); 
    setTimeout(initThree, 100);
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();