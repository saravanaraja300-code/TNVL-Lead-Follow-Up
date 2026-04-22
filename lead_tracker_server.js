const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3030;
// Same Google Sheets URL you provided
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSXsdx0UFbCKXSCYwGzxEC5iRO-L31puQ_Ta3xBGRIwyxCW7-PGSmsRfX9bJ3yFdY6DB7RzN98WvcRe/pub?output=csv';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/data') {
    fetchWithRedirects(SHEET_URL, res);
  } else {
    const filePath = path.join(__dirname, 'lead_tracker_dashboard.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('File not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  }
});

function fetchWithRedirects(url, res, redirectCount = 0) {
  if (redirectCount > 5) { res.writeHead(500); res.end('Too many redirects'); return; }
  
  https.get(url, (zohoRes) => {
    if ([301, 302, 303, 307, 308].includes(zohoRes.statusCode) && zohoRes.headers.location) {
      zohoRes.resume();
      fetchWithRedirects(zohoRes.headers.location, res, redirectCount + 1);
      return;
    }
    let data = '';
    zohoRes.on('data', chunk => data += chunk);
    zohoRes.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/csv' });
      res.end(data);
    });
  }).on('error', (err) => {
    res.writeHead(500); res.end('Error: ' + err.message);
  });
}

server.listen(PORT, () => {
  console.log('');
  console.log('✅ Lead Tracker Server running (Google Sheets Mode)!');
  console.log(`   Open in browser: http://localhost:${PORT}`);
  console.log('');
  console.log('   Press Ctrl+C to stop.');
  console.log('');
});
