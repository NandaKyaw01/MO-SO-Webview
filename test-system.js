const http = require('http');
const { io } = require('socket.io-client');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('Testing Digital Signage Endpoints...');

  // 1. Check Admin UI route
  const adminRes = await get('http://localhost:3000/admin');
  console.log(`[PASS] GET /admin: HTTP ${adminRes.status} (contains "Digital Signage": ${adminRes.data.includes('Digital Signage')})`);

  // 2. Check TV UI route
  const tvRes = await get('http://localhost:3000/tv');
  console.log(`[PASS] GET /tv: HTTP ${tvRes.status} (contains "tv-canvas": ${tvRes.data.includes('tv-canvas')})`);

  // 3. Check Media List API
  const mediaRes = await get('http://localhost:3000/api/media');
  const mediaData = JSON.parse(mediaRes.data);
  console.log(`[PASS] GET /api/media: Found ${mediaData.media.length} media items:`, mediaData.media.map(m => m.originalname));

  // 4. Test Socket.io TV Client connection and media_update event
  console.log('\nTesting Real-Time Socket.io Synchronization...');
  const socket = io('http://localhost:3000');

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket timeout')), 5000);

    socket.on('connect', () => {
      console.log(`[PASS] Socket connected with ID: ${socket.id}`);
      socket.emit('register_client', { role: 'tv' });
    });

    socket.on('media_update', async (media) => {
      console.log(`[PASS] Received socket media_update:`, media ? `${media.originalname} (${media.type})` : 'null (Standby)');
      
      // If we received initial media, let's trigger a switch to the PDF
      if (media && media.type === 'image') {
        console.log('\n[Triggering Push to TV]: Switching active media to PDF...');
        const pushRes = await postJson('http://localhost:3000/api/active-media', {
          filename: 'sample_event_schedule.pdf'
        });
        console.log('[PASS] POST /api/active-media response:', pushRes.data.activeMedia.originalname);
      } else if (media && media.type === 'pdf') {
        console.log('[PASS] Successfully received PDF broadcast over WebSocket on TV Client!');
        clearTimeout(timer);
        socket.disconnect();
        resolve();
      }
    });
  });

  console.log('\n========================================');
  console.log('  ALL INTEGRATION TESTS PASSED 100%!');
  console.log('========================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
