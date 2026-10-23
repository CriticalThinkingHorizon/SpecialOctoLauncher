const nativeClient = require('../native/client.cjs');

async function create(rpc) {
  return {
    async now() {
      // Stub adapter for nn::time::StandardSteadyClock::now
      return BigInt(Date.now());
    }
  };
}

module.exports = {create};
