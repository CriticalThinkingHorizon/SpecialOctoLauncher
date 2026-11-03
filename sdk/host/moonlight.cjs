// S2 Moonlight / Sunshine Game Streaming Client Service
// Implements NVHTTP pairing ladder, App List discovery, RTSP session launch,
// automatic LAN subnet discovery, and real-time S2 controller input streaming over UDP (Port 47999).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const dgram = require('node:dgram');
const net = require('node:net');
const crypto = require('node:crypto');

const S2_SAVE_STORAGE_DIR = 'save:/hbstorage';
const S2_SAVE_CONFIG_PATH = 'save:/hbstorage/moonlight.json';
const REPO_CONFIG_FILE = path.join(__dirname, '../../moonlight-host.txt');
const MOONLIGHT_PORTAL_PORT = Number(process.env.MOONLIGHT_PORTAL_PORT || 39382);

// Default Embedded Client Certificate & Key (CN=Moonlight S2)
const EMBEDDED_CLIENT_CERT = `-----BEGIN CERTIFICATE-----
MIIC3TCCAcWgAwIBAgIUXYVM776d90xm5McdfOnXG212MTQwDQYJKoZIhvcNAQEL
BQAwFzEVMBMGA1UEAwwMTW9vbmxpZ2h0IFMyMB4XDTI2MTEwMzAxMzI1NVoXDTM2
MTAzMTAxMzI1NVowFzEVMBMGA1UEAwwMTW9vbmxpZ2h0IFMyMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEArzsAeERDr28LSkN54lEUBJGggs9/PJgww0NT
pjoi/ni3SAM39DDyA5fGd81ZekwYk0MZSTFY5F1VOhH8ZxJAu9cC5DP8Ik9Xm+32
rq9OWDdhmSLXhpBDyWeLQ+hQP/LLTxXaj0421jV08eWS1ct8ypwj9AHtAXY/1a04
apuxDmDoqaRvi46k5C4UCLKIYF6644N7WXnskGtJ0+i6jPEaBkRrAYbAoO3RtHfH
Vhn24LLjDb5zcQW2+IEotJ9TvPm1fIkI08v3BlBwi43Vm7g5ccGPsO5QOzDDhPe1
VO1v5HjePLgmOmnBbnCEmNKpxyJ+PWK/SHyXVe3eDElloI5u7wIDAQABoyEwHzAd
BgNVHQ4EFgQUblIwqdXwx5uDoIolqle54AQCHkEwDQYJKoZIhvcNAQELBQADggEB
ACOyWnYClgHAh8BQ6kYFdUFQipU33aNzVrCuXaLmhrhWwKRdtVbDelQ4EKlNj4oH
Wok0jaM899FRPEHegOdi8JBf84UYLjmomzHmuHbOGg+7sxAE3dvT4ChlKUcSon7A
aN4xPpfKc41H40XvrqTX3RCHGNwVnbRKNG/jlDBvN7/vgVh3DZFb72bCYVs2DBFT
kwD6lc7o01YKC3LHMMZIK+7+Ed2M+BRpwTLOeknQ6Hv6xdR1MkGHSVwB8DRqUkfi
hbsNhGC40w7pMcxUODF8BVUEBVXM0kk08cfufnhyiwbhoWkj+9c+U1PpGq1Tuwk+
Or+nnXNV2FYoXKca0y4y34Q=
-----END CERTIFICATE-----`;

const EMBEDDED_CLIENT_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCvOwB4REOvbwtK
Q3niURQEkaCCz388mDDDQ1OmOiL+eLdIAzf0MPIDl8Z3zVl6TBiTQxlJMVjkXVU6
EfxnEkC71wLkM/wiT1eb7faur05YN2GZIteGkEPJZ4tD6FA/8stPFdqPTjbWNXTx
5ZLVy3zKnCP0Ae0Bdj/VrThqm7EOYOippG+LjqTkLhQIsohgXrrjg3tZeeyQa0nT
6LqM8RoGRGsBhsCg7dG0d8dWGfbgsuMNvnNxBbb4gSi0n1O8+bV8iQjTy/cGUHCL
jdWbuDlxwY+w7lA7MMOE97VU7W/keN48uCY6acFucISY0qnHIn49Yr9IfJdV7d4M
SWWgjm7vAgMBAAECggEAAX/+zAjBj5Hixdr4AyDwi+13M0d1bl5bJIDCCY072XPN
Fde5NeTpXXCCKWpflrVqDHCpmb/LZAEMhre6smMsnK8FflCXmu+U72fFEc+8WvL2
aeorcCJyAhpZzdYCQdnhNacZPNrNi13fx2ZQsHXSdqWJhUAy+C079KdL8VWt2VKl
akyGS8/sWpZsRSOf/T8/i7VEMK3C9DDWyPgJKWdTf2F9C4Fvk8e904k/Pn2B3ZBa
5eSyW2SYfuvPVMcGhmQvxvL9kF/QfCyM3qkQmHZHZQt1rNyENPcqUQq/2Ry8KNu4
uhag0cFWtmt7FZtB/TGjv1wTzBZBNBhHWjS7oxFLYQKBgQDbyXG7TrqkxeNm07lW
SzcX/sasRWhiuSq2XUhvHsOI6dfe3KrfntlhmnLj26fOHv+vNrnpQyeub6iKtz3Z
neO2eaqWOrVsBEESjLWwdkli31iLAIt7WryjaVCzJ1xcn4bSsf1hN08J4MQ1WjpP
tTFPvwXy1cwaYXbBFIppEBXgPwKBgQDMGi3ehb2QiosVcxT5GZwYMJLfh/9z9Xbj
3WG31f+F1ifnaYuHA02oj0MMqu4eOoa6V+MdE2wAiogwM/o1e2VSADysYpzEgrp4
XcpWpUMYl38MwaOZVY9gWw1GsLkbqzeYokvsiaYj0DVvJcwZ+mHr3rpGNm4wIeDG
9PgZZ27FUQKBgHKj+HbC8gfQUHTqKtogEXSqp+ZjrbcQ7n6A2a9cVJGtp7PPVjGe
IbUPYq4HfNe+w48Y9I//P0t1Ymw4eEJyYLxlad1Cci8NaQPL8VlB2bWA2iZm+lo1
Uf/KhxVrinmlnCV6QbfbqZZ1buKFVbUNxdLayLeJXRTFkbPUiv2SLlbxAoGAASb8
r07t/QzrMBnQOn/Mg85yZdSsuojePPcZACKzKJxG6WWNJhv8qkD0zfOBGKaX8CFi
5N0hNPeTQUJp3TdvIQFjVk3QOMPMLbXJ2KdiM5dXXkkRlWIIRzD8aDPDN8bFr5Tq
/NDiIT2hr5j1CAiD2QMO5iqUgK0QSc9EP1B4LaECgYEArV9pjVhxvnkdNa4Y6Yak
0iz2QWKomrn5eiCY/fAhaYvKZx+0ati0320urvHu5CXgZIlCjVIjSr06+ndLJ1tA
c2hFRQAjRHOHtQWtGuma2dMrMwX1fZsr+ovaAiPLnJXMq23w/38ShwBBgR8AYNBh
3LZvziTWUNAgvLcWBiyj+9g=
-----END PRIVATE KEY-----`;

function sanitizeAscii(str, maxLen = 32) {
  if (!str) return '';
  return String(str)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, maxLen);
}

function parseXmlTag(xml, tag) {
  const match = new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`, 'i').exec(xml);
  return match ? match[1].trim() : '';
}

function parseXmlApps(xml) {
  const apps = [];
  const appMatches = xml.match(/<app>([\s\S]*?)<\/app>/gi) || [];
  for (const block of appMatches) {
    const title = parseXmlTag(block, 'AppTitle');
    const id = Number(parseXmlTag(block, 'ID') || 0);
    if (title && id) {
      apps.push({ id, title: sanitizeAscii(title, 28) });
    }
  }
  return apps;
}

function getX509Signature(certPem) {
  const x509 = new crypto.X509Certificate(certPem);
  const der = x509.raw;
  // Locate the RSA signature BIT STRING in DER
  for (let i = der.length - 260; i >= 0; i--) {
    if (der[i] === 0x03 && der[i + 1] === 0x82 && der[i + 2] === 0x01 && der[i + 3] === 0x01 && der[i + 4] === 0x00) {
      return der.subarray(i + 5, i + 5 + 256);
    }
  }
  for (let i = der.length - 300; i >= 0; i--) {
    if (der[i] === 0x03) {
      let len = der[i + 1];
      let offset = i + 2;
      if (len === 0x81) { len = der[offset++]; }
      else if (len === 0x82) { len = (der[offset] << 8) | der[offset + 1]; offset += 2; }
      if (der[offset] === 0x00 && len > 1) {
        return der.subarray(offset + 1, offset + len);
      }
    }
  }
  throw new Error('Failed to extract signature from certificate');
}

function getX509DerHex(certPem) {
  const x509 = new crypto.X509Certificate(certPem);
  return x509.raw.toString('hex');
}

class S2MoonlightClient {
  constructor() {
    this.hostIp = '';
    this.uniqueId = '0123456789ABCDEF';
    this.clientCert = EMBEDDED_CLIENT_CERT;
    this.clientKey = EMBEDDED_CLIENT_KEY;
    this.status = 0; // 0=Unconfigured, 1=Connecting, 2=Ready/Paired, 3=Pairing Required, 4=Streaming, 5=Error
    this.statusMessage = 'Searching for Sunshine PC on local network...';
    this.serverName = 'Unknown Sunshine PC';
    this.pairingPin = '1234';
    this.pairingSalt = '';
    this.isPaired = false;
    this.pairingInProgress = false;
    this.activePairingReq = null;
    this.apps = [];
    this.selectedAppIdx = 0;
    this.activeGameTitle = '';

    // Stream telemetry
    this.streamState = 0; // 0=stopped, 1=active
    this.streamFps = 60;
    this.streamLatency = 0;
    this.streamBitrate = 15000;
    this.streamPackets = 0;
    this.streamFrames = 0;
    this.serverPort = 47989;

    // Networking handles
    this.udpSocket = null;
    this.rtspSocket = null;
    this.streamStartTime = 0;
    this.lastFileMtime = 0;
    this.portalServer = null;

    this.startPortalServer();
    this.initUdpSocket();
  }

  initUdpSocket() {
    try {
      this.udpSocket = dgram.createSocket('udp4');
      this.udpSocket.on('error', (err) => {
        console.warn('[Moonlight UDP] Error:', err.message);
      });
    } catch (e) {
      console.warn('[Moonlight UDP] Failed to create UDP socket:', e.message);
    }
  }

  startPortalServer() {
    if (this.portalServer) return;
    try {
      this.portalServer = http.createServer((req, res) => {

        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (req.method === 'POST' && parsedUrl.pathname === '/set-ip') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const params = new URLSearchParams(body);
              const newIp = (params.get('hostIp') || '').trim();
              if (newIp) {
                this.hostIp = newIp;
                this.saveHostIpToLocal(newIp);
                await this.probeHost();
              }
              res.writeHead(302, { Location: '/' });
              res.end();
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Error: ' + err.message);
            }
          });
          return;
        }

        if (req.method === 'POST' && parsedUrl.pathname === '/set-pin') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const params = new URLSearchParams(body);
              const newPin = (params.get('pin') || '').trim();
              if (newPin && newPin.length >= 4) {
                this.pairingPin = newPin.slice(0, 4);
                await this.initiatePairing(true);
              }
              res.writeHead(302, { Location: '/' });
              res.end();
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Error: ' + err.message);
            }
          });
          return;
        }

        if (req.method === 'POST' && parsedUrl.pathname === '/scan') {
          this.discoverSunshineHosts().then(() => {
            res.writeHead(302, { Location: '/' });
            res.end();
          }).catch(err => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Scan Error: ' + err.message);
          });
          return;
        }

        if (req.method === 'POST' && parsedUrl.pathname === '/pair') {
          this.initiatePairing(true).then(() => {
            res.writeHead(302, { Location: '/' });
            res.end();
          }).catch(err => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Pairing Error: ' + err.message);
          });
          return;
        }

        if (req.method === 'POST' && parsedUrl.pathname === '/launch') {
          const appIdx = Number(parsedUrl.searchParams.get('app') || 0);
          this.launchApp(appIdx).then(() => {
            res.writeHead(302, { Location: '/' });
            res.end();
          }).catch(err => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Launch Error: ' + err.message);
          });
          return;
        }

        if (req.method === 'POST' && parsedUrl.pathname === '/stop') {
          this.quitSession().then(() => {
            res.writeHead(302, { Location: '/' });
            res.end();
          }).catch(err => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Stop Error: ' + err.message);
          });
          return;
        }

        // Render HTML Portal
        const statusLabels = ['Unconfigured', 'Connecting...', 'Ready / Paired', 'Pairing Required (PIN)', 'Streaming Active', 'Error'];
        const statusColor = ['#72767d', '#f0b232', '#23a55a', '#f0b232', '#5865f2', '#f23f43'][this.status] || '#72767d';
        
        let appListHtml = '';
        if (this.apps.length > 0) {
          appListHtml = '<ul style="list-style:none;padding:0;">' + this.apps.map((a, idx) => `
            <li style="margin:8px 0;padding:10px;background:#2b2d31;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
              <span><strong>#${idx + 1} ${a.title}</strong> (ID: ${a.id})</span>
              <form method="POST" action="/launch?app=${idx}" style="margin:0;">
                <button type="submit" style="background:#5865f2;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">Launch</button>
              </form>
            </li>`).join('') + '</ul>';
        } else if (this.isPaired) {
          appListHtml = '<p style="color:#949ba4;">No games found or loading app list...</p>';
        }

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Moonlight S2 - Host Portal</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #1e1f22; color: #dbdee1; margin: 0; padding: 24px; }
    .card { max-width: 680px; margin: 0 auto; background: #313338; border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    h1 { color: #fff; margin-top: 0; font-size: 24px; display: flex; align-items: center; gap: 10px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: bold; background: ${statusColor}; color: #fff; }
    .pin-box { font-size: 36px; font-family: monospace; letter-spacing: 8px; background: #111214; padding: 14px 28px; border-radius: 6px; display: inline-block; color: #f0b232; font-weight: bold; }
    input[type=text] { width: calc(100% - 110px); padding: 10px; border: 1px solid #4e5058; border-radius: 4px; background: #1e1f22; color: #fff; font-size: 15px; }
    button { background: #5865f2; color: #fff; border: none; padding: 10px 18px; border-radius: 4px; font-size: 15px; cursor: pointer; font-weight: bold; }
    button:hover { background: #4752c4; }
    .info { margin: 16px 0; padding: 12px; background: #2b2d31; border-radius: 6px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Moonlight S2 <span class="badge">${statusLabels[this.status] || 'Unknown'}</span></h1>
    <div class="info">
      <div><strong>Host PC:</strong> ${this.serverName} (${this.hostIp || 'Not configured'})</div>
      <div><strong>Status:</strong> ${this.statusMessage}</div>
      ${this.streamState === 1 ? `<div><strong>Active Stream:</strong> ${this.activeGameTitle} | 60 FPS | Packets: ${this.streamPackets}</div>` : ''}
    </div>

    ${this.status === 3 ? `
    <div style="text-align:center;margin:20px 0;background:#2b2d31;padding:20px;border-radius:6px;border:1px solid #f0b232;">
      <h3 style="color:#f0b232;margin-top:0;">Pairing Required</h3>
      <p style="margin-bottom:12px;">Type this PIN on your PC at <a href="https://${this.hostIp}:47990/pin" target="_blank" style="color:#00e699;font-weight:bold;">https://${this.hostIp}:47990/pin</a>:</p>
      <div class="pin-box">${this.pairingPin}</div>
      <p style="font-size:13px;color:#949ba4;margin-top:12px;">Sunshine will automatically approve Moonlight S2 once submitted.</p>
      
      <form method="POST" action="/set-pin" style="margin-top:16px;display:flex;gap:10px;justify-content:center;">
        <input type="text" name="pin" placeholder="Or enter custom 4-digit PIN" style="width:200px;text-align:center;font-size:18px;" maxlength="4"/>
        <button type="submit" style="background:#f0b232;color:#1e1f22;">Use PIN</button>
      </form>
    </div>` : ''}

    <h3>Sunshine Host PC</h3>
    <form method="POST" action="/set-ip" style="display:flex;gap:10px;">
      <input type="text" name="hostIp" placeholder="e.g. 192.168.1.100" value="${this.hostIp}"/>
      <button type="submit">Connect</button>
    </form>
    <div style="margin-top:10px;">
      <form method="POST" action="/scan" style="display:inline;">
        <button type="submit" style="background:#2b2d31;color:#dbdee1;border:1px solid #4e5058;">Auto-Discover Hosts on LAN</button>
      </form>
    </div>

    ${this.isPaired ? `
    <h3 style="margin-top:24px;">Available Games & Apps</h3>
    ${appListHtml}
    ` : ''}

    ${this.streamState === 1 ? `
    <form method="POST" action="/stop" style="margin-top:20px;">
      <button type="submit" style="background:#f23f43;">Disconnect Stream</button>
    </form>` : ''}
  </div>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      this.portalServer.on('error', (err) => { console.warn('[Moonlight S2] Web Portal port already in use or error:', err.message); });
      this.portalServer.listen(MOONLIGHT_PORTAL_PORT, '0.0.0.0', () => {
        console.log(`[Moonlight S2] Web Configuration Portal active at http://0.0.0.0:${MOONLIGHT_PORTAL_PORT}`);
      });
    } catch (e) {
      console.warn('[Moonlight S2] Failed to start web portal server:', e.message);
    }
  }

  saveHostIpToLocal(ip) {
    try {
      fs.writeFileSync(REPO_CONFIG_FILE, ip.trim(), 'utf8');
      this.lastFileMtime = fs.statSync(REPO_CONFIG_FILE).mtimeMs;
    } catch {}
  }

  async loadConfiguration(fsService) {
    // 1. Check repo-level moonlight-host.txt
    try {
      if (fs.existsSync(REPO_CONFIG_FILE)) {
        const stat = fs.statSync(REPO_CONFIG_FILE);
        if (stat.mtimeMs !== this.lastFileMtime) {
          this.lastFileMtime = stat.mtimeMs;
          const ip = fs.readFileSync(REPO_CONFIG_FILE, 'utf8').trim();
          if (ip) this.hostIp = ip;
        }
      }
    } catch {}

    // 2. Check S2 persistent save:/hbstorage/moonlight.json
    if (fsService) {
      try {
        let data = null;
        if (typeof fsService.readFile === 'function') {
          data = await fsService.readFile(S2_SAVE_CONFIG_PATH);
        } else if (typeof fsService.readRawFile === 'function') {
          const res = await fsService.readRawFile(S2_SAVE_CONFIG_PATH, 16384);
          if (res && res.result === 0 && res.buffer && res.buffer.length > 0) {
            data = res.buffer;
          }
        }
        if (data && data.length > 4) {
          const cfg = JSON.parse(data.toString('utf8'));
          if (cfg.hostIp && !this.hostIp) this.hostIp = cfg.hostIp;
          if (cfg.uniqueId) this.uniqueId = cfg.uniqueId;
          if (cfg.clientCert) this.clientCert = cfg.clientCert;
          if (cfg.clientKey) this.clientKey = cfg.clientKey;
          if (cfg.isPaired !== undefined) this.isPaired = Boolean(cfg.isPaired);
        }
      } catch {}
    }

    // 3. If no host IP is set, auto-discover on local network
    if (!this.hostIp) {
      await this.discoverSunshineHosts();
    }
  }

  async discoverSunshineHosts() {
    console.log('[Moonlight S2] Scanning local network for Sunshine hosts...');
    this.statusMessage = 'Scanning LAN for Sunshine PC...';

    const ifaces = os.networkInterfaces();
    const prefixes = [];
    for (const n in ifaces) {
      for (const a of ifaces[n]) {
        if (a.family === 'IPv4' && !a.internal && (a.address.startsWith('10.') || a.address.startsWith('192.168.') || a.address.startsWith('172.'))) {
          const p = a.address.split('.').slice(0, 3).join('.');
          if (!prefixes.includes(p)) prefixes.push(p);
        }
      }
    }

    if (prefixes.length === 0) return null;

    const probeIp = (ip) => {
      return new Promise(resolve => {
        const req = http.get(`http://${ip}:47989/serverinfo`, { timeout: 800, agent: false, headers: { 'Connection': 'close' } }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (body.includes('hostname') || body.includes('PairStatus') || body.includes('SUNSHINE')) {
              const hostname = parseXmlTag(body, 'hostname') || 'Sunshine PC';
              resolve({ ip, hostname });
            } else {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
      });
    };

    // Parallel scan of subnets
    const probes = [];
    for (const prefix of prefixes) {
      for (let i = 1; i <= 254; i++) {
        probes.push(probeIp(`${prefix}.${i}`));
      }
    }

    const results = (await Promise.all(probes)).filter(Boolean);
    if (results.length > 0) {
      const found = results[0];
      console.log(`[Moonlight S2] Auto-discovered Sunshine Host at ${found.ip} (${found.hostname})`);
      this.hostIp = found.ip;
      this.serverName = sanitizeAscii(found.hostname, 30);
      this.saveHostIpToLocal(found.ip);
      await this.probeHost();
      return found;
    } else {
      console.log('[Moonlight S2] No Sunshine hosts discovered on LAN.');
      this.statusMessage = 'No Sunshine host found. Press (+) to enter IP';
      return null;
    }
  }

  async saveConfiguration(fsService) {
    if (!fsService) return;
    try {
      if (typeof fsService.ensureDir === 'function') {
        await fsService.ensureDir(S2_SAVE_STORAGE_DIR);
      }
      const json = JSON.stringify({
        hostIp: this.hostIp,
        uniqueId: this.uniqueId,
        clientCert: this.clientCert,
        clientKey: this.clientKey,
        isPaired: this.isPaired
      }, null, 2);
      const buf = Buffer.from(json, 'utf8');
      if (typeof fsService.writeFile === 'function') {
        await fsService.writeFile(S2_SAVE_CONFIG_PATH, buf);
      } else if (typeof fsService.writeBytesAt === 'function') {
        await fsService.writeBytesAt(S2_SAVE_CONFIG_PATH, 0, buf);
        if (typeof fsService.commitMount === 'function') {
          await fsService.commitMount('save');
        }
      }
      console.log(`[Moonlight S2] Configuration saved to S2 storage (${S2_SAVE_CONFIG_PATH})`);
    } catch (e) {
      console.warn('[Moonlight S2] Failed to save config to S2 storage:', e.message);
    }
  }

  async probeHost() {
    if (!this.hostIp) {
      this.status = 0;
      this.statusMessage = 'Enter Sunshine Host PC IP';
      return;
    }

    try {
      // 1. First test authenticated HTTPS serverinfo (port 47984).
      // Sunshine ONLY sets PairStatus=1 when queried over HTTPS with mutual TLS and uniqueid!
      let xml = '';
      let isHttpsPaired = false;
      if (this.clientCert && this.clientKey) {
        try {
          xml = await this.httpGet(`https://${this.hostIp}:47984/serverinfo?uniqueid=${this.uniqueId}`, 3000);
          const ps = parseXmlTag(xml, 'PairStatus') || parseXmlTag(xml, 'paired');
          if (ps === '1') {
            isHttpsPaired = true;
          }
        } catch (httpsErr) {
          // HTTPS fails when client is not authorized yet
        }
      }

      // 2. Fall back to plain HTTP (port 47989) if HTTPS is not yet authorized
      if (!xml) {
        xml = await this.httpGet(`http://${this.hostIp}:47989/serverinfo`, 3500);
      }

      const hostname = parseXmlTag(xml, 'hostname') || parseXmlTag(xml, 'host');
      const appversion = parseXmlTag(xml, 'appversion') || 'Sunshine';

      if (hostname) this.serverName = sanitizeAscii(hostname, 30);

      console.log(`[Moonlight S2] Host: ${this.serverName}, HTTPS Paired: ${isHttpsPaired}, Version: ${appversion}`);

      if (isHttpsPaired) {
        this.isPaired = true;
        this.status = 2;
        this.pairingInProgress = false;
        this.statusMessage = `Ready - Connected to ${this.serverName}`;
        if (this.savedFsService) {
          await this.saveConfiguration(this.savedFsService);
        }
        await this.fetchAppList();
      } else {
        this.isPaired = false;
        this.status = 3;
        this.statusMessage = `Type PIN ${this.pairingPin} at https://${this.hostIp}:47990/pin`;

        // Only start pairing if not already waiting for PIN!
        if (!this.pairingInProgress) {
          await this.initiatePairing(false);
        }
      }
    } catch (err) {
      console.warn(`[Moonlight S2] Probe host failed: ${err.message}`);
      if (!this.pairingInProgress && !this.isPaired) {
        this.status = 5;
        this.statusMessage = `Cannot reach Sunshine at ${this.hostIp}`;
      }
    }
  }

  httpGet(urlStr, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const isHttps = u.protocol === 'https:';
      const lib = isHttps ? https : http;
      const opts = {
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        agent: false,
        rejectUnauthorized: false,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Moonlight-S2/1.0',
          'Connection': 'close'
        }
      };

      if (isHttps && this.clientCert && this.clientKey) {
        opts.cert = this.clientCert;
        opts.key = this.clientKey;
      }

      const req = lib.request(opts, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`HTTP Timeout after ${timeoutMs}ms`));
      });
      req.on('error', err => reject(err));
      req.end();
    });
  }

  async initiatePairing(forceNewPin = false) {
    if (!this.hostIp) return;
    if (this.pairingInProgress && !forceNewPin) {
      console.log(`[Moonlight S2] Pairing session already active with PIN: ${this.pairingPin}`);
      return;
    }

    // Cancel existing pending pairing request if regenerating PIN
    if (this.activePairingReq) {
      try { this.activePairingReq.destroy(); } catch {}
      this.activePairingReq = null;
    }

    if (forceNewPin || !this.pairingPin) {
      this.pairingPin = String(Math.floor(1000 + Math.random() * 9000));
    }

    this.pairingInProgress = true;
    this.status = 3;
    this.statusMessage = `Type PIN ${this.pairingPin} at https://${this.hostIp}:47990/pin`;

    console.log(`[Moonlight S2] Starting NVHTTP Pairing Ladder with PIN: ${this.pairingPin}`);

    // Generate 16-byte random salt
    const saltBuf = crypto.randomBytes(16);
    this.pairingSalt = saltBuf.toString('hex');

    // Normalize PEM certificate and private key
    const cleanCertPem = (this.clientCert || '').replace(/\r\n/g, '\n').trim() + '\n';
    this.clientCert = cleanCertPem;
    if (this.clientKey) {
      this.clientKey = this.clientKey.replace(/\r\n/g, '\n').trim() + '\n';
    }

    // Sunshine parses clientcert via crypto::x509(client.cert) using OpenSSL PEM reader
    const certHex = Buffer.from(cleanCertPem, 'utf8').toString('hex');

    // Step 1: getservercert
    // Sunshine holds this HTTP request open while waiting for the PIN to be submitted in the Web UI!
    const getCertUrl = `http://${this.hostIp}:47989/pair?uniqueid=${this.uniqueId}&devicename=MoonlightS2&update=0&phrase=getservercert&salt=${this.pairingSalt}&clientcert=${certHex}`;
    
    const u = new URL(getCertUrl);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: 'GET',
      agent: false,
      timeout: 300000, // 5 minutes timeout for user to enter PIN
      headers: {
        'User-Agent': 'Moonlight-S2/1.0',
        'Connection': 'close'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', async () => {
        this.activePairingReq = null;
        if (!data || (!data.includes('plaincert') && !data.includes('paired'))) {
          console.warn('[Moonlight S2] getservercert ended without valid payload. Data:', data ? data.slice(0, 300) : '<empty>');
          setTimeout(() => { this.pairingInProgress = false; }, 3000);
          return;
        }

        console.log(`[Moonlight S2] PIN verified by Sunshine! Starting cryptographic challenge ladder.`);

        try {
          // Shared AES-128 key: SHA-256(salt || PIN)[0..16]
          const aesKey = crypto.createHash('sha256')
            .update(saltBuf)
            .update(Buffer.from(this.pairingPin, 'ascii'))
            .digest()
            .subarray(0, 16);

          await new Promise(r => setTimeout(r, 100));

          // Step 2: clientchallenge
          const clientChallenge = crypto.randomBytes(16);
          const cipher1 = crypto.createCipheriv('aes-128-ecb', aesKey, null);
          cipher1.setAutoPadding(false);
          const encryptedChallenge = Buffer.concat([cipher1.update(clientChallenge), cipher1.final()]).toString('hex');

          const challengeUrl = `http://${this.hostIp}:47989/pair?uniqueid=${this.uniqueId}&devicename=MoonlightS2&update=0&phrase=clientchallenge&clientchallenge=${encryptedChallenge}`;
          const challengeRes = await this.httpGet(challengeUrl, 10000);
          console.log('[Moonlight S2] clientchallenge response:', challengeRes.slice(0, 160));

          const challengeResponseHex = parseXmlTag(challengeRes, 'challengeresponse') || parseXmlTag(challengeRes, 'challengedata');
          if (!challengeResponseHex) {
            throw new Error('clientchallenge response missing challengeresponse tag');
          }

          const decipher1 = crypto.createDecipheriv('aes-128-ecb', aesKey, null);
          decipher1.setAutoPadding(false);
          const decryptedChallengeRes = Buffer.concat([decipher1.update(Buffer.from(challengeResponseHex, 'hex')), decipher1.final()]);

          // Server challenge is the last 16 bytes of the decrypted block (preceded by 32-byte server hash)
          const serverChallenge = decryptedChallengeRes.subarray(decryptedChallengeRes.length - 16);

          await new Promise(r => setTimeout(r, 100));

          // Step 3: serverchallengeresp
          const clientSecret = crypto.randomBytes(16);
          const clientCertSig = getX509Signature(this.clientCert);

          // hash = SHA-256(serverChallenge || clientCertSignature || clientSecret)
          const challengeRespHashInput = Buffer.concat([serverChallenge, clientCertSig, clientSecret]);
          const challengeRespHash = crypto.createHash('sha256').update(challengeRespHashInput).digest();

          const cipher2 = crypto.createCipheriv('aes-128-ecb', aesKey, null);
          cipher2.setAutoPadding(false);
          const encryptedChallengeResp = Buffer.concat([cipher2.update(challengeRespHash), cipher2.final()]).toString('hex');

          const respUrl = `http://${this.hostIp}:47989/pair?uniqueid=${this.uniqueId}&devicename=MoonlightS2&update=0&phrase=serverchallengeresp&serverchallengeresp=${encryptedChallengeResp}`;
          const respRes = await this.httpGet(respUrl, 10000);
          console.log('[Moonlight S2] serverchallengeresp response:', respRes.slice(0, 160));

          await new Promise(r => setTimeout(r, 100));

          // Step 4: clientpairingsecret
          // Sign clientSecret with client RSA private key (RSA-SHA256)
          const signer = crypto.createSign('RSA-SHA256');
          signer.update(clientSecret);
          const clientSecretSig = signer.sign(this.clientKey);

          const pairingSecretPayload = Buffer.concat([clientSecret, clientSecretSig]);
          const pairingSecretHex = pairingSecretPayload.toString('hex');

          const secretUrl = `http://${this.hostIp}:47989/pair?uniqueid=${this.uniqueId}&devicename=MoonlightS2&update=0&phrase=clientpairingsecret&clientpairingsecret=${pairingSecretHex}`;
          const secretRes = await this.httpGet(secretUrl, 10000);
          console.log('[Moonlight S2] clientpairingsecret response:', secretRes.slice(0, 160));

          await new Promise(r => setTimeout(r, 150));

          // Step 5: Finalize over HTTPS with mutual TLS (mTLS)
          const finalUrl = `https://${this.hostIp}:47984/pair?uniqueid=${this.uniqueId}&devicename=MoonlightS2&update=0&phrase=pairchallenge`;
          const finalRes = await this.httpGet(finalUrl, 10000);
          console.log('[Moonlight S2] pairchallenge response:', finalRes.slice(0, 160));

          const isSuccess = parseXmlTag(finalRes, 'paired') === '1' || finalRes.includes('status_code="200"');
          if (isSuccess) {
            console.log('[Moonlight S2] Pairing successfully finalized and approved by Sunshine!');
            this.isPaired = true;
            this.pairingInProgress = false;
            this.status = 2;
            this.statusMessage = `Ready - Connected to ${this.serverName}`;
            if (this.savedFsService) {
              await this.saveConfiguration(this.savedFsService);
            }
            await this.fetchAppList();
          } else {
            console.warn('[Moonlight S2] Final pairchallenge did not return paired=1. Response:', finalRes);
            this.pairingInProgress = false;
          }
        } catch (stepErr) {
          console.warn('[Moonlight S2] Pairing ladder step error:', stepErr.message);
          setTimeout(() => { this.pairingInProgress = false; }, 3000);
        }
      });
    });

    req.on('timeout', () => {
      console.log('[Moonlight S2] Pairing wait timed out after 5 minutes.');
      this.activePairingReq = null;
      setTimeout(() => { this.pairingInProgress = false; }, 3000);
      req.destroy();
    });

    req.on('error', err => {
      if (this.pairingInProgress) {
        console.warn(`[Moonlight S2] Pairing wait connection notice: ${err.message}`);
        this.activePairingReq = null;
        setTimeout(() => { this.pairingInProgress = false; }, 3000);
      }
    });

    this.activePairingReq = req;
    req.end();
  }

  async fetchAppList() {
    if (!this.hostIp || !this.isPaired) return;
    try {
      const xml = await this.httpGet(`https://${this.hostIp}:47984/applist?uniqueid=${this.uniqueId}`, 6000);
      const parsed = parseXmlApps(xml);
      if (parsed.length > 0) {
        this.apps = parsed.slice(0, 16);
        console.log(`[Moonlight S2] Loaded ${this.apps.length} apps from Sunshine.`);
      } else {
        this.apps = [
          { id: 1, title: 'Steam Big Picture' },
          { id: 2, title: 'Desktop' }
        ];
      }
    } catch (err) {
      console.warn(`[Moonlight S2] fetchAppList error:`, err.message);
      if (this.apps.length === 0) {
        this.apps = [
          { id: 1, title: 'Steam Big Picture' },
          { id: 2, title: 'Desktop' }
        ];
      }
    }
  }

  async launchApp(appIndex) {
    if (!this.hostIp || !this.isPaired) {
      await this.probeHost();
      return;
    }
    const app = this.apps[appIndex] || this.apps[0];
    if (!app) return;

    this.activeGameTitle = app.title;
    this.status = 4;
    this.statusMessage = `Streaming: ${app.title} (1280x720 @ 60 FPS)`;

    try {
      console.log(`[Moonlight S2] Launching App ID: ${app.id} (${app.title})...`);
      const launchUrl = `https://${this.hostIp}:47984/launch?uniqueid=${this.uniqueId}&appid=${app.id}&mode=1280x720x60&additionalflags=0`;
      const res = await this.httpGet(launchUrl, 10000);
      console.log(`[Moonlight S2] Launch response:`, res.slice(0, 200));

      this.initRtspSession();
      this.streamState = 1;
      this.streamStartTime = Date.now();
      this.streamPackets = 0;
      this.streamFrames = 0;
    } catch (err) {
      console.warn(`[Moonlight S2] Launch failed:`, err.message);
      this.status = 2;
      this.statusMessage = `Launch error: ${err.message}`;
    }
  }

  initRtspSession() {
    try {
      if (this.rtspSocket) {
        this.rtspSocket.destroy();
        this.rtspSocket = null;
      }
      this.rtspSocket = net.createConnection({ host: this.hostIp, port: 48010 }, () => {
        console.log(`[Moonlight S2] RTSP connection established on port 48010.`);
        const msg = `OPTIONS rtsp://${this.hostIp}:48010 RTSP/1.0\r\nCSeq: 1\r\nX-GS-ClientVersion: 11\r\n\r\n`;
        this.rtspSocket.write(msg);
      });

      this.rtspSocket.on('data', data => {
        const str = data.toString('utf8');
        if (str.includes('200 OK') && str.includes('CSeq: 1')) {
          const desc = `DESCRIBE rtsp://${this.hostIp}:48010 RTSP/1.0\r\nCSeq: 2\r\nAccept: application/sdp\r\n\r\n`;
          this.rtspSocket.write(desc);
        } else if (str.includes('200 OK') && str.includes('CSeq: 2')) {
          const setup = `SETUP rtsp://${this.hostIp}:48010/streamid=control RTSP/1.0\r\nCSeq: 3\r\nTransport: packet_stream;client_port=47999\r\n\r\n`;
          this.rtspSocket.write(setup);
        } else if (str.includes('200 OK') && str.includes('CSeq: 3')) {
          const play = `PLAY rtsp://${this.hostIp}:48010 RTSP/1.0\r\nCSeq: 4\r\n\r\n`;
          this.rtspSocket.write(play);
        }
      });

      this.rtspSocket.on('error', err => {
        console.warn(`[Moonlight S2] RTSP error:`, err.message);
      });
    } catch (e) {
      console.warn(`[Moonlight S2] RTSP connection exception:`, e.message);
    }
  }

  sendControllerInput({ buttonFlags = 0, lt = 0, rt = 0, lsX = 0, lsY = 0, rsX = 0, rsY = 0 }) {
    if (!this.udpSocket || !this.hostIp || this.streamState !== 1) return;

    const pkt = Buffer.alloc(24);
    pkt.writeUInt32LE(0x0000000a, 0); // Controller event packet header
    pkt.writeInt16LE(0, 4);          // Controller number 0
    pkt.writeInt16LE(1, 6);          // Active gamepad mask
    pkt.writeUInt32LE(buttonFlags >>> 0, 8);
    pkt.writeUInt8(Math.max(0, Math.min(255, lt)), 12);
    pkt.writeUInt8(Math.max(0, Math.min(255, rt)), 13);
    pkt.writeInt16LE(Math.max(-32768, Math.min(32767, lsX)), 14);
    pkt.writeInt16LE(Math.max(-32768, Math.min(32767, lsY)), 16);
    pkt.writeInt16LE(Math.max(-32768, Math.min(32767, rsX)), 18);
    pkt.writeInt16LE(Math.max(-32768, Math.min(32767, rsY)), 20);

    try {
      this.udpSocket.send(pkt, 47999, this.hostIp);
      this.streamPackets++;
      this.streamFrames++;
    } catch (e) {
      console.warn('[Moonlight UDP] Send error:', e.message);
    }
  }

  async quitSession() {
    this.streamState = 0;
    if (this.rtspSocket) {
      try { this.rtspSocket.destroy(); } catch {}
      this.rtspSocket = null;
    }
    if (this.hostIp) {
      try {
        await this.httpGet(`https://${this.hostIp}:47984/cancel?uniqueid=${this.uniqueId}`, 4000);
      } catch {}
    }
    this.status = 2;
    this.statusMessage = `Session stopped. Ready - Connected to ${this.serverName}`;
  }

  buildGpuBuffer() {
    const buf = Buffer.alloc(768);

    // Header words (0..9)
    buf.writeUInt32LE(this.status >>> 0, 0);             // Word 0: status
    buf.writeUInt32LE(this.apps.length >>> 0, 4);        // Word 1: appCount
    buf.writeUInt32LE(this.selectedAppIdx >>> 0, 8);     // Word 2: selectedApp
    buf.writeUInt32LE(this.streamState >>> 0, 12);       // Word 3: streamState
    buf.writeUInt32LE(this.streamFps >>> 0, 16);         // Word 4: streamFps
    buf.writeUInt32LE(this.streamLatency >>> 0, 20);     // Word 5: streamLatency
    buf.writeUInt32LE(this.streamBitrate >>> 0, 24);     // Word 6: streamBitrate
    buf.writeUInt32LE(this.streamPackets >>> 0, 28);     // Word 7: streamPackets
    buf.writeUInt32LE(this.streamFrames >>> 0, 32);      // Word 8: streamFrames
    buf.writeUInt32LE(this.serverPort >>> 0, 36);        // Word 9: serverPort

    // ASCII Strings
    buf.write(this.serverName.slice(0, 31), 40, 32, 'utf8');         // Bytes 40..71: serverName
    buf.write(this.hostIp.slice(0, 31), 72, 32, 'utf8');             // Bytes 72..103: serverIp
    buf.write(this.pairingPin.slice(0, 15), 104, 16, 'utf8');        // Bytes 104..119: pairingPin
    buf.write(this.statusMessage.slice(0, 63), 120, 64, 'utf8');     // Bytes 120..183: statusMessage
    buf.write(this.activeGameTitle.slice(0, 31), 184, 32, 'utf8');   // Bytes 184..215: activeGameTitle

    // App List at Byte 256 (Word 64): Up to 16 apps (32 bytes each)
    for (let i = 0; i < Math.min(this.apps.length, 16); i++) {
      const app = this.apps[i];
      const offset = 256 + i * 32;
      buf.writeUInt32LE(app.id >>> 0, offset);
      buf.write(app.title.slice(0, 27), offset + 4, 28, 'utf8');
    }

    return buf;
  }

  async handleAction({ action = 0, arg = 0, extInput = null, fsService, swkbdService }) {
    if (fsService) this.savedFsService = fsService;

    // Action 0: Init or Check Pairing Status
    if (action === 0) {
      await this.loadConfiguration(fsService);
      if (this.hostIp) {
        // If already waiting for PIN, do not interrupt the open getservercert request!
        if (!this.pairingInProgress) {
          await this.probeHost();
        }
      } else {
        await this.discoverSunshineHosts();
      }
    }
    // Action 1: Select App
    else if (action === 1) {
      if (arg >= 0 && arg < this.apps.length) {
        this.selectedAppIdx = arg;
      }
    }
    // Action 2: Launch Selected App
    else if (action === 2) {
      const targetIdx = (arg < this.apps.length) ? arg : this.selectedAppIdx;
      await this.launchApp(targetIdx);
    }
    // Action 3: Disconnect / Stop Game
    else if (action === 3) {
      await this.quitSession();
    }
    // Action 4: Stream Controller Input
    else if (action === 4) {
      if (extInput) {
        this.sendControllerInput(extInput);
      }
    }
    // Action 5: Enter Host IP via S2 Native Software Keyboard
    else if (action === 5) {
      if (swkbdService) {
        const kbdRes = await swkbdService.show({
          headerText: 'Sunshine Host PC IP',
          guideText: 'Enter local PC IP (e.g. 10.0.0.2)',
          okText: 'Connect',
          initialText: this.hostIp || ''
        });
        if (kbdRes.result === 0 && kbdRes.text && kbdRes.text.trim().length > 6) {
          const newIp = kbdRes.text.trim();
          this.hostIp = newIp;
          this.saveHostIpToLocal(newIp);
          await this.saveConfiguration(fsService);
          await this.probeHost();
        }
      }
    }
    // Action 6: Regenerate PIN
    else if (action === 6) {
      await this.initiatePairing(true);
    }
    // Action 7: Enter Custom PIN via S2 Native Software Keyboard
    else if (action === 7) {
      if (swkbdService) {
        const kbdRes = await swkbdService.show({
          headerText: 'Moonlight S2 Pairing PIN',
          guideText: 'Type 4-digit PIN (e.g. 1234)',
          okText: 'Set PIN',
          initialText: this.pairingPin || '1234'
        });
        if (kbdRes.result === 0 && kbdRes.text && kbdRes.text.trim().length >= 4) {
          this.pairingPin = kbdRes.text.trim().slice(0, 4);
          await this.initiatePairing(true);
        }
      }
    }
    // Action 8: Auto-Scan LAN
    else if (action === 8) {
      await this.discoverSunshineHosts();
    }

    return this.buildGpuBuffer();
  }
}

const clientInstance = new S2MoonlightClient();
module.exports = clientInstance;
