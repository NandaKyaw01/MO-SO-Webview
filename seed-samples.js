const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 1. Copy generated sample image
const generatedImagePath = 'C:\\Users\\might\\.gemini\\antigravity-ide\\brain\\f623c337-4a2a-4196-a2be-029a2bed504b\\signage_promo_sample_1791195804832.jpg';
const destImageName = 'sample_tech_expo_poster.jpg';
const destImagePath = path.join(uploadsDir, destImageName);

if (fs.existsSync(generatedImagePath)) {
  fs.copyFileSync(generatedImagePath, destImagePath);
  console.log(`Copied sample image to: ${destImagePath}`);
}

// 2. Generate a 100% compliant, beautiful landscape PDF (1920 x 1080) using pdf-lib
async function createSampleSignagePdf() {
  const pdfDoc = await PDFDocument.create();
  
  // 1920x1080 Landscape TV resolution
  const page = pdfDoc.addPage([1920, 1080]);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    color: rgb(0.04, 0.05, 0.08) // Deep dark background #0a0c14
  });

  // Top Accent Banner Bar
  page.drawRectangle({
    x: 0,
    y: 1060,
    width: 1920,
    height: 20,
    color: rgb(0.31, 0.27, 0.90) // Indigo
  });

  // Header Title
  page.drawText('CAMPUS INNOVATION HUB', {
    x: 120,
    y: 930,
    size: 56,
    font: helveticaBold,
    color: rgb(0.95, 0.95, 1.0)
  });

  page.drawText('DAILY SCHEDULE & SEMINAR SESSIONS', {
    x: 120,
    y: 870,
    size: 28,
    font: helvetica,
    color: rgb(0.4, 0.7, 0.98) // Cyan blue
  });

  // Card 1
  page.drawRectangle({
    x: 120,
    y: 540,
    width: 800,
    height: 260,
    color: rgb(0.09, 0.11, 0.18),
    borderColor: rgb(0.2, 0.25, 0.35),
    borderWidth: 2
  });

  page.drawText('MORNING SESSIONS', {
    x: 160,
    y: 740,
    size: 26,
    font: helveticaBold,
    color: rgb(0.2, 0.85, 0.5) // Emerald
  });

  page.drawText('09:00 AM - 10:30 AM', {
    x: 160,
    y: 690,
    size: 20,
    font: helveticaBold,
    color: rgb(0.7, 0.75, 0.85)
  });
  page.drawText('Keynote: The Architecture of Real-Time Digital Signage', {
    x: 160,
    y: 660,
    size: 22,
    font: helvetica,
    color: rgb(0.9, 0.9, 0.95)
  });

  page.drawText('10:45 AM - 12:15 PM', {
    x: 160,
    y: 605,
    size: 20,
    font: helveticaBold,
    color: rgb(0.7, 0.75, 0.85)
  });
  page.drawText('Workshop: High-DPI PDF.js Rendering & Hardware Kiosk Modes', {
    x: 160,
    y: 575,
    size: 22,
    font: helvetica,
    color: rgb(0.9, 0.9, 0.95)
  });

  // Card 2
  page.drawRectangle({
    x: 980,
    y: 540,
    width: 820,
    height: 260,
    color: rgb(0.09, 0.11, 0.18),
    borderColor: rgb(0.2, 0.25, 0.35),
    borderWidth: 2
  });

  page.drawText('AFTERNOON SESSIONS', {
    x: 1020,
    y: 740,
    size: 26,
    font: helveticaBold,
    color: rgb(0.5, 0.4, 0.95) // Purple
  });

  page.drawText('01:30 PM - 03:00 PM', {
    x: 1020,
    y: 690,
    size: 20,
    font: helveticaBold,
    color: rgb(0.7, 0.75, 0.85)
  });
  page.drawText('Panel: Scalable IoT Display Networks in Smart Campuses', {
    x: 1020,
    y: 660,
    size: 22,
    font: helvetica,
    color: rgb(0.9, 0.9, 0.95)
  });

  page.drawText('03:15 PM - 05:00 PM', {
    x: 1020,
    y: 605,
    size: 20,
    font: helveticaBold,
    color: rgb(0.7, 0.75, 0.85)
  });
  page.drawText('Showcase: Live Multi-Display Synchronized Broadcasts', {
    x: 1020,
    y: 575,
    size: 22,
    font: helvetica,
    color: rgb(0.9, 0.9, 0.95)
  });

  // Bottom Status Badge Banner
  page.drawRectangle({
    x: 120,
    y: 360,
    width: 1680,
    height: 100,
    color: rgb(0.06, 0.14, 0.1),
    borderColor: rgb(0.1, 0.6, 0.3),
    borderWidth: 1.5
  });

  page.drawText('LIVE DIGITAL SIGNAGE DISPLAY - BROADCAST VIA MOZILLA PDF.JS CANVAS RENDERER', {
    x: 200,
    y: 405,
    size: 22,
    font: helveticaBold,
    color: rgb(0.2, 0.9, 0.5)
  });

  const pdfBytes = await pdfDoc.save();
  const destPdfName = 'sample_event_schedule.pdf';
  const destPdfPath = path.join(uploadsDir, destPdfName);

  fs.writeFileSync(destPdfPath, pdfBytes);
  console.log(`Generated standard compliant PDF to: ${destPdfPath} (${pdfBytes.length} bytes)`);

  // Populate metadata.json
  const metadataPath = path.join(uploadsDir, 'metadata.json');
  const meta = {
    [destImageName]: {
      filename: destImageName,
      originalname: 'Tech Expo 2026 Poster.jpg',
      size: fs.existsSync(destImagePath) ? fs.statSync(destImagePath).size : 1024,
      mimetype: 'image/jpeg',
      type: 'image',
      url: `/uploads/${destImageName}`,
      uploadedAt: new Date(Date.now() - 3600000).toISOString()
    },
    [destPdfName]: {
      filename: destPdfName,
      originalname: 'Daily Campus Event Schedule.pdf',
      size: pdfBytes.length,
      mimetype: 'application/pdf',
      type: 'pdf',
      url: `/uploads/${destPdfName}`,
      uploadedAt: new Date().toISOString()
    }
  };

  fs.writeFileSync(metadataPath, JSON.stringify(meta, null, 2), 'utf-8');
  console.log('Sample media initialized with compliant PDF.');
}

createSampleSignagePdf().catch(console.error);
