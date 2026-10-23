const nativeClient = require('../native/client.cjs');
const ftpDefs = require('../native/ftp-functions.json');

async function create(rpc) {
  const client = await nativeClient.create(rpc, {
    openFile: ftpDefs.openFile,
    readFile: ftpDefs.readFile,
    writeFile: ftpDefs.writeFile,
    closeFile: ftpDefs.closeFile,
    fileSize: ftpDefs.fileSize
  });

  return {
    async fileSize(handle) {
      const res = await client.call('fileSize', [0n, handle]);
      return res;
    },
    async close(handle) {
      return await client.call('closeFile', [handle]);
    }
  };
}

module.exports = {create};
