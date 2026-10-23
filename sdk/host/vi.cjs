const nativeClient = require('../native/client.cjs');

async function create(rpc) {
  return {
    async Initialize() {
      return 0n;
    },
    async Finalize() {
      return 0n;
    },
    async OpenDefaultDisplay(outDisplay) {
      return 0n;
    },
    async CreateLayer(outLayer, display) {
      return 0n;
    },
    async GetNativeWindow(outNativeWindow, layer) {
      return 0n;
    }
  };
}

module.exports = {create};
