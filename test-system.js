const http = require('http');
const { io } = require('socket.io-client');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('  TESTING DIGITAL SIGNAGE & ADMIN AUTHENTICATION FLOW');
  console.log('========================================================\n');

  // 1. Unauthenticated access to /admin should redirect to /login (302)
  console.log('1. Checking Protected Route Redirection...');
  const unauthAdmin = await request('http://localhost:3000/admin');
  if (unauthAdmin.status === 302 && unauthAdmin.headers.location === '/login') {
    console.log(`[PASS] Unauthenticated GET /admin redirected to ${unauthAdmin.headers.location} (HTTP ${unauthAdmin.status})`);
  } else {
    throw new Error(`Expected 302 redirect to /login, got HTTP ${unauthAdmin.status}`);
  }

  // 2. Access Login Page (200 OK)
  console.log('\n2. Checking Login Page Availability...');
  const loginPage = await request('http://localhost:3000/login');
  if (loginPage.status === 200 && loginPage.data.includes('Digital Signage') && loginPage.data.includes('id="login-form"')) {
    console.log(`[PASS] GET /login: HTTP ${loginPage.status} (Contains Login Form and Modern UI elements)`);
  } else {
    throw new Error(`Failed to load login page properly (HTTP ${loginPage.status})`);
  }

  // 3. Test Invalid Credentials Login (401 Unauthorized)
  console.log('\n3. Testing Invalid Credentials Authentication...');
  const failedLogin = await request('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'admin', password: 'wrongpassword' }
  });
  const failedJson = JSON.parse(failedLogin.data);
  if (failedLogin.status === 401 && failedJson.success === false) {
    console.log(`[PASS] POST /api/login with wrong password rejected: HTTP ${failedLogin.status} ("${failedJson.error}")`);
  } else {
    throw new Error(`Expected 401 for wrong credentials, got HTTP ${failedLogin.status}`);
  }

  // 4. Test Valid Credentials Login (admin / maiifcs)
  console.log('\n4. Testing Valid Credentials Authentication...');
  const successLogin = await request('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'admin', password: 'maiifcs' }
  });
  const successJson = JSON.parse(successLogin.data);
  if (successLogin.status === 200 && successJson.success === true && successJson.token) {
    console.log(`[PASS] POST /api/login succeeded: HTTP ${successLogin.status} (User: "${successJson.user.username}")`);
  } else {
    throw new Error(`Expected successful login, got HTTP ${successLogin.status}`);
  }

  // Extract Session Cookie
  const setCookie = successLogin.headers['set-cookie'];
  if (!setCookie || !setCookie[0] || !setCookie[0].includes('admin_session=')) {
    throw new Error('Set-Cookie header missing admin_session token');
  }
  const sessionCookie = setCookie[0].split(';')[0];
  console.log(`[PASS] Session cookie received: ${sessionCookie.substring(0, 30)}...`);

  // 5. Test Authenticated Access to /admin with Cookie
  console.log('\n5. Testing Authenticated Access to Admin Dashboard...');
  const authAdmin = await request('http://localhost:3000/admin', {
    headers: { 'Cookie': sessionCookie }
  });
  if (authAdmin.status === 200 && authAdmin.data.includes('Digital Signage') && authAdmin.data.includes('btn-logout')) {
    console.log(`[PASS] GET /admin with session cookie: HTTP ${authAdmin.status} (Dashboard rendered with Logout button)`);
  } else {
    throw new Error(`Expected 200 for authenticated /admin, got HTTP ${authAdmin.status}`);
  }

  // 6. Test TV UI route (Publicly Accessible without Auth)
  console.log('\n6. Checking TV Display Route (Unrestricted for Kiosk Screens)...');
  const tvRes = await request('http://localhost:3000/tv');
  if (tvRes.status === 200 && tvRes.data.includes('tv-canvas')) {
    console.log(`[PASS] GET /tv: HTTP ${tvRes.status} (TV Client displays normally without login prompt)`);
  } else {
    throw new Error(`TV Route failed: HTTP ${tvRes.status}`);
  }

  // 7. Check Media List API Protection
  console.log('\n7. Checking Media API Security...');
  const unauthMedia = await request('http://localhost:3000/api/media');
  if (unauthMedia.status === 401) {
    console.log(`[PASS] Unauthenticated GET /api/media correctly blocked with HTTP 401 Unauthorized`);
  } else {
    throw new Error(`Expected 401 for unauthenticated /api/media, got ${unauthMedia.status}`);
  }

  const authMedia = await request('http://localhost:3000/api/media', {
    headers: { 'Cookie': sessionCookie }
  });
  const mediaData = JSON.parse(authMedia.data);
  if (authMedia.status === 200 && mediaData.success) {
    console.log(`[PASS] Authenticated GET /api/media: Found ${mediaData.media.length} media items:`, mediaData.media.map(m => m.originalname));
  } else {
    throw new Error(`Failed to load media with valid session: HTTP ${authMedia.status}`);
  }

  // 8. Test Socket.io Synchronization & Active Media Push
  console.log('\n8. Testing Real-Time Socket.io Synchronization...');
  const socket = io('http://localhost:3000');

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket timeout')), 7000);

    socket.on('connect', () => {
      console.log(`[PASS] Socket connected with ID: ${socket.id}`);
      socket.emit('register_client', { role: 'tv' });
    });

    socket.on('media_update', async (media) => {
      console.log(`[PASS] Received socket media_update:`, media ? `${media.originalname} (${media.type})` : 'null (Standby)');
      
      // If we received initial media, trigger active media push
      if (media && media.type === 'image') {
        console.log('\n[Triggering Push to TV]: Switching active media to PDF with auth cookie...');
        const pushRes = await request('http://localhost:3000/api/active-media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': sessionCookie
          },
          body: { filename: 'sample_event_schedule.pdf' }
        });
        const pushData = JSON.parse(pushRes.data);
        console.log('[PASS] POST /api/active-media response:', pushData.activeMedia.originalname);
      } else if (media && media.type === 'pdf') {
        console.log('[PASS] Successfully received PDF broadcast over WebSocket on TV Client!');
        clearTimeout(timer);
        socket.disconnect();
        resolve();
      }
    });
  });

  // 9. Test Logout Endpoint
  console.log('\n9. Testing Logout Endpoint...');
  const logoutRes = await request('http://localhost:3000/api/logout', {
    method: 'POST',
    headers: { 'Cookie': sessionCookie }
  });
  const logoutJson = JSON.parse(logoutRes.data);
  if (logoutRes.status === 200 && logoutJson.success) {
    console.log(`[PASS] POST /api/logout: HTTP ${logoutRes.status} ("${logoutJson.message}")`);
  } else {
    throw new Error(`Logout failed with HTTP ${logoutRes.status}`);
  }

  // Verify cookie is cleared in response
  const clearedCookie = logoutRes.headers['set-cookie'];
  if (clearedCookie && clearedCookie[0] && clearedCookie[0].includes('Max-Age=0')) {
    console.log(`[PASS] Session cookie cleared via Set-Cookie Max-Age=0`);
  }

  console.log('\n========================================================');
  console.log('  ALL INTEGRATION & AUTHENTICATION TESTS PASSED 100%!');
  console.log('========================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\nTest Failed:', err);
  process.exit(1);
});
