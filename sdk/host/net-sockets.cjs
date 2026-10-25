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
    async closeAll() {
      for (const fd of openFds) {
        try { await api.call('socketClose', [fd]); } catch {}
      }
      openFds.clear();
    }
  };
}

module.exports = { create };
