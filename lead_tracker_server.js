require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3030;
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSXsdx0UFbCKXSCYwGzxEC5iRO-L31puQ_Ta3xBGRIwyxCW7-PGSmsRfX9bJ3yFdY6DB7RzN98WvcRe/pub?output=csv';

// ═══════════════════════════════════════════════════════════════
//  EMAIL HANDLER — Uses Zoho SMTP (Nodemailer)
// ═══════════════════════════════════════════════════════════════
async function handleEmailRequest(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });

  req.on('end', async () => {
    try {
      const { toEmail, subject, reportData } = JSON.parse(body);

      console.log('📧 Email request received:', {
        toEmail,
        subject,
        hasReportData: !!reportData
      });

      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('❌ Email failed: Missing EMAIL_USER or EMAIL_PASS in .env');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          message: 'Email credentials missing in server .env'
        }));
      }

      // ── MATCHED TO WORKING PROJECT SETTINGS ──
      const transporter = nodemailer.createTransport({
        host: 'smtp.zoho.com',
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

      // Build recipients array — supports comma-separated emails
      const recipients = toEmail || process.env.EMAIL_RECIPIENTS || process.env.EMAIL_USER;

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || 'TNVL Reports'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: recipients,
        subject: subject || `TNVL Performance Reports Bundle - ${new Date().toLocaleDateString('en-CA')}`,
        html: htmlContent
      };

      console.log(`📨 Sending PDF report to: ${recipients}...`);
      const startTime = Date.now();
      const info = await transporter.sendMail(mailOptions);
      const duration = Date.now() - startTime;
      console.log(`✅ Email sent successfully in ${duration}ms:`, info.messageId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Email sent successfully!',
        messageId: info.messageId,
        duration
      }));

    } catch (error) {
      console.error('❌ SMTP Error Details:', {
        code: error.code,
        message: error.message,
        errno: error.errno,
        syscall: error.syscall,
        address: error.address,
        port: error.port
      });

      let userMessage = 'Failed to send report';
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
        details: error.message
      }));
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  EMAIL HTML GENERATOR — Task Report Table (9 columns)
// ═══════════════════════════════════════════════════════════════
function generateEmailHTML(reportData) {
  const taskReport = reportData?.taskReportData || null;

  const taskRowsHTML = taskReport && taskReport.issues && taskReport.issues.length > 0
    ? taskReport.issues.map((issue, i) => {
        const isNS = issue.taskStatus === 'Not started';
        const statusColor  = isNS ? '#cc0000' : '#cc6600';
        const statusBg     = isNS ? '#ffe5e5' : '#fff3e0';
        const statusBorder = isNS ? '#f7c5c5' : '#f7dfc5';
        const statusLabel  = isNS ? '❌ Not Started' : '⏳ Partially Done';

        let bucketBg = '#e3f2fd', bucketColor = '#0d47a1';
        if (issue.bucket === 'Bucket 1')      { bucketBg = '#ffe5e5'; bucketColor = '#cc0000'; }
        else if (issue.bucket === 'Bucket 2') { bucketBg = '#fff3e0'; bucketColor = '#cc6600'; }
        else if (issue.bucket === 'Bucket 3') { bucketBg = '#fffde7'; bucketColor = '#9a7d00'; }
        else if (issue.bucket === 'Bucket 4') { bucketBg = '#e3f2fd'; bucketColor = '#0d47a1'; }

        const actions = (issue.actionItems || '').split(' | ').filter(Boolean);
        const actionsHtml = actions.map((a, idx) =>
          `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;">
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;border-radius:50%;background:#e3f2fd;color:#0d47a1;font-size:9px;font-weight:bold;flex-shrink:0;margin-top:1px;">${idx + 1}</span>
            <span style="font-size:11px;color:#444;line-height:1.4;">${a}</span>
          </div>`
        ).join('');

        return `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;color:#999;font-size:11px;font-family:monospace;">${i + 1}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">
            <span style="padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;background:#e8f5e9;color:#2e7d32;">${issue.agent || '–'}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:monospace;color:#1565c0;font-size:12px;font-weight:600;">${issue.leadId || '–'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:12px;">${issue.customerName || '–'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">
            <span style="padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;font-family:monospace;background:${bucketBg};color:${bucketColor};">${issue.bucket || '–'}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#333;">${issue.moveDate || '–'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">
            <span style="padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700;font-family:monospace;background:#e3f2fd;color:#1565c0;">${issue.dayInTimeline || '–'}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">
            <span style="padding:4px 10px;border-radius:10px;font-size:10px;font-weight:700;font-family:monospace;background:${statusBg};color:${statusColor};border:1px solid ${statusBorder};">${statusLabel}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">${actionsHtml || '–'}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="9" style="padding:24px;text-align:center;color:#aaa;font-size:13px;">🎉 No pending task issues found.</td></tr>`;

  const reportDate = taskReport?.date || '';
  const formattedDate = reportDate
    ? new Date(reportDate + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Report Status</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">

  <div style="background:linear-gradient(135deg,#0d1117,#1a2332);padding:28px 40px;text-align:center;">
    <h1 style="margin:0;color:#58a6ff;font-size:24px;letter-spacing:-0.5px;">📋 Task Report Status</h1>
    <p style="margin:8px 0 0;color:#8b949e;font-size:13px;">${formattedDate}</p>
  </div>

  <div style="max-width:1000px;margin:0 auto;padding:24px 16px;">

    ${taskReport ? `
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;justify-content:center;">
      <div style="background:#ffffff;border:1px solid #ddd;border-radius:20px;padding:8px 20px;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <strong style="color:#1565c0;font-size:18px;">${taskReport.totalIssues || 0}</strong>
        <span style="color:#666;margin-left:6px;">Total Issues</span>
      </div>
      <div style="background:#ffe5e5;border:1px solid #f7c5c5;border-radius:20px;padding:8px 20px;font-size:13px;">
        <strong style="color:#cc0000;font-size:18px;">${taskReport.notStarted || 0}</strong>
        <span style="color:#cc0000;margin-left:6px;">❌ Not Started</span>
      </div>
      <div style="background:#fff3e0;border:1px solid #f7dfc5;border-radius:20px;padding:8px 20px;font-size:13px;">
        <strong style="color:#cc6600;font-size:18px;">${taskReport.partiallyDone || 0}</strong>
        <span style="color:#cc6600;margin-left:6px;">⏳ Partially Done</span>
      </div>
    </div>` : ''}

    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:24px;">
      <div style="background:#0d1117;padding:14px 20px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:14px;">📋</span>
        <span style="color:#e6edf3;font-size:14px;font-weight:600;">Pending Action Items</span>
        <span style="margin-left:auto;background:rgba(88,166,255,0.2);color:#58a6ff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">${taskReport?.issues?.length || 0} records</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:800px;">
          <thead>
            <tr style="background:#f6f8fa;border-bottom:2px solid #e1e4e8;">
              <th style="padding:10px 12px;text-align:center;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">#</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Agent</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Lead ID</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Customer Name</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Bucket</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Move Date</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Day in Timeline</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Task Status</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Action Items Required</th>
            </tr>
          </thead>
          <tbody>${taskRowsHTML}</tbody>
        </table>
      </div>
    </div>

    <div style="text-align:center;padding:16px;color:#aaa;font-size:11px;">
      <p style="margin:0;">Generated automatically by Lead Tracker Dashboard</p>
      <p style="margin:4px 0 0;">© ${new Date().getFullYear()} TNVL — All rights reserved</p>
    </div>

  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
//  HTTP SERVER
// ═══════════════════════════════════════════════════════════════
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname  = parsedUrl.pathname;

  if (pathname === '/api/data') {
    fetchWithRedirects(SHEET_URL, res);

  } else if (pathname === '/api/send-email' && req.method === 'POST') {
    handleEmailRequest(req, res);

  } else {
    const filePath = path.join(__dirname, 'lead_tracker_dashboard.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
//  GOOGLE SHEET FETCH (with redirect support)
// ═══════════════════════════════════════════════════════════════
function fetchWithRedirects(url, res, redirectCount = 0) {
  if (redirectCount > 5) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Too many redirects');
    return;
  }

  https.get(url, (sheetRes) => {
    if ([301, 302, 303, 307, 308].includes(sheetRes.statusCode) && sheetRes.headers.location) {
      sheetRes.resume();
      fetchWithRedirects(sheetRes.headers.location, res, redirectCount + 1);
      return;
    }

    let data = '';
    sheetRes.on('data', chunk => { data += chunk; });
    sheetRes.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/csv' });
      res.end(data);
    });

  }).on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error fetching sheet: ' + err.message);
  });
}

// ═══════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════
server.listen(PORT, () => {
  console.log('');
  console.log('✅ Lead Tracker Server running!');
  console.log(`   Open in browser  : http://localhost:${PORT}`);
  console.log(`   Email user       : ${process.env.EMAIL_USER || '⚠️  Not set'}`);
  console.log(`   Email pass       : ${process.env.EMAIL_PASS ? '✅ Set' : '⚠️  Not set'}`);
  console.log('');
  console.log('   Press Ctrl+C to stop.');
  console.log('');
});