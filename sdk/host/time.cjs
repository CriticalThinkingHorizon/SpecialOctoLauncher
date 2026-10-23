const nativeClient = require('../native/client.cjs');

async function create(rpc) {
  return {
    async now() {
      return BigInt(Date.now());
    },
    async ToPosixTimeFromUtc(calendarTime) {
      return 0n;
    }
  };
}

module.exports = {create};
