/**
 * Digital Signage Admin Dashboard
 * Real-time control, upload management, and live monitor
 */

(function () {
  'use strict';

  // Configure PDF.js Worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/libs/pdfjs/pdf.worker.min.js';
  }

  // DOM Elements
  const serverStatusDot = document.getElementById('server-status-dot');
  const serverStatusText = document.getElementById('server-status-text');
  const tvCountText = document.getElementById('tv-count-text');

  // Monitor DOM
  const monitorBox = document.getElementById('monitor-box');
  const monitorEmpty = document.getElementById('monitor-empty');
  const monitorImg = document.getElementById('monitor-img');
  const monitorCanvas = document.getElementById('monitor-canvas');
  const monitorInfo = document.getElementById('monitor-info');
  const monitorFilename = document.getElementById('monitor-filename');
  const monitorMeta = document.getElementById('monitor-meta');
  const liveIndicatorBadge = document.getElementById('live-indicator-badge');
  const btnClearScreen = document.getElementById('btn-clear-screen');

  // Upload DOM
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const autoPushCheckbox = document.getElementById('auto-push-checkbox');
  const progressContainer = document.getElementById('progress-container');
  const progressFilename = document.getElementById('progress-filename');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');

  // Library DOM
  const mediaGrid = document.getElementById('media-grid');
  const libraryCount = document.getElementById('library-count');
  const filterTabs = document.querySelectorAll('.filter-tab');

  // Modal DOM
  const previewModal = document.getElementById('preview-modal');
  const modalClose = document.getElementById('modal-close');
  const modalFilename = document.getElementById('modal-filename');
  const modalImg = document.getElementById('modal-img');
  const modalCanvas = document.getElementById('modal-canvas');

  // App State
  let currentFilter = 'all';
  let mediaList = [];
  let activeMedia = null;
  let monitorRenderTask = null;
  let modalRenderTask = null;

  // Socket.io Connection
  const socket = io();

  socket.on('connect', () => {
    serverStatusDot.classList.remove('offline');
    serverStatusText.textContent = 'Connected';
    socket.emit('register_client', { role: 'admin' });
    fetchMediaLibrary();
  });

  socket.on('disconnect', () => {
    serverStatusDot.classList.add('offline');
    serverStatusText.textContent = 'Disconnected';
  });

  socket.on('stats_update', (stats) => {
    if (stats && typeof stats.tvCount === 'number') {
      const plural = stats.tvCount === 1 ? 'TV Screen' : 'TV Screens';
      tvCountText.textContent = `${stats.tvCount} ${plural} Connected`;
    }
  });

  socket.on('media_update', (media) => {
    activeMedia = media;
    updateLiveMonitor(media);
    renderLibrary();
  });

  socket.on('library_update', () => {
    fetchMediaLibrary();
  });

  // Helpers
  function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // 1. Fetch Media Library from Backend
  async function fetchMediaLibrary() {
    try {
      const res = await fetch('/api/media');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success) {
        mediaList = data.media || [];
        activeMedia = data.activeMedia || null;
        updateLiveMonitor(activeMedia);
        renderLibrary();
      }
    } catch (err) {
      console.error('Failed to load media library:', err);
    }
  }

  // 2. Render Media Library
  function renderLibrary() {
    const filtered = mediaList.filter((item) => {
      if (currentFilter === 'all') return true;
      return item.type === currentFilter;
    });

    libraryCount.textContent = `${filtered.length} of ${mediaList.length} items`;

    if (filtered.length === 0) {
      mediaGrid.innerHTML = `
        <div class="empty-gallery">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-main);">No media found</div>
          <div style="font-size: 0.85rem;">Upload an image or PDF to start broadcasting to your TV screen.</div>
        </div>
      `;
      return;
    }

    mediaGrid.innerHTML = filtered
      .map((item) => {
        const isLive = activeMedia && activeMedia.filename === item.filename;
        const isPdf = item.type === 'pdf';

        const thumbHtml = isPdf
          ? `<div class="pdf-thumb-placeholder">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span class="pdf-badge-tag">PDF DOCUMENT</span>
            </div>`
          : `<img class="card-thumb" src="${item.url}" alt="${item.originalname}" loading="lazy" />`;

        const liveBadge = isLive
          ? `<span class="card-live-badge">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></span>
              LIVE ON TV
            </span>`
          : '';

        const pushBtnClass = isLive ? 'btn btn-push is-active-btn' : 'btn btn-push';
        const pushBtnText = isLive ? '✓ Displaying on TV' : 'Push to TV';

        return `
          <div class="media-card ${isLive ? 'is-live' : ''}" data-filename="${item.filename}">
            <div class="card-thumb-wrap">
              ${liveBadge}
              <span class="card-type-badge">${item.type.toUpperCase()}</span>
              ${thumbHtml}
            </div>
            <div class="card-body">
              <div class="card-name" title="${item.originalname}">${item.originalname}</div>
              <div class="card-details">
                <span>${formatBytes(item.size)}</span>
                <span>${formatDate(item.uploadedAt)}</span>
              </div>
              <div class="card-actions">
                <button class="${pushBtnClass}" onclick="window.pushToTv('${item.filename}')" ${isLive ? 'disabled' : ''}>
                  <svg style="width: 15px; height: 15px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                  <span>${pushBtnText}</span>
                </button>
                <button class="btn-icon" title="Preview Media" onclick="window.previewMedia('${item.filename}')">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button class="btn-icon btn-delete" title="Delete File" onclick="window.deleteMedia('${item.filename}')">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // 3. Update Live Monitor Screen
  async function updateLiveMonitor(media) {
    if (monitorRenderTask) {
      try {
        monitorRenderTask.cancel();
      } catch (e) {}
      monitorRenderTask = null;
    }

    if (!media || !media.url) {
      monitorEmpty.style.display = 'flex';
      monitorImg.style.display = 'none';
      monitorCanvas.style.display = 'none';
      monitorInfo.style.display = 'none';
      liveIndicatorBadge.style.display = 'none';
      return;
    }

    liveIndicatorBadge.style.display = 'inline-flex';
    monitorInfo.style.display = 'flex';
    monitorFilename.textContent = media.originalname || media.filename;
    monitorMeta.textContent = `Broadcasting ${media.type.toUpperCase()} • Live`;

    if (media.type === 'pdf') {
      monitorEmpty.style.display = 'none';
      monitorImg.style.display = 'none';
      monitorCanvas.style.display = 'block';

      try {
        const fetchUrl = `${media.url}${media.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
        const response = await fetch(fetchUrl);
        const arrayBuffer = await response.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          cMapUrl: '/libs/pdfjs/cmaps/',
          cMapPacked: true
        });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1 });
        const boxWidth = monitorBox.clientWidth || 320;
        const scale = boxWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        monitorCanvas.width = scaledViewport.width;
        monitorCanvas.height = scaledViewport.height;

        const ctx = monitorCanvas.getContext('2d');
        monitorRenderTask = page.render({
          canvasContext: ctx,
          viewport: scaledViewport
        });
        await monitorRenderTask.promise;
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Monitor PDF render error:', err);
        }
      }
    } else {
      monitorEmpty.style.display = 'none';
      monitorCanvas.style.display = 'none';
      monitorImg.src = media.url;
      monitorImg.style.display = 'block';
    }
  }

  // 4. Push to TV Action
  window.pushToTv = async function (filename) {
    try {
      const res = await fetch('/api/active-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success) {
        activeMedia = data.activeMedia;
        updateLiveMonitor(activeMedia);
        renderLibrary();
      }
    } catch (err) {
      alert('Error broadcasting to TV: ' + err.message);
    }
  };

  // 5. Clear TV Screen Action
  btnClearScreen.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/active-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: null })
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success) {
        activeMedia = null;
        updateLiveMonitor(null);
        renderLibrary();
      }
    } catch (err) {
      alert('Error clearing screen: ' + err.message);
    }
  });

  // 6. Delete Media Action
  window.deleteMedia = async function (filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;

    try {
      const res = await fetch(`/api/media/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success) {
        fetchMediaLibrary();
      } else {
        alert('Failed to delete file: ' + data.error);
      }
    } catch (err) {
      alert('Error deleting file: ' + err.message);
    }
  };

  // 7. Preview Modal Action
  window.previewMedia = async function (filename) {
    const item = mediaList.find((m) => m.filename === filename);
    if (!item) return;

    modalFilename.textContent = item.originalname || item.filename;
    previewModal.classList.add('active');

    if (modalRenderTask) {
      try {
        modalRenderTask.cancel();
      } catch (e) {}
      modalRenderTask = null;
    }

    if (item.type === 'pdf') {
      modalImg.style.display = 'none';
      modalCanvas.style.display = 'block';

      try {
        const fetchUrl = `${item.url}${item.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
        const response = await fetch(fetchUrl);
        const arrayBuffer = await response.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          cMapUrl: '/libs/pdfjs/cmaps/',
          cMapPacked: true
        });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1.5 });
        modalCanvas.width = viewport.width;
        modalCanvas.height = viewport.height;

        const ctx = modalCanvas.getContext('2d');
        modalRenderTask = page.render({
          canvasContext: ctx,
          viewport: viewport
        });
        await modalRenderTask.promise;
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Modal PDF render error:', err);
        }
      }
    } else {
      modalCanvas.style.display = 'none';
      modalImg.src = item.url;
      modalImg.style.display = 'block';
    }
  };

  function closeModal() {
    previewModal.classList.remove('active');
    modalImg.src = '';
    if (modalRenderTask) {
      try {
        modalRenderTask.cancel();
      } catch (e) {}
      modalRenderTask = null;
    }
  }

  modalClose.addEventListener('click', closeModal);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewModal.classList.contains('active')) {
      closeModal();
    }
  });

  // 8. Upload File Handler
  function uploadFile(file) {
    if (!file) return;

    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      alert('Invalid file format. Please upload an image (.jpg, .png, .webp) or PDF file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    progressContainer.classList.add('active');
    progressFilename.textContent = `Uploading ${file.name}...`;
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBarFill.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
      }
    };

    xhr.onload = async () => {
      progressContainer.classList.remove('active');
      fileInput.value = '';

      if (xhr.status === 200 || xhr.status === 201) {
        const res = JSON.parse(xhr.responseText);
        if (res.success && res.file) {
          // If auto-push is enabled, push directly to TV!
          if (autoPushCheckbox.checked) {
            await window.pushToTv(res.file.filename);
          }
          fetchMediaLibrary();
        }
      } else if (xhr.status === 401) {
        window.location.href = '/login';
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          alert('Upload failed: ' + (errRes.error || 'Server error'));
        } catch (e) {
          alert('Upload failed with status ' + xhr.status);
        }
      }
    };

    xhr.onerror = () => {
      progressContainer.classList.remove('active');
      alert('Upload failed due to network error.');
    };

    xhr.send(formData);
  }

  // Dropzone Event Listeners
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  // Filter Tabs
  filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      filterTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderLibrary();
    });
  });

  // 9. Logout Handler
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await fetch('/api/logout', { method: 'POST' });
      } catch (err) {
        console.error('Logout error:', err);
      }
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    });
  }

  // Initial Load
  fetchMediaLibrary();
})();
