const nativeClient = require('../native/client.cjs');
const hidDefs = require('../native/hid-functions.json');

async function create(rpc) {
  const client = await nativeClient.create(rpc, {
    GetNpadState: hidDefs.padFullKey,
    GetSixAxisSensorHandles: hidDefs.motionHandles,
    StartSixAxisSensor: hidDefs.motionStart,
    StopSixAxisSensor: hidDefs.motionStop,
    GetSixAxisSensorStates: hidDefs.motionRead,
    GetVibrationDeviceHandles: hidDefs.vibrationHandles,
    InitializeVibrationDevice: hidDefs.vibrationInit,
    SendVibrationValue: hidDefs.vibrationSend,
    GetActualVibrationValue: hidDefs.vibrationRead,
    IsVibrationPermitted: hidDefs.vibrationPermitted,
    GetMouseState: hidDefs.mouse,
    GetKeyboardStates: hidDefs.keyboard,
    GetNpadStyleSet: hidDefs.style,
    GetNpadControllerColor: hidDefs.color,
    GetPlayerLedPattern: hidDefs.led
  });

  return {
    async GetNpadState(outState, npadId) {
      return await client.call('GetNpadState', [outState, npadId]);
    },
    async StartSixAxisSensor(handle) {
      return await client.call('StartSixAxisSensor', [handle]);
    },
    async StopSixAxisSensor(handle) {
      return await client.call('StopSixAxisSensor', [handle]);
    },
    async GetSixAxisSensorStates(outCount, outStates, maxCount, handle) {
      return await client.call('GetSixAxisSensorStates', [outCount, outStates, maxCount, handle]);
    },
    async SendVibrationValue(handle, value) {
      return await client.call('SendVibrationValue', [handle, value]);
    },
    async GetMouseState(outState) {
      return await client.call('GetMouseState', [outState]);
    },
    async GetKeyboardStates(outCount, outStates, maxCount) {
      return await client.call('GetKeyboardStates', [outCount, outStates, maxCount]);
    }
  };
}

module.exports = {create};
