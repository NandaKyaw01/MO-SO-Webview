const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function testPdf() {
  const pdfPath = path.join(__dirname, 'uploads', 'sample_event_schedule.pdf');
  console.log('Testing PDF file:', pdfPath);
  
  if (!fs.existsSync(pdfPath)) {
    console.error('File does not exist!');
    process.exit(1);
  }

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  console.log('Data length:', data.length);

  try {
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    console.log('PDF loaded successfully! Number of pages:', pdf.numPages);
    
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    console.log('Page 1 viewport:', viewport.width, 'x', viewport.height);
    console.log('PDF verification SUCCESSFUL!');
  } catch (err) {
    console.error('PDF loading failed:', err);
    process.exit(1);
  }
}

testPdf();
