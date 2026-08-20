/* ============================================================
   SHADOW.PROTOCOL — Admin Panel Logic (FINAL v2.0)
   ============================================================ */

(function() {
  'use strict';

  // ============ CONFIG ============
  const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbx1E2HUIQ47EBE_9KI0gF7TL4kjY-uI-uwLncJAFUlyZP3Fwa4ix7UoVCEOueP8268-/exec',
    API_TOKEN: 'AIienoqhrnc526j'
  };

  // ============ STATE ============
  const state = {
    isAuthenticated: false,
    currentTab: 'artikel',
    items: [],
    editingId: null,
    deletingId: null,
    editor: null,
    editorMode: 'visual' // ← TAMBAHKAN INI
  };

  // ============ UTILITIES ============
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function decodeHtmlEntities(str) {
    if (!str) return '';
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
  }

  function normalizeContent(content) {
    if (!content) return '';
    let out = String(content);
    const escapedTagRegex = /&lt;\/?[a-zA-Z][^&]*?&gt;/;
    let guard = 0;
    while (escapedTagRegex.test(out) && guard < 3) {
      out = decodeHtmlEntities(out);
      guard++;
    }
    return out;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
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

  function showToast(message, type = 'success') {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // ============ HELPER: Get content dari editor (visual ATAU HTML source) ============
  function getContentFromEditor() {
    if (state.editorMode === 'html') {
      return normalizeContent($('#editor-html-source').value.trim());
    }
    return normalizeContent(state.editor.root.innerHTML);
  }

  // ============ HELPER: Switch editor mode (Visual ↔ HTML Source) ============
  function switchEditorMode(mode) {
    if (state.editorMode === mode) return;

    const quillEl = $('#editor-content');
    const sourceEl = $('#editor-html-source');
    const btnVisual = $('#mode-visual');
    const btnHtml = $('#mode-html');

    if (mode === 'html') {
      // Visual → HTML: decode dulu biar nggak double-escape
      sourceEl.value = normalizeContent(state.editor.root.innerHTML);
      quillEl.style.display = 'none';
      sourceEl.style.display = 'block';
      btnHtml.classList.add('active');
      btnVisual.classList.remove('active');
      state.editorMode = 'html';
    } else {
      // HTML → Visual: parse raw HTML ke Quill
      const raw = sourceEl.value.trim();
      if (raw) {
        state.editor.clipboard.dangerouslyPasteHTML(normalizeContent(raw));
      }
      sourceEl.style.display = 'none';
      quillEl.style.display = 'block';
      btnVisual.classList.add('active');
      btnHtml.classList.remove('active');
      state.editorMode = 'visual';
    }
  }

  // ============ AUTH ============
  function checkAuth() {
    const sessionCode = sessionStorage.getItem('adminSession');
    if (sessionCode === CONFIG.API_TOKEN) {
      state.isAuthenticated = true;
      showDashboard();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    $('#login-screen').style.display = 'flex';
    $('#admin-dashboard').style.display = 'none';
  }

  function showDashboard() {
    $('#login-screen').style.display = 'none';
    $('#admin-dashboard').style.display = 'block';
    loadItems();
  }

  function initLogin() {
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = $('#admin-code').value.trim();
      const btn = $('#login-btn');
      const alert = $('#login-alert');

      if (!code) {
        showLoginAlert('Please enter admin code', 'error');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Verifying...';

      try {
        const res = await fetch(`${CONFIG.API_URL}?action=login&token=${encodeURIComponent(CONFIG.API_TOKEN)}&code=${encodeURIComponent(code)}`);
        const data = await res.json();

        if (data.success) {
          sessionStorage.setItem('adminSession', CONFIG.API_TOKEN);
          state.isAuthenticated = true;
          showLoginAlert('Access granted! Redirecting...', 'success');
          setTimeout(showDashboard, 1000);
        } else {
          showLoginAlert('Invalid admin code', 'error');
        }
      } catch (err) {
        showLoginAlert('Connection error. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="lock" class="lucide icon-sm"></i> Unlock';
        if (window.lucide) lucide.createIcons();
      }
    });

    $('#logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem('adminSession');
      state.isAuthenticated = false;
      showLogin();
    });
  }

  function showLoginAlert(message, type) {
    const alert = $('#login-alert');
    alert.textContent = message;
    alert.className = 'login-alert ' + type;
    alert.style.display = 'block';
  }

  // ============ DATA LOADING ============
  async function loadItems() {
    const container = $('#content-list');
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading ${state.currentTab}...</p>
      </div>
    `;

    try {
      const tab = state.currentTab === 'artikel' ? 'ARTIKEL' : 'PROYEK';
      const url = `${CONFIG.API_URL}?tab=${tab}&token=${encodeURIComponent(CONFIG.API_TOKEN)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) throw new Error(data.error);
      state.items = Array.isArray(data) ? data : [];
      
      applySort();
      renderItems();
      updateItemCount();
    } catch (err) {
      container.innerHTML = `
        <div class="loading-state">
          <p style="color: var(--error);">Error loading data: ${err.message}</p>
        </div>
      `;
    }
  }

  function applySort() {
    const sortValue = $('#sort-select').value;
    
    state.items.sort((a, b) => {
      switch (sortValue) {
        case 'date-desc':
          return new Date(b.tanggal || 0) - new Date(a.tanggal || 0);
        case 'date-asc':
          return new Date(a.tanggal || 0) - new Date(b.tanggal || 0);
        case 'title-asc':
          return (a.judul || '').localeCompare(b.judul || '');
        case 'title-desc':
          return (b.judul || '').localeCompare(a.judul || '');
        case 'views-desc':
          return (parseInt(b.views) || 0) - (parseInt(a.views) || 0);
        default:
          return 0;
      }
    });
  }

  function renderItems() {
    const container = $('#content-list');
    
    if (!state.items.length) {
      container.innerHTML = `
        <div class="loading-state">
          <p>No items found. Click "Add New" to create one.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.items.map(item => `
      <div class="content-item" data-id="${item.id}">
        <div class="content-item-thumb">
          <img src="${item.thumbnail_url || 'https://via.placeholder.com/100x100/1f2937/60a5fa?text=No+Image'}" alt="" loading="lazy" onerror="this.src='https://via.placeholder.com/100x100/1f2937/60a5fa?text=No+Image'" />
        </div>
        <div class="content-item-info">
          <div class="content-item-title">${escapeHtml(item.judul)}</div>
          <div class="content-item-meta">
            <span><i data-lucide="tag" class="lucide icon-sm"></i> ${escapeHtml(item.kategori || 'Uncategorized')}</span>
            <span><i data-lucide="calendar" class="lucide icon-sm"></i> ${formatDate(item.tanggal)}</span>
            <span><i data-lucide="eye" class="lucide icon-sm"></i> ${item.views || 0} views</span>
          </div>
        </div>
        <div class="content-item-actions">
          <button class="icon-btn-sm edit-btn" title="Edit">
            <i data-lucide="edit-3" class="lucide icon-sm"></i>
          </button>
          <button class="icon-btn-sm danger delete-btn" title="Delete">
            <i data-lucide="trash-2" class="lucide icon-sm"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
    attachItemListeners();
  }

  function attachItemListeners() {
    $$('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.content-item');
        const id = item.dataset.id;
        openEditor(id);
      });
    });

    $$('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.content-item');
        const id = item.dataset.id;
        openDeleteModal(id);
      });
    });
  }

  function updateItemCount() {
    $('#item-count').textContent = `${state.items.length} items`;
  }

  // ============ TABS ============
  function initTabs() {
    $$('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentTab = tab.dataset.tab;
        $('#toolbar-title').textContent = state.currentTab === 'artikel' ? 'Artikel' : 'Proyek';
        
        const isProyek = state.currentTab === 'proyek';
        
        const dateRow = $('#editor-date-row');
        const dateInput = $('#editor-tanggal');
        if (isProyek) {
          dateRow.style.display = 'none';
          dateInput.removeAttribute('required');
          dateInput.value = '';
        } else {
          dateRow.style.display = 'flex';
          dateInput.setAttribute('required', '');
          if (!dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
          }
        }
        
        $('#editor-tech-row').style.display = isProyek ? 'flex' : 'none';
        $('#editor-links-row').style.display = isProyek ? 'flex' : 'none';
        
        loadItems();
      });
    });
  }

  // ============ SORT ============
  function initSort() {
    $('#sort-select').addEventListener('change', () => {
      applySort();
      renderItems();
    });
  }

  // ============ EDITOR ============
  function initEditor() {
    // Initialize Quill editor
    state.editor = new Quill('#editor-content', {
      theme: 'snow',
      placeholder: 'Write your content here... Use H2/H3 for accordion sections.',
      modules: {
        toolbar: [
          [{ 'header': [2, 3, 4, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['link', 'image', 'code-block'],
          ['clean']
        ]
      }
    });

    // Mode toggle: Visual ↔ HTML Source
    $('#mode-visual').addEventListener('click', () => switchEditorMode('visual'));
    $('#mode-html').addEventListener('click', () => switchEditorMode('html'));

    // Add New button
    $('#add-new-btn').addEventListener('click', () => {
      openEditor(null);
    });

    // Close buttons
    $('#editor-close').addEventListener('click', closeEditor);
    $('#editor-cancel').addEventListener('click', closeEditor);
    $('.modal-backdrop', $('#editor-modal')).addEventListener('click', closeEditor);

    // Form submit
    $('#editor-form').addEventListener('submit', saveItem);

    // Thumbnail preview
    $('#editor-thumbnail').addEventListener('input', () => {
      const url = $('#editor-thumbnail').value.trim();
      const preview = $('#thumbnail-preview');
      const img = $('#preview-img');
      
      if (url) {
        img.src = url;
        preview.style.display = 'block';
        img.onerror = () => {
          preview.style.display = 'none';
        };
      } else {
        preview.style.display = 'none';
      }
    });
  }

  function openEditor(itemId) {
    state.editingId = itemId;
    const modal = $('#editor-modal');
    
    // Reset form & mode
    $('#editor-form').reset();
    state.editor.setContents([]);
    $('#editor-html-source').value = '';
    if (state.editorMode === 'html') {
      switchEditorMode('visual'); // Reset ke visual mode
    }
    $('#thumbnail-preview').style.display = 'none';
    
    // Reset required fields berdasarkan current tab
    const isProyek = state.currentTab === 'proyek';
    const dateInput = $('#editor-tanggal');
    
    if (isProyek) {
      $('#editor-date-row').style.display = 'none';
      dateInput.removeAttribute('required');
      $('#editor-tech-row').style.display = 'flex';
      $('#editor-links-row').style.display = 'flex';
    } else {
      $('#editor-date-row').style.display = 'flex';
      dateInput.setAttribute('required', '');
      $('#editor-tech-row').style.display = 'none';
      $('#editor-links-row').style.display = 'none';
    }

    if (itemId) {
      // Edit mode
      const item = state.items.find(i => String(i.id) === String(itemId));
      if (!item) return;

      $('#editor-title').textContent = `Edit ${state.currentTab === 'artikel' ? 'Artikel' : 'Proyek'}`;
      $('#editor-id').value = item.id;
      $('#editor-judul').value = item.judul || '';
      $('#editor-kategori').value = item.kategori || '';
      $('#editor-views').value = item.views || 0;

      if (state.currentTab === 'artikel') {
        dateInput.value = item.tanggal || new Date().toISOString().split('T')[0];
        if (item.konten) {
          // ← NORMALIZE DULU sebelum paste ke Quill
          state.editor.clipboard.dangerouslyPasteHTML(normalizeContent(item.konten));
        }
      } else {
        $('#editor-tech').value = item.tech_stack || '';
        $('#editor-link-live').value = item.link_live || '';
        $('#editor-link-github').value = item.link_github || '';
        if (item.deskripsi) {
          // ← NORMALIZE DULU sebelum paste ke Quill
          state.editor.clipboard.dangerouslyPasteHTML(normalizeContent(item.deskripsi));
        }
      }

      if (item.thumbnail_url) {
        $('#editor-thumbnail').value = item.thumbnail_url;
        $('#preview-img').src = item.thumbnail_url;
        $('#thumbnail-preview').style.display = 'block';
      }
    } else {
      // Add mode
      $('#editor-title').textContent = `Add New ${state.currentTab === 'artikel' ? 'Artikel' : 'Proyek'}`;
      $('#editor-id').value = '';
      if (!isProyek) {
        dateInput.value = new Date().toISOString().split('T')[0];
      }
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons();
  }

  function closeEditor() {
    $('#editor-modal').classList.remove('active');
    document.body.style.overflow = '';
    state.editingId = null;
  }

  async function saveItem(e) {
    e.preventDefault();
    
    const btn = $('#editor-save');
    const originalHTML = btn.innerHTML;

    // Manual validation (novalidate form)
    const judul = $('#editor-judul').value.trim();
    const kategori = $('#editor-kategori').value;
    const content = getContentFromEditor();
    
    if (!judul) {
      showToast('Title is required', 'error');
      $('#editor-judul').focus();
      return;
    }
    
    if (!kategori) {
      showToast('Category is required', 'error');
      $('#editor-kategori').focus();
      return;
    }
    
    // Cek konten kosong
    const emptyContentPatterns = ['<p><br></p>', '<p></p>', '', '<p>&nbsp;</p>'];
    if (!content || emptyContentPatterns.includes(content.trim())) {
      showToast('Content is required', 'error');
      return;
    }
    
    // Date validation hanya untuk artikel
    if (state.currentTab === 'artikel') {
      const tanggal = $('#editor-tanggal').value;
      if (!tanggal) {
        showToast('Date is required for articles', 'error');
        $('#editor-tanggal').focus();
        return;
      }
    }
    
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Saving...';

    const data = {
      id: $('#editor-id').value || generateId(),
      judul: judul,
      kategori: kategori,
      thumbnail_url: $('#editor-thumbnail').value.trim(),
      views: parseInt($('#editor-views').value) || 0,
      // ← PAKAI content yang sudah dari getContentFromEditor()
      konten: state.currentTab === 'artikel' ? content : '',
      deskripsi: state.currentTab === 'proyek' ? content : '',
      tanggal: state.currentTab === 'artikel' ? $('#editor-tanggal').value : '',
      tech_stack: state.currentTab === 'proyek' ? $('#editor-tech').value.trim() : '',
      link_live: state.currentTab === 'proyek' ? $('#editor-link-live').value.trim() : '',
      link_github: state.currentTab === 'proyek' ? $('#editor-link-github').value.trim() : ''
    };

    try {
      const tab = state.currentTab === 'artikel' ? 'ARTIKEL' : 'PROYEK';
      const url = `${CONFIG.API_URL}?action=save&tab=${tab}&token=${encodeURIComponent(CONFIG.API_TOKEN)}`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data)
      });
      
      const result = await res.json();
      
      if (result.success) {
        showToast('Item saved successfully!', 'success');
        closeEditor();
        loadItems();
      } else {
        throw new Error(result.error || 'Failed to save');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      if (window.lucide) lucide.createIcons();
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // ============ DELETE ============
  function initDelete() {
    $('#delete-cancel').addEventListener('click', closeDeleteModal);
    $('.modal-backdrop', $('#delete-modal')).addEventListener('click', closeDeleteModal);
    $('#delete-confirm').addEventListener('click', confirmDelete);
  }

  function openDeleteModal(itemId) {
    state.deletingId = itemId;
    const item = state.items.find(i => String(i.id) === String(itemId));
    $('#delete-message').textContent = `Are you sure you want to delete "${item?.judul || 'this item'}"? This action cannot be undone.`;
    $('#delete-modal').classList.add('active');
  }

  function closeDeleteModal() {
    $('#delete-modal').classList.remove('active');
    state.deletingId = null;
  }

  async function confirmDelete() {
    if (!state.deletingId) return;

    const btn = $('#delete-confirm');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Deleting...';

    try {
      const tab = state.currentTab === 'artikel' ? 'ARTIKEL' : 'PROYEK';
      const url = `${CONFIG.API_URL}?action=delete&tab=${tab}&id=${state.deletingId}&token=${encodeURIComponent(CONFIG.API_TOKEN)}`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'delete' })
      });
      
      const result = await res.json();
      
      if (result.success) {
        showToast('Item deleted successfully!', 'success');
        closeDeleteModal();
        loadItems();
      } else {
        throw new Error(result.error || 'Failed to delete');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      if (window.lucide) lucide.createIcons();
    }
  }

  // ============ INIT ============
  function init() {
    if (window.lucide) lucide.createIcons();
    checkAuth();
    initLogin();
    initTabs();
    initSort();
    initEditor();
    initDelete();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();