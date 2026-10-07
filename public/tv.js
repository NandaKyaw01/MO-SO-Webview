/**
 * Digital Signage TV Client
 * Real-time media receiver using Socket.io and Mozilla PDF.js
 */

(function () {
  'use strict';

  // Configure PDF.js Worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/libs/pdfjs/pdf.worker.min.js';
  } else {
    console.error('PDF.js library failed to load');
  }

  // DOM Elements
  const tvImage = document.getElementById('tv-image');
  const tvCanvas = document.getElementById('tv-canvas');
  const standbyView = document.getElementById('standby-view');
  const loadingOverlay = document.getElementById('loading-overlay');
  const errorOverlay = document.getElementById('error-overlay');
  const statusToast = document.getElementById('status-toast');
  const toastText = document.getElementById('toast-text');
  const standbyStatusText = document.getElementById('standby-status-text');

  // State
  let currentMedia = null;
  let currentRenderTask = null;
  let currentPdfDoc = null;
  let toastTimeout = null;
  let mouseTimer = null;

  // 1. Toast Notification Helper
  function showToast(message, isError = false, duration = 3000) {
    if (!statusToast || !toastText) return;
    toastText.textContent = message;
    if (isError) {
      statusToast.classList.add('disconnected');
    } else {
      statusToast.classList.remove('disconnected');
    }
    statusToast.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      statusToast.classList.remove('show');
    }, duration);
  }

  // 2. Clear Active Displays
  function clearDisplay() {
    if (currentRenderTask) {
      try {
        currentRenderTask.cancel();
      } catch (e) {}
      currentRenderTask = null;
    }
    currentPdfDoc = null;

    tvImage.classList.remove('visible');
    tvImage.src = '';
    tvCanvas.classList.remove('visible');
    
    // Clear canvas buffer
    const ctx = tvCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, tvCanvas.width, tvCanvas.height);
  }

  // 3. Render Image Function
  function renderImage(media) {
    clearDisplay();
    loadingOverlay.classList.add('visible');
    errorOverlay.classList.remove('visible');
    standbyView.classList.add('hidden');

    const img = new Image();
    img.src = media.url;

    img.onload = () => {
      // Check if another update arrived while loading
      if (currentMedia && currentMedia.url !== media.url) return;

      tvImage.src = media.url;
      tvImage.classList.add('visible');
      loadingOverlay.classList.remove('visible');
      errorOverlay.classList.remove('visible');
      console.log(`[TV] Rendered image: ${media.originalname || media.filename}`);
    };

    img.onerror = (err) => {
      console.error('[TV] Failed to load image:', media.url, err);
      loadingOverlay.classList.remove('visible');
      errorOverlay.classList.add('visible');
    };
  }

  // 4. Render PDF Function (Page 1 onto Canvas via PDF.js)
  async function renderPdf(media) {
    clearDisplay();
    loadingOverlay.classList.add('visible');
    errorOverlay.classList.remove('visible');
    standbyView.classList.add('hidden');

    try {
      const fetchUrl = `${media.url}${media.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      console.log('[TV] Fetching PDF from:', fetchUrl);
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      
      const uint8 = new Uint8Array(arrayBuffer);
      const headerStr = String.fromCharCode.apply(null, Array.from(uint8.slice(0, 20)));
      console.log('[TV] PDF byte length:', arrayBuffer.byteLength, 'Header:', headerStr);

      const loadingTask = pdfjsLib.getDocument({
        data: uint8,
        cMapUrl: '/libs/pdfjs/cmaps/',
        cMapPacked: true
      });

      const pdf = await loadingTask.promise;
      currentPdfDoc = pdf;
      console.log('[TV] PDF parsed successfully! Pages:', pdf.numPages);

      // Render page 1
      await renderPdfPage(1);
    } catch (err) {
      if (err.name === 'RenderingCancelledException') return;
      console.error('[TV] PDF Loading Error:', err.name, err.message, err.stack);
      loadingOverlay.classList.remove('visible');
      errorOverlay.classList.add('visible');
    }
  }

  async function renderPdfPage(pageNumber = 1) {
    if (!currentPdfDoc) return;

    try {
      const page = await currentPdfDoc.getPage(pageNumber);

      // Compute display bounds to contain within 100vw and 100vh
      const screenWidth = window.innerWidth || window.outerWidth || 1920;
      const screenHeight = window.innerHeight || window.outerHeight || 1080;

      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scaleX = screenWidth / unscaledViewport.width;
      const scaleY = screenHeight / unscaledViewport.height;
      
      // Best fit scale factor (preserve aspect ratio)
      const containScale = Math.min(scaleX, scaleY) || 1.0;

      // Support High-DPI screens (Retina / 4K)
      const dpr = window.devicePixelRatio || 1;
      const renderViewport = page.getViewport({ scale: containScale * dpr });

      tvCanvas.width = Math.floor(renderViewport.width);
      tvCanvas.height = Math.floor(renderViewport.height);
      tvCanvas.style.width = `${Math.floor(renderViewport.width / dpr)}px`;
      tvCanvas.style.height = `${Math.floor(renderViewport.height / dpr)}px`;

      // Make canvas active in DOM
      tvCanvas.style.display = 'block';
      tvCanvas.classList.add('visible');

      const ctx = tvCanvas.getContext('2d', { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const renderContext = {
        canvasContext: ctx,
        viewport: renderViewport
      };

      if (currentRenderTask) {
        try {
          currentRenderTask.cancel();
        } catch (e) {}
      }

      currentRenderTask = page.render(renderContext);
      await currentRenderTask.promise;
      currentRenderTask = null;

      loadingOverlay.classList.remove('visible');
      errorOverlay.classList.remove('visible');
      console.log(`[TV] Rendered PDF page ${pageNumber} successfully`);
    } catch (err) {
      if (err.name === 'RenderingCancelledException') return;
      console.error('[TV] PDF Render Page Error:', err);
      loadingOverlay.classList.remove('visible');
      errorOverlay.classList.add('visible');
    }
  }

  // 5. Apply Media State
  function applyMedia(media) {
    currentMedia = media;

    if (!media || !media.url) {
      clearDisplay();
      loadingOverlay.classList.remove('visible');
      errorOverlay.classList.remove('visible');
      standbyView.classList.remove('hidden');
      return;
    }

    const type = (media.type || '').toLowerCase();

    if (type === 'pdf' || (media.url && media.url.toLowerCase().endsWith('.pdf'))) {
      renderPdf(media);
    } else {
      renderImage(media);
    }
  }

  // 6. Socket.io Connection & Events
  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  socket.on('connect', () => {
    console.log('[TV] Connected to Signage Server with ID:', socket.id);
    socket.emit('register_client', { role: 'tv' });
    showToast('TV Display Connected', false, 3000);
    if (standbyStatusText) standbyStatusText.textContent = 'Connected & Ready';
  });

  socket.on('disconnect', () => {
    console.warn('[TV] Disconnected from server');
    showToast('Connection Lost - Reconnecting...', true, 5000);
    if (standbyStatusText) standbyStatusText.textContent = 'Reconnecting...';
  });

  socket.on('media_update', (media) => {
    console.log('[TV] Received media_update event:', media);
    applyMedia(media);
  });

  // 7. Window Resize Handler (Recalculate PDF scale if PDF active)
  let resizeTimeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (currentMedia && currentMedia.type === 'pdf') {
        renderPdfPage(1);
      }
    }, 250);
  });

  // 8. Auto-hide cursor on inactivity
  function resetMouseTimer() {
    document.body.classList.remove('hide-cursor');
    clearTimeout(mouseTimer);
    mouseTimer = setTimeout(() => {
      document.body.classList.add('hide-cursor');
    }, 2000);
  }
  window.addEventListener('mousemove', resetMouseTimer);
  resetMouseTimer();

  // 9. Fullscreen toggle on double-click / tap for convenience
  window.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

})();
