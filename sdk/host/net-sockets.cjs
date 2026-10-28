const dns = require('node:dns/promises');
const net = require('node:net');
const nativeClient = require('../native/client.cjs');
const ftpDefs = require('../native/ftp-functions.json');
const svcDefs = require('../native/service-functions.json');
const sdkDefs = require('../../rpc/sdk-functions.json');

async function create(rpc) {
  const api = await nativeClient.create(rpc, {
    socket: ftpDefs.socket,
    bind: ftpDefs.bind,
    listen: ftpDefs.listen,
    accept: ftpDefs.accept,
    connect: { offset: sdkDefs.connect.offset, hex: sdkDefs.connect.bytes },
    poll: ftpDefs.poll,
    send: ftpDefs.send,
    recv: ftpDefs.recv,
    socketClose: ftpDefs.socketClose,
    getsockname: ftpDefs.getsockname,
    errno: ftpDefs.errno,
    netAddress: ftpDefs.netAddress,
    netStatus: svcDefs.netStatus,
    socketInitialized: svcDefs.socketInitialized
  });

  const SOCKADDR_OFF = 0x0100;
  const ADDRLEN_OFF = 0x0120;
  const POLLFD_OFF = 0x0140;
  const INADDR_OFF = 0x0180;
  const STATUS_OFF = 0x0190;
  const IO_OFF = 0x1000;
  const MAX_IO_BYTES = 960;

  const openFds = new Set();

  return {
    async getInfo() {
      await api.write(INADDR_OFF, Buffer.alloc(8));
      const ipRes = await api.result('netAddress', [api.base + INADDR_OFF]);
      const ipBytes = ipRes === 0 ? await api.read(INADDR_OFF, 4) : Buffer.alloc(4);
      const ipStr = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;

      await api.write(STATUS_OFF, Buffer.alloc(16));
      await api.result('netStatus', [api.base + STATUS_OFF]);
      const netState = (await api.read(STATUS_OFF, 4)).readUInt32LE(0);
      const sockInit = await api.result('socketInitialized');

      return {
        ipWord: ipBytes.readUInt32LE(0),
        ipBytes,
        ipStr,
        netState,
        sockInit
      };
    },
    async listenTcp(port = 8080, backlog = 8) {
      const fd = Number(BigInt.asIntN(32, await api.call('socket', [2, 1, 6])));
      if (fd < 0) return { fd: -1, port, errno: await api.result('errno') };

      const sa = Buffer.alloc(16);
      sa[0] = 16;
      sa[1] = 2;
      sa.writeUInt16BE(port & 0xffff, 2);
      sa.writeUInt32BE(0, 4);
      await api.write(SOCKADDR_OFF, sa);

      let bindRes = Number(BigInt.asIntN(32, await api.call('bind', [fd, api.base + SOCKADDR_OFF, 16])));
      if (bindRes !== 0) {
        const sa2 = Buffer.alloc(16);
        sa2.writeUInt16LE(2, 0);
        sa2.writeUInt16BE(port & 0xffff, 2);
        await api.write(SOCKADDR_OFF, sa2);
        bindRes = Number(BigInt.asIntN(32, await api.call('bind', [fd, api.base + SOCKADDR_OFF, 16])));
      }
      if (bindRes !== 0) {
        const err = await api.result('errno');
        await api.call('socketClose', [fd]);
        return { fd: -1, port, errno: err };
      }

      const listenRes = Number(BigInt.asIntN(32, await api.call('listen', [fd, Math.max(1, backlog)])));
      if (listenRes !== 0) {
        const err = await api.result('errno');
        await api.call('socketClose', [fd]);
        return { fd: -1, port, errno: err };
      }

      openFds.add(fd);
      return { fd, port, errno: 0 };
    },
    async acceptTcp(listenFd, timeoutMs = 0) {
      const pfd = Buffer.alloc(8);
      pfd.writeInt32LE(listenFd, 0);
      pfd.writeInt16LE(1, 4); // POLLIN
      await api.write(POLLFD_OFF, pfd);

      const ready = Number(BigInt.asIntN(32, await api.call('poll', [api.base + POLLFD_OFF, 1, Math.max(0, Math.min(timeoutMs, 1000))])));
      if (ready <= 0) {
        return { clientFd: -1, peerIp: 0, peerPort: 0, ready: 0 };
      }

      const addrLenBuf = Buffer.alloc(4);
      addrLenBuf.writeUInt32LE(16, 0);
      await api.write(ADDRLEN_OFF, addrLenBuf);
      await api.write(SOCKADDR_OFF, Buffer.alloc(16));

      const clientFd = Number(BigInt.asIntN(32, await api.call('accept', [listenFd, api.base + SOCKADDR_OFF, api.base + ADDRLEN_OFF])));
      if (clientFd < 0) {
        return { clientFd: -1, peerIp: 0, peerPort: 0, ready: 0 };
      }

      openFds.add(clientFd);
      const peerSa = await api.read(SOCKADDR_OFF, 16);
      const peerPort = peerSa.readUInt16BE(2);
      const peerIp = peerSa.readUInt32LE(4);
      return { clientFd, peerIp, peerPort, ready: 1 };
    },
    async connectTcp(ipWord, port) {
      const fd = Number(BigInt.asIntN(32, await api.call('socket', [2, 1, 6])));
      if (fd < 0) return { fd: -1, errno: await api.result('errno') };

      const sa = Buffer.alloc(16);
      sa[0] = 16;
      sa[1] = 2;
      sa.writeUInt16BE(port & 0xffff, 2);
      sa.writeUInt32LE(ipWord >>> 0, 4);
      await api.write(SOCKADDR_OFF, sa);

      let connRes = Number(BigInt.asIntN(32, await api.call('connect', [fd, api.base + SOCKADDR_OFF, 16])));
      if (connRes !== 0) {
        const sa2 = Buffer.alloc(16);
        sa2.writeUInt16LE(2, 0);
        sa2.writeUInt16BE(port & 0xffff, 2);
        sa2.writeUInt32LE(ipWord >>> 0, 4);
        await api.write(SOCKADDR_OFF, sa2);
        connRes = Number(BigInt.asIntN(32, await api.call('connect', [fd, api.base + SOCKADDR_OFF, 16])));
      }
      if (connRes !== 0) {
        const err = await api.result('errno');
        await api.call('socketClose', [fd]);
        return { fd: -1, errno: err };
      }

      openFds.add(fd);
      return { fd, errno: 0 };
    },
    async getSockName(fd) {
      const addrLenBuf = Buffer.alloc(4);
      addrLenBuf.writeUInt32LE(16, 0);
      await api.write(ADDRLEN_OFF, addrLenBuf);
      await api.write(SOCKADDR_OFF, Buffer.alloc(16));
      const res = Number(BigInt.asIntN(32, await api.call('getsockname', [fd, api.base + SOCKADDR_OFF, api.base + ADDRLEN_OFF])));
      if (res !== 0) {
        return { localIp: 0, localPort: 0, errno: await api.result('errno') };
      }
      const sa = await api.read(SOCKADDR_OFF, 16);
      return {
        localIp: sa.readUInt32LE(4),
        localPort: sa.readUInt16BE(2),
        errno: 0
      };
    },
    async getLastErrno() {
      return { errno: await api.result('errno') };
    },
    async recvSocket(fd, maxBytes = 960, timeoutMs = 50) {
      const pfd = Buffer.alloc(8);
      pfd.writeInt32LE(fd, 0);
      pfd.writeInt16LE(1, 4); // POLLIN
      await api.write(POLLFD_OFF, pfd);

      const ready = Number(BigInt.asIntN(32, await api.call('poll', [api.base + POLLFD_OFF, 1, Math.max(0, Math.min(timeoutMs, 1000))])));
      if (ready <= 0) {
        return { bytesRead: 0, ready: 0, data: Buffer.alloc(0) };
      }

      const limit = Math.max(1, Math.min(maxBytes, MAX_IO_BYTES));
      await api.write(IO_OFF, Buffer.alloc(limit));
      const n = Number(BigInt.asIntN(32, await api.call('recv', [fd, api.base + IO_OFF, limit, 0])));
      if (n <= 0) {
        return { bytesRead: 0, ready: n === 0 ? 2 : 0, data: Buffer.alloc(0) };
      }
      const data = await api.read(IO_OFF, n);
      return { bytesRead: n, ready: 1, data };
    },
    async sendSocket(fd, dataBuf) {
      const slice = dataBuf.subarray(0, MAX_IO_BYTES);
      if (slice.length === 0) return { bytesSent: 0, errno: 0 };
      await api.write(IO_OFF, slice);
      const n = Number(BigInt.asIntN(32, await api.call('send', [fd, api.base + IO_OFF, slice.length, 0])));
      if (n < 0) {
        return { bytesSent: 0, errno: await api.result('errno') };
      }
      return { bytesSent: n, errno: 0 };
    },
    async closeSocket(fd) {
      openFds.delete(fd);
      const res = Number(BigInt.asIntN(32, await api.call('socketClose', [fd])));
      return { result: res };
    },
    async httpRequest({ method = 'GET', urlStr = '', reqBody = Buffer.alloc(0), maxBytes = 960, savePath = '', fsService = null }) {
      const normalizedUrl = /^https?:\/\//i.test(urlStr) ? urlStr : `http://${urlStr}`;
      let parsed;
      try {
        parsed = new URL(normalizedUrl);
      } catch {
        return { statusCode: 0, totalBytes: 0, errno: 22, body: Buffer.alloc(0) };
      }

      const isHttps = parsed.protocol === 'https:';
      const maxRead = savePath ? 0xB000 : Math.max(1, Math.min(maxBytes || 960, 960));

      let statusCode = 0;
      let fullBody = Buffer.alloc(0);
      let errno = 0;

      // For plain http://, execute directly on the Switch 2's BSD socket stack (nn::socket::Socket -> Connect -> Send -> Poll -> Recv -> Close)
      if (!isHttps) {
        let hostIp = parsed.hostname;
        if (!net.isIPv4(hostIp)) {
          try {
            const resolved = await dns.lookup(hostIp, { family: 4 });
            hostIp = resolved.address;
          } catch {
            errno = 2;
          }
        }
        if (net.isIPv4(hostIp)) {
          const octets = hostIp.split('.').map(Number);
          const ipBuf = Buffer.from(octets);
          const ipWord = ipBuf.readUInt32LE(0);
          const port = Number(parsed.port) || 80;
          const conn = await this.connectTcp(ipWord, port);
          if (conn.fd >= 0) {
            const fd = conn.fd;
            try {
              const reqPath = (parsed.pathname || '/') + (parsed.search || '');
              const hdrLines = [
                `${method} ${reqPath} HTTP/1.1`,
                `Host: ${parsed.host}`,
                'User-Agent: Switch2-Homebrew-SDK/1.0',
                'Accept: */*',
                'Connection: close'
              ];
              if (method === 'POST' || reqBody.length > 0) {
                hdrLines.push(`Content-Length: ${reqBody.length}`);
                hdrLines.push('Content-Type: application/octet-stream');
              }
              const headBuf = Buffer.from(hdrLines.join('\r\n') + '\r\n\r\n', 'utf8');
              const fullReq = reqBody.length > 0 ? Buffer.concat([headBuf, reqBody]) : headBuf;

              for (let off = 0; off < fullReq.length; off += MAX_IO_BYTES) {
                const slice = fullReq.subarray(off, off + MAX_IO_BYTES);
                await api.write(IO_OFF, slice);
                const s = Number(BigInt.asIntN(32, await api.call('send', [fd, api.base + IO_OFF, slice.length, 0])));
                if (s <= 0) break;
              }

              const chunks = [];
              let totalCollected = 0;
              const chunkCap = 0x4000;
              for (let iter = 0; iter < 16 && totalCollected < maxRead + 2048; iter++) {
                const pfd = Buffer.alloc(8);
                pfd.writeInt32LE(fd, 0);
                pfd.writeInt16LE(1, 4);
                await api.write(POLLFD_OFF, pfd);
                const ready = Number(BigInt.asIntN(32, await api.call('poll', [api.base + POLLFD_OFF, 1, 1500])));
                if (ready <= 0) break;

                const n = Number(BigInt.asIntN(32, await api.call('recv', [fd, api.base + IO_OFF, chunkCap, 0])));
                if (n <= 0) break;
                const part = await api.read(IO_OFF, n);
                chunks.push(part);
                totalCollected += n;
              }

              const rawResp = Buffer.concat(chunks);
              const sepIdx = rawResp.indexOf('\r\n\r\n');
              if (sepIdx >= 0) {
                const statusLine = rawResp.subarray(0, Math.min(sepIdx, 128)).toString('utf8').split('\r\n')[0] || '';
                const m = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
                statusCode = m ? Number(m[1]) : 200;
                fullBody = rawResp.subarray(sepIdx + 4);
              } else if (rawResp.length > 0) {
                statusCode = 200;
                fullBody = rawResp;
              }
            } finally {
              await this.closeSocket(fd);
            }
          } else {
            errno = conn.errno || 111;
          }
        }
      }

      // Fallback / HTTPS support via host fetch if HTTPS or if console route could not reach external internet
      if (statusCode === 0) {
        try {
          const resp = await fetch(normalizedUrl, {
            method,
            body: (method === 'POST' && reqBody.length > 0) ? reqBody : undefined,
            headers: { 'User-Agent': 'Switch2-Homebrew-SDK/1.0' }
          });
          statusCode = resp.status;
          const arrBuf = await resp.arrayBuffer();
          fullBody = Buffer.from(arrBuf);
          errno = 0;
        } catch (err) {
          errno = errno || 113;
        }
      }

      let totalBytes = fullBody.length;
      if (savePath && fsService && statusCode >= 200 && statusCode < 400) {
        const toWrite = fullBody.subarray(0, 0xB000);
        await fsService.deletePath(savePath);
        const wr = await fsService.writeBytesAt(savePath, 0, toWrite);
        errno = wr.result;
        totalBytes = wr.bytesWritten;
      }

      const returnedBody = fullBody.subarray(0, Math.min(fullBody.length, 960));
      return {
        statusCode,
        totalBytes,
        errno,
        body: returnedBody
      };
    },
    async closeAll() {
      for (const fd of openFds) {
        try { await api.call('socketClose', [fd]); } catch {}
      }
      openFds.clear();
    }
  };
}

module.exports = { create };
