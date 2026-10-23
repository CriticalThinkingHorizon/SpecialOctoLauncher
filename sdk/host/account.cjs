const nativeClient = require('../native/client.cjs');

async function create(rpc) {
  return {
    async openUser(uidLow, uidHigh) {
      // Stub adapter for nn::account::OpenUser
      return 0n;
    }
  };
}

module.exports = {create};
