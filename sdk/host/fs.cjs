const nativeClient = require('../native/client.cjs');
const ftpDefs = require('../native/ftp-functions.json');

async function create(rpc) {
  const client = await nativeClient.create(rpc, {
    OpenFile: ftpDefs.openFile,
    ReadFile: ftpDefs.readFile,
    WriteFile: ftpDefs.writeFile,
    CloseFile: ftpDefs.closeFile,
    GetFileSize: ftpDefs.fileSize,
    SetFileSize: ftpDefs.setFileSize,
    FlushFile: ftpDefs.flushFile,
    CreateFile: ftpDefs.createFile,
    DeleteFile: ftpDefs.deleteFile,
    RenameFile: ftpDefs.renameFile,
    OpenDirectory: ftpDefs.openDirectory,
    ReadDirectory: ftpDefs.readDirectory,
    CloseDirectory: ftpDefs.closeDirectory,
    CreateDirectory: ftpDefs.createDirectory,
    DeleteDirectory: ftpDefs.deleteDirectory,
    RenameDirectory: ftpDefs.renameDirectory,
    GetEntryType: ftpDefs.entryType,
    CommitSaveData: ftpDefs.commit
  });

  return {
    async OpenFile(handleOut, path, mode) {
      return await client.call('OpenFile', [handleOut, path, mode]);
    },
    async ReadFile(handle, offset, buffer, size) {
      return await client.call('ReadFile', [handle, offset, buffer, size]);
    },
    async WriteFile(handle, offset, buffer, size, option) {
      return await client.call('WriteFile', [handle, offset, buffer, size, option]);
    },
    async CloseFile(handle) {
      return await client.call('CloseFile', [handle]);
    },
    async GetFileSize(sizeOut, handle) {
      return await client.call('GetFileSize', [sizeOut, handle]);
    }
  };
}

module.exports = {create};
