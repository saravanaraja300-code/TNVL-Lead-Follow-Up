require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const nodemailer = require('nodemailer');
const url = require('url');

const PORT = process.env.PORT || 3030;
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSXsdx0UFbCKXSCYwGzxEC5iRO-L31puQ_Ta3xBGRIwyxCW7-PGSmsRfX9bJ3yFdY6DB7RzN98WvcRe/pub?output=csv';

async function handleEmailRequest(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const { toEmail, subject, reportData } = JSON.parse(body);
      
      console.log('📧 Lead Tracker Email request:', {
        toEmail,
        subject,
        hasReportData: !!reportData,
        totalLeads: reportData?.totalLeads || 0
      });

      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('❌ Email failed: Missing EMAIL_USER or EMAIL_PASS in .env');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ 
          success: false, 
          message: 'Email credentials missing in server .env',
          troubleshooting: 'Set EMAIL_USER and EMAIL_PASS in your .env file'
        }));
      }

      // Use the same robust transporter configuration as TNVL
      const transporter = nodemailer.createTransporter({
        host: 'smtppro.zoho.com',
        port: 465,
        secure: true,
        authMethod: 'LOGIN',
        auth: {
          type: 'login',
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 30000,
        greetingTimeout: 15000,
        socketTimeout: 45000,
        pool: true,
        maxConnections: 5,
        maxMessages: 100
      });

      const htmlContent = generateEmailHTML(reportData);

      const mailOptions = {
        from: `"Lead Tracker Dashboard" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: subject,
        html: htmlContent
      };

      console.log(`📨 Sending Lead Tracker report to: ${toEmail}...`);
      const startTime = Date.now();
      const info = await transporter.sendMail(mailOptions);
      const duration = Date.now() - startTime;
      console.log(`✅ Lead Tracker email sent successfully in ${duration}ms:`, info.messageId);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'Lead Tracker report sent successfully!', 
        messageId: info.messageId, 
        duration 
      }));
    } catch (error) {
      console.error('❌ Lead Tracker Email Error Details:', {
        code: error.code,
        message: error.message,
        errno: error.errno,
        syscall: error.syscall,
        address: error.address,
        port: error.port
      });

      let userMessage = 'Failed to send Lead Tracker report';
      if (error.code === 'EAUTH') {
        userMessage = 'Authentication failed. Check Zoho credentials or use an App Password (accounts.zoho.com → Security → App Passwords).';
      } else if (error.code === 'ECONNREFUSED') {
        userMessage = 'Connection refused. Port 465 may be blocked by your hosting firewall — contact your host to open outbound port 465.';
      } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        userMessage = 'Connection timed out. Firewall may be blocking port 465. Try whitelisting smtp.zoho.com:465.';
      } else if (error.code === 'ENOTFOUND') {
        userMessage = 'DNS resolution failed. Cannot reach smtp.zoho.com — check server DNS settings.';
      } else if (error.code === 'EHOSTUNREACH') {
        userMessage = 'Host unreachable. Check network connectivity on the server.';
      }

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: userMessage,
        details: error.message,
        code: error.code,
        troubleshooting: {
          step1: "Ensure outbound port 465 is open on your server/hosting firewall",
          step2: "Generate a Zoho App Password at accounts.zoho.com → Security → App Passwords",
          step3: "Use the App Password as EMAIL_PASS in your .env (not your login password)",
          step4: "Make sure your Zoho email account is properly configured"
        }
      }));
    }
  });
}

function generateEmailHTML(reportData) {
  const totalLeads = reportData.totalLeads || 0;
  const statusCounts = reportData.statusCounts || {};
  const recentLeads = reportData.recentLeads || [];

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #333; margin-bottom: 10px; }
        .header p { color: #666; }
        .stats { display: flex; justify-content: space-around; margin-bottom: 30px; }
        .stat-card { text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px; min-width: 120px; }
        .stat-number { font-size: 24px; font-weight: bold; color: #007bff; }
        .stat-label { color: #666; font-size: 14px; margin-top: 5px; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .status-item { padding: 15px; border-radius: 8px; text-align: center; }
        .status-open { background: #e3f2fd; color: #1976d2; }
        .status-closed { background: #f3e5f5; color: #7b1fa2; }
        .status-booked { background: #e8f5e8; color: #388e3c; }
        .leads-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .leads-table th, .leads-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .leads-table th { background: #f8f9fa; font-weight: bold; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Lead Tracker Report</h1>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-number">${totalLeads}</div>
            <div class="stat-label">Total Leads</div>
          </div>
        </div>

        <div class="status-grid">
          <div class="status-item status-open">
            <div style="font-size: 20px; font-weight: bold;">${statusCounts.open || 0}</div>
            <div>Open</div>
          </div>
          <div class="status-item status-closed">
            <div style="font-size: 20px; font-weight: bold;">${statusCounts.closed || 0}</div>
            <div>Closed</div>
          </div>
          <div class="status-item status-booked">
            <div style="font-size: 20px; font-weight: bold;">${statusCounts.booked || 0}</div>
            <div>Booked</div>
          </div>
        </div>

        <h3>Recent Leads</h3>
        <table class="leads-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Date</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            ${recentLeads.slice(0, 10).map(lead => `
              <tr>
                <td>${lead.name || 'N/A'}</td>
                <td><span style="padding: 4px 8px; border-radius: 4px; background: ${getStatusColor(lead.status)}; color: white; font-size: 12px;">${lead.status || 'N/A'}</span></td>
                <td>${lead.date || 'N/A'}</td>
                <td>${lead.source || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>This report was generated automatically from the Lead Tracker Dashboard</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function getStatusColor(status) {
  const colors = {
    'Open': '#1976d2',
    'Closed': '#7b1fa2',
    'Booked': '#388e3c'
  };
  return colors[status] || '#666';
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/api/data') {
    fetchWithRedirects(SHEET_URL, res);
  } else if (parsedUrl.pathname === '/api/send-email' && req.method === 'POST') {
    handleEmailRequest(req, res);
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
  console.log('✅ Lead Tracker Server running!');
  console.log(`   Open in browser: http://localhost:${PORT}`);
  console.log('');
  console.log('   Press Ctrl+C to stop.');
  console.log('');
});