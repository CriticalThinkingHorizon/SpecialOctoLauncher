const nativeClient = require('../native/client.cjs');
const ftpDefs = require('../native/ftp-functions.json');
const svcDefs = require('../native/service-functions.json');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function create(rpc, fsService) {
  const api = await nativeClient.create(rpc, {
    socket: ftpDefs.socket,
    bind: ftpDefs.bind,
    listen: ftpDefs.listen,
    accept: ftpDefs.accept,
    poll: ftpDefs.poll,
    send: ftpDefs.send,
    recv: ftpDefs.recv,
    socketClose: ftpDefs.socketClose,
    getsockname: ftpDefs.getsockname,
    errno: ftpDefs.errno,
    netAddress: ftpDefs.netAddress,
    socketInitialized: svcDefs.socketInitialized
  });

  // Memory layout inside api.base (64 KiB):
  // 0x0100: sockaddr_in (16 bytes)
  // 0x0120: addrlen (4 bytes)
  // 0x0140: pollfd (8 bytes: int fd, short events, short revents)
  // 0x0180: in_addr (4 bytes)
  // 0x1000: recv buffer (4 KiB)
  // 0x2000: send buffer (48 KiB, up to 0xE000)
  const SOCKADDR_OFF = 0x0100;
  const ADDRLEN_OFF = 0x0120;
  const POLLFD_OFF = 0x0140;
  const INADDR_OFF = 0x0180;
  const RECV_OFF = 0x1000;
  const SEND_OFF = 0x2000;
  const MAX_SEND_CHUNK = 0x8000;

  let listenFd = -1;
  let boundPort = 8080;
  let consoleIp = '0.0.0.0';
  let requestCount = 0;
  let bytesSent = 0;
  const recentLogs = [];

  async function resolveIp() {
    await api.write(INADDR_OFF, Buffer.alloc(8));
    const res = await api.result('netAddress', [api.base + INADDR_OFF]);
    if (res === 0) {
      const b = await api.read(INADDR_OFF, 4);
      consoleIp = `${b[0]}.${b[1]}.${b[2]}.${b[3]}`;
    }
    return consoleIp;
  }

  async function ensureListening() {
    if (listenFd >= 0) return true;
    await resolveIp();
    const fd = Number(BigInt.asIntN(32, await api.call('socket', [2, 1, 6]))); // AF_INET=2, SOCK_STREAM=1, IPPROTO_TCP=6
    if (fd < 0) {
      recentLogs.unshift(`[ERR] socket() failed: ${fd}`);
      return false;
    }

    for (const candidatePort of [8080, 8081, 8000, 8888, 39381]) {
      const sa = Buffer.alloc(16);
      sa[0] = 16; // sin_len (BSD sockaddr_in)
      sa[1] = 2;  // sin_family = AF_INET
      sa.writeUInt16BE(candidatePort, 2);
      sa.writeUInt32BE(0, 4); // INADDR_ANY = 0.0.0.0
      await api.write(SOCKADDR_OFF, sa);

      let bindRes = Number(BigInt.asIntN(32, await api.call('bind', [fd, api.base + SOCKADDR_OFF, 16])));
      if (bindRes !== 0) {
        // Retry with standard sin_family uint16LE(2) at offset 0 in case sin_len is 0
        const sa2 = Buffer.alloc(16);
        sa2.writeUInt16LE(2, 0);
        sa2.writeUInt16BE(candidatePort, 2);
        await api.write(SOCKADDR_OFF, sa2);
        bindRes = Number(BigInt.asIntN(32, await api.call('bind', [fd, api.base + SOCKADDR_OFF, 16])));
      }
      if (bindRes === 0) {
        const listenRes = Number(BigInt.asIntN(32, await api.call('listen', [fd, 8])));
        if (listenRes === 0) {
          listenFd = fd;
          boundPort = candidatePort;
          recentLogs.unshift(`[READY] Listening on http://${consoleIp}:${boundPort}/`);
          return true;
        }
      }
    }

    await api.call('socketClose', [fd]);
    recentLogs.unshift('[ERR] bind/listen failed on ports 8080..39381');
    return false;
  }

  async function sendAll(clientFd, buf) {
    let offset = 0;
    while (offset < buf.length) {
      const chunk = buf.subarray(offset, offset + MAX_SEND_CHUNK);
      await api.write(SEND_OFF, chunk);
      const sent = Number(BigInt.asIntN(32, await api.call('send', [clientFd, api.base + SEND_OFF, chunk.length, 0])));
      if (sent <= 0) break;
      offset += sent;
      bytesSent += sent;
    }
  }

  function buildDirectoryHtml(pathStr, entries) {
    const cleanPath = !pathStr || pathStr === '/' ? '/' : pathStr;
    let parentHref = '/';
    if (cleanPath !== '/') {
      const trimmed = cleanPath.replace(/\/+$/, '');
      const lastSlash = trimmed.lastIndexOf('/');
      parentHref = lastSlash > 0 ? '/?path=' + encodeURIComponent(trimmed.slice(0, lastSlash + 1)) : '/';
    }

    const rowsHtml = entries.map(e => {
      const isDir = e.type === 'dir';
      let nextPath;
      if (cleanPath === '/') {
        nextPath = e.name + '/';
      } else {
        nextPath = (cleanPath.endsWith('/') ? cleanPath : cleanPath + '/') + e.name + (isDir ? '/' : '');
      }
      const href = isDir
        ? `/?path=${encodeURIComponent(nextPath)}`
        : `/?view=${encodeURIComponent(nextPath)}`;
      const dlHref = !isDir
        ? `<a class="btn" href="/?raw=${encodeURIComponent(nextPath)}">Download</a>`
        : '';
      const badge = isDir ? '<span class="tag dir">DIR</span>' : '<span class="tag file">FILE</span>';
      return `<tr>
        <td>${badge} <a href="${href}">${escapeHtml(e.name)}${isDir ? '/' : ''}</a></td>
        <td class="size">${isDir && e.size === 0 ? '-' : formatBytes(e.size)}</td>
        <td class="act">${dlHref}</td>
      </tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>S2 On-Console HTTP File Server</title>
<style>
  body { background:#0b1522; color:#e8f2ff; font-family:Consolas,monospace,sans-serif; margin:0; padding:24px; }
  .card { max-width:920px; margin:0 auto; background:#112236; border:1px solid #264a73; border-radius:12px; padding:22px; box-shadow:0 8px 28px rgba(0,0,0,0.45); }
  h1 { margin:0 0 8px 0; font-size:22px; color:#5ce6f6; }
  .sub { color:#8ab4d8; font-size:13px; margin-bottom:16px; }
  .nav { background:#0d1a2b; padding:10px 14px; border-radius:8px; margin-bottom:16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .nav a { color:#5ce6f6; text-decoration:none; font-weight:bold; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:10px 8px; border-bottom:1px solid #1d3552; }
  th { color:#8ab4d8; font-size:12px; text-transform:uppercase; }
  a { color:#d2ebff; text-decoration:none; }
  a:hover { color:#5ce6f6; text-decoration:underline; }
  .tag { display:inline-block; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; margin-right:6px; }
  .dir { background:#1b5a7a; color:#7cf2ff; }
  .file { background:#243b55; color:#b8d4f2; }
  .size { width:120px; color:#9ab8d8; }
  .act { width:100px; text-align:right; }
  .btn { background:#1e5840; color:#7affa8; padding:4px 8px; border-radius:5px; font-size:12px; }
</style>
</head>
<body>
<div class="card">
  <h1>S2 On-Console HTTP File Server</h1>
  <div class="sub">Served directly from S2 via <code>nn::socket</code> &amp; <code>nn::fs</code> (${consoleIp}:${boundPort})</div>
  <div class="nav">
    <span>Path: <strong>${escapeHtml(cleanPath)}</strong></span>
    ${cleanPath !== '/' ? `<a href="${parentHref}">[&uarr; Up One Level]</a> <a href="/">[Root Mounts]</a>` : ''}
  </div>
  <table>
    <thead><tr><th>Name</th><th>Size</th><th>Action</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="3">(Empty directory)</td></tr>'}</tbody>
  </table>
</div>
</body>
</html>`;
  }

  function buildFileViewHtml(filePath, info) {
    const lastSlash = filePath.lastIndexOf('/');
    const parentPath = lastSlash > 0 ? filePath.slice(0, lastSlash + 1) : '/';
    const parentHref = `/?path=${encodeURIComponent(parentPath)}`;

    // Render printable text or hex+ASCII preview
    let contentText = '';
    const buf = info.buffer;
    let nonPrintable = 0;
    const checkLen = Math.min(buf.length, 512);
    for (let i = 0; i < checkLen; i++) {
      const c = buf[i];
      if (c !== 9 && c !== 10 && c !== 13 && (c < 32 || c > 126)) nonPrintable++;
    }
    if (checkLen > 0 && nonPrintable / checkLen > 0.20) {
      // Hex + ASCII dump for binary files
      const lines = [];
      const limit = Math.min(buf.length, 4096);
      for (let off = 0; off < limit; off += 16) {
        const slice = buf.subarray(off, off + 16);
        const hex = Array.from(slice, b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
        const asc = Array.from(slice, b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
        lines.push(`${off.toString(16).padStart(6, '0')}  ${hex}  |${asc}|`);
      }
      if ((info.fileSize || buf.length) > limit) lines.push(`... (${(info.fileSize || buf.length) - limit} more bytes — click Download for full file)`);
      contentText = lines.join('\n');
    } else {
      contentText = buf.toString('utf8');
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(filePath)} - S2 HTTP Server</title>
<style>
  body { background:#0b1522; color:#e8f2ff; font-family:Consolas,monospace; margin:0; padding:24px; }
  .card { max-width:960px; margin:0 auto; background:#112236; border:1px solid #264a73; border-radius:12px; padding:22px; }
  .nav { background:#0d1a2b; padding:10px 14px; border-radius:8px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; }
  a { color:#5ce6f6; text-decoration:none; font-weight:bold; }
  pre { background:#07101a; padding:16px; border-radius:8px; overflow-x:auto; color:#d4ecff; line-height:1.45; max-height:70vh; }
</style>
</head>
<body>
<div class="card">
  <div class="nav">
    <span>File: <strong>${escapeHtml(filePath)}</strong> (${formatBytes(info.fileSize)}${info.isSbContainer ? ', SB4 Container Decompressed' : ''})</span>
    <span><a href="${parentHref}">[&larr; Back to Folder]</a> &nbsp; <a href="/?raw=${encodeURIComponent(filePath)}">[Download Raw]</a></span>
  </div>
  <pre>${escapeHtml(contentText)}</pre>
</div>
</body>
</html>`;
  }

  async function handleOneClient(clientFd) {
    try {
      // Poll clientFd up to 150ms for the incoming HTTP request
      const pfd = Buffer.alloc(8);
      pfd.writeInt32LE(clientFd, 0);
      pfd.writeInt16LE(1, 4); // POLLIN = 1
      await api.write(POLLFD_OFF, pfd);
      const ready = Number(BigInt.asIntN(32, await api.call('poll', [api.base + POLLFD_OFF, 1, 150])));
      if (ready <= 0) return;

      await api.write(RECV_OFF, Buffer.alloc(2048));
      const n = Number(BigInt.asIntN(32, await api.call('recv', [clientFd, api.base + RECV_OFF, 2047, 0])));
      if (n <= 0) return;

      const reqText = (await api.read(RECV_OFF, n)).toString('utf8');
      const firstLine = reqText.split(/\r?\n/)[0] || 'GET / HTTP/1.1';
      const parts = firstLine.split(' ');
      const rawUrl = parts[1] || '/';

      requestCount++;
      const urlObj = new URL(rawUrl, `http://${consoleIp}:${boundPort}`);
      const pathname = urlObj.pathname;

      if (pathname === '/favicon.ico') {
        const hdr = Buffer.from('HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n');
        await sendAll(clientFd, hdr);
        return;
      }

      const rawParam = urlObj.searchParams.get('raw');
      const viewParam = urlObj.searchParams.get('view');
      const pathParam = urlObj.searchParams.get('path') || '/';

      if (rawParam) {
        recentLogs.unshift(`GET raw ${rawParam}`);
        if (rawParam.startsWith('exefs:')) {
          const item = await fsService.resolveExefsPath(rawParam);
          if (!item || item.isDir) {
            const body = Buffer.from(`Entry not found: ${rawParam}`);
            const hdr = Buffer.from(`HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`);
            await sendAll(clientFd, Buffer.concat([hdr, body]));
          } else {
            const rawParts = rawParam.split('/').filter(Boolean);
            let filename = rawParts.pop() || 'dump.bin';
            if (filename.startsWith('.') && rawParts.length > 0) {
              filename = `${rawParts[rawParts.length - 1]}${filename}.bin`;
            }
            const total = item.size || 0;
            const hdr = Buffer.from(
              `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="${filename}"\r\nContent-Length: ${total}\r\nConnection: close\r\n\r\n`
            );
            await sendAll(clientFd, hdr);

            if (total > 0 && item.address) {
              let offset = 0;
              const CHUNK = 0x8000;
              while (offset < total) {
                const thisLen = Math.min(CHUNK, total - offset);
                // Attempt direct zero-copy pointer send from S2 RAM first
                let sent = Number(BigInt.asIntN(32, await api.call('send', [clientFd, item.address + offset, thisLen, 0])));
                if (sent <= 0) {
                  // Fallback: read chunk via RPC into host and send via SEND_OFF
                  try {
                    const chunkBuf = await rpc.read(item.address + offset, thisLen);
                    await api.write(SEND_OFF, chunkBuf);
                    sent = Number(BigInt.asIntN(32, await api.call('send', [clientFd, api.base + SEND_OFF, chunkBuf.length, 0])));
                  } catch (readErr) {
                    recentLogs.unshift(`[ERR] stream 0x${(item.address + offset).toString(16)}: ${readErr.message}`);
                    break;
                  }
                  if (sent <= 0) break;
                }
                offset += sent;
                bytesSent += sent;
              }
              recentLogs.unshift(`[DUMP] ${filename} (${formatBytes(offset)})`);
            }
          }
        } else {
          const info = await fsService.readRawFile(rawParam, 0x4000000);
          if (info.result !== 0) {
            const body = Buffer.from(`Error reading ${rawParam}: 0x${info.result.toString(16)}`);
            const hdr = Buffer.from(`HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`);
            await sendAll(clientFd, Buffer.concat([hdr, body]));
          } else {
            const filename = rawParam.split('/').filter(Boolean).pop() || 'download.bin';
            const hdr = Buffer.from(
              `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="${filename}"\r\nContent-Length: ${info.buffer.length}\r\nConnection: close\r\n\r\n`
            );
            await sendAll(clientFd, hdr);
            await sendAll(clientFd, info.buffer);
          }
        }
      } else if (viewParam) {
        recentLogs.unshift(`GET view ${viewParam}`);
        const info = await fsService.readRawFile(viewParam, 0xB000);
        const html = info.result === 0
          ? buildFileViewHtml(viewParam, info)
          : `<html><body style="background:#0b1522;color:#ff8080;font-family:monospace;padding:24px"><h3>Unable to read ${escapeHtml(viewParam)} (Result 0x${info.result.toString(16)})</h3><a style="color:#5ce6f6" href="/">Back</a></body></html>`;
        const body = Buffer.from(html, 'utf8');
        const hdr = Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`);
        await sendAll(clientFd, Buffer.concat([hdr, body]));
      } else {
        recentLogs.unshift(`GET dir ${pathParam}`);
        const listing = await fsService.listDirectory(pathParam, 32, 0);
        const html = buildDirectoryHtml(pathParam, listing.entries || []);
        const body = Buffer.from(html, 'utf8');
        const hdr = Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`);
        await sendAll(clientFd, Buffer.concat([hdr, body]));
      }

      if (recentLogs.length > 8) recentLogs.length = 8;
    } finally {
      await api.call('socketClose', [clientFd]);
    }
  }

  return {
    async step(action = 0) {
      if (action === 1 && listenFd >= 0) {
        await api.call('socketClose', [listenFd]);
        listenFd = -1;
        recentLogs.unshift('[INFO] Server socket restarted.');
      }

      const ok = await ensureListening();
      if (ok && listenFd >= 0) {
        // Check up to 2 pending connections per poll tick using non-blocking Poll(timeout=0)
        for (let i = 0; i < 2; i++) {
          const pfd = Buffer.alloc(8);
          pfd.writeInt32LE(listenFd, 0);
          pfd.writeInt16LE(1, 4); // POLLIN = 1
          await api.write(POLLFD_OFF, pfd);

          const pollRes = Number(BigInt.asIntN(32, await api.call('poll', [api.base + POLLFD_OFF, 1, 0])));
          if (pollRes <= 0) break;

          const addrLenBuf = Buffer.alloc(4);
          addrLenBuf.writeUInt32LE(16, 0);
          await api.write(ADDRLEN_OFF, addrLenBuf);
          const clientFd = Number(BigInt.asIntN(32, await api.call('accept', [listenFd, api.base + SOCKADDR_OFF, api.base + ADDRLEN_OFF])));
          if (clientFd < 0) break;

          await handleOneClient(clientFd);
        }
      }

      const lines = [
        '=== S2 ON-CONSOLE HTTP FILE SERVER ===',
        '',
        `  URL:     http://${consoleIp}:${boundPort}/`,
        `  STATUS:  ${listenFd >= 0 ? 'ONLINE (Listening on S2)' : 'ERROR (Socket bind failed)'}`,
        `  MOUNTS:  rom:/   save:/   tmp:/   exefs:/`,
        `  STATS:   ${requestCount} HTTP Requests  |  ${formatBytes(bytesSent)} Sent`,
        '',
        '[RECENT BROWSER REQUESTS]'
      ];
      if (recentLogs.length === 0) {
        lines.push('  (Waiting for browser connection...)');
        lines.push(`  Open http://${consoleIp}:${boundPort}/ on PC or Phone`);
      } else {
        for (const l of recentLogs.slice(0, 8)) {
          lines.push('  ' + l.substring(0, 45));
        }
      }
      while (lines.length < 18) lines.push('');
      lines.push('------------------------------------------------');
      lines.push('X: Restart Socket                  -: Exit to Menu');

      return {
        listening: listenFd >= 0 ? 1 : 0,
        port: boundPort,
        requestCount,
        lines
      };
    },
    async close() {
      if (listenFd >= 0) {
        try { await api.call('socketClose', [listenFd]); } catch {}
        listenFd = -1;
      }
    }
  };
}

module.exports = { create };
