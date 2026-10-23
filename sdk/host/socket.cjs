const nativeClient = require('../native/client.cjs');
const serviceDefs = require('../native/service-functions.json');
const ftpDefs = require('../native/ftp-functions.json');

async function create(rpc) {
  const client = await nativeClient.create(rpc, {
    socket: serviceDefs.socket,
    bind: ftpDefs.bind,
    listen: ftpDefs.listen,
    accept: ftpDefs.accept,
    send: serviceDefs.sendto || ftpDefs.send,
    recv: serviceDefs.recv || ftpDefs.recv,
    close: serviceDefs.socketClose || ftpDefs.socketClose,
    errno: serviceDefs.errno || ftpDefs.errno,
    IsInitialized: serviceDefs.socketInitialized
  });

  return {
    async socket(domain, type, protocol) {
      return await client.call('socket', [domain, type, protocol]);
    },
    async bind(sockfd, addr, addrlen) {
      return await client.call('bind', [sockfd, addr, addrlen]);
    },
    async listen(sockfd, backlog) {
      return await client.call('listen', [sockfd, backlog]);
    },
    async accept(sockfd, addr, addrlen) {
      return await client.call('accept', [sockfd, addr, addrlen]);
    },
    async send(sockfd, buf, len, flags) {
      return await client.call('send', [sockfd, buf, len, flags]);
    },
    async recv(sockfd, buf, len, flags) {
      return await client.call('recv', [sockfd, buf, len, flags]);
    },
    async Close(sockfd) {
      return await client.call('close', [sockfd]);
    },
    async GetLastErrno() {
      return await client.call('errno', []);
    },
    async IsInitialized() {
      return await client.call('IsInitialized', []);
    }
  };
}

module.exports = {create};
