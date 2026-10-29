# Native Functions Reference by Namespace

This document provides a comprehensive reference of native functions available in the SDK definitions, categorized strictly by their native C++ namespaces and classes, along with their mangled symbols, offsets, and argument signatures based on repository abstractions and functions present in the loaded module's MOD0 export symbol table.

---

## 1. `nn::socket`

Functions related to BSD sockets and network operations.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `Accept` | `_ZN2nn6socket6AcceptEiP8sockaddrPj` | Accepts an incoming connection on a socket.<br>**Args:** `int sockfd`, `struct sockaddr *addr`, `socklen_t *addrlen` |
| `Bind` | `_ZN2nn6socket4BindEiPK8sockaddrj` | Assigns an address to a socket.<br>**Args:** `int sockfd`, `const struct sockaddr *addr`, `socklen_t addrlen` |
| `Listen` | `_ZN2nn6socket6ListenEii` | Listens for connections on a socket.<br>**Args:** `int sockfd`, `int backlog` |
| `Socket` | `_ZN2nn6socket6SocketEiii` | Creates an endpoint for communication.<br>**Args:** `int domain`, `int type`, `int protocol` |
| `Close` (or `socketClose`) | `_ZN2nn6socket5CloseEi` | Closes a socket descriptor.<br>**Args:** `int sockfd` |
| `Send` | `_ZN2nn6socket4SendEiPKvmi` | Sends data on a connected socket.<br>**Args:** `int sockfd`, `const void *buf`, `size_t len`, `int flags` |
| `SendTo` | `_ZN2nn6socket6SendToEiPKvmiPK8sockaddrj` | Sends data on a socket (connected or unconnected).<br>**Args:** `int sockfd`, `const void *buf`, `size_t len`, `int flags`, `const struct sockaddr *dest_addr`, `socklen_t addrlen` |
| `Recv` | `_ZN2nn6socket4RecvEiPvmi` | Receives data from a socket.<br>**Args:** `int sockfd`, `void *buf`, `size_t len`, `int flags` |
| `Poll` | `_ZN2nn6socket4PollEP6pollfdmi` | Waits for events on file descriptors.<br>**Args:** `struct pollfd *fds`, `nfds_t nfds`, `int timeout` |
| `GetSockName` | `_ZN2nn6socket11GetSockNameEiP8sockaddrPj` | Gets the current address to which the socket is bound.<br>**Args:** `int sockfd`, `struct sockaddr *addr`, `socklen_t *addrlen` |
| `GetLastErrno` (`errno`) | `_ZN2nn6socket12GetLastErrnoEv` | Retrieves the last socket error number.<br>**Args:** None (`void`) |
| `IsInitialized` (`socketInitialized`) | `_ZN2nn6socket13IsInitializedEv` | Checks whether the socket library is initialized.<br>**Args:** None (`void`) |

---

## 2. `nn::fs`

Filesystem and save data management functions.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `OpenFile` | `_ZN2nn2fs8OpenFileEPNS0_10FileHandleEPKci` | Opens a file.<br>**Args:** `FileHandle *outHandle`, `const char *path`, `int mode` |
| `ReadFile` | `_ZN2nn2fs8ReadFileENS0_10FileHandleElPvm` | Reads data from an open file.<br>**Args:** `FileHandle handle`, `int64_t offset`, `void *buffer`, `size_t size` |
| `WriteFile` | `_ZN2nn2fs9WriteFileENS0_10FileHandleElPKvmRKNS0_11WriteOptionE` | Writes data to an open file.<br>**Args:** `FileHandle handle`, `int64_t offset`, `const void *buffer`, `size_t size`, `const WriteOption &option` |
| `CloseFile` | `_ZN2nn2fs9CloseFileENS0_10FileHandleE` | Closes an open file handle.<br>**Args:** `FileHandle handle` |
| `GetFileSize` (`fileSize`) | `_ZN2nn2fs11GetFileSizeEPlNS0_10FileHandleE` | Gets the size of an open file.<br>**Args:** `int64_t *outSize`, `FileHandle handle` |
| `SetFileSize` | `_ZN2nn2fs11SetFileSizeENS0_10FileHandleEl` | Sets the size of an open file.<br>**Args:** `FileHandle handle`, `int64_t size` |
| `FlushFile` | `_ZN2nn2fs9FlushFileENS0_10FileHandleE` | Flushes cached data for an open file.<br>**Args:** `FileHandle handle` |
| `CreateFile` | `_ZN2nn2fs10CreateFileEPKcl` | Creates a new file.<br>**Args:** `const char *path`, `int64_t size` |
| `DeleteFile` | `_ZN2nn2fs10DeleteFileEPKc` | Deletes an existing file.<br>**Args:** `const char *path` |
| `RenameFile` | `_ZN2nn2fs10RenameFileEPKcS2_` | Renames or moves a file.<br>**Args:** `const char *oldPath`, `const char *newPath` |
| `OpenDirectory` | `_ZN2nn2fs13OpenDirectoryEPNS0_15DirectoryHandleEPKci` | Opens a directory for listing.<br>**Args:** `DirectoryHandle *outHandle`, `const char *path`, `int mode` |
| `ReadDirectory` | `_ZN2nn2fs13ReadDirectoryEPlPNS0_14DirectoryEntryENS0_15DirectoryHandleEl` | Reads entries from an open directory.<br>**Args:** `int64_t *outEntriesRead`, `DirectoryEntry *entryBuffer`, `DirectoryHandle handle`, `int64_t entryCount` |
| `CloseDirectory` | `_ZN2nn2fs14CloseDirectoryENS0_15DirectoryHandleE` | Closes an open directory handle.<br>**Args:** `DirectoryHandle handle` |
| `CreateDirectory` | `_ZN2nn2fs15CreateDirectoryEPKc` | Creates a new directory.<br>**Args:** `const char *path` |
| `DeleteDirectory` | `_ZN2nn2fs15DeleteDirectoryEPKc` | Deletes an empty directory.<br>**Args:** `const char *path` |
| `RenameDirectory` | `_ZN2nn2fs15RenameDirectoryEPKcS2_` | Renames or moves a directory.<br>**Args:** `const char *oldPath`, `const char *newPath` |
| `GetEntryType` (`entryType`) | `_ZN2nn2fs12GetEntryTypeEPNS0_18DirectoryEntryTypeEPKc` | Gets the entry type (file vs directory) for a path.<br>**Args:** `DirectoryEntryType *outType`, `const char *path` |
| `CommitSaveData` (`commit`) | `_ZN2nn2fs14CommitSaveDataEPKc` | Commits save data changes.<br>**Args:** `const char *saveDataName` |

---

## 3. `nn::sm`

Service Manager (`nn::sm::detail::IUserInterface` and `nn::sm::detail::IManagerInterface`) exported symbols present in the MOD0 symbol table.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `Initialize` | `_ZN2nn2sm10InitializeEv` | Initializes the Service Manager client library.<br>**Args:** None (`void`) |
| `Finalize` | `_ZN2nn2sm8FinalizeEv` | Finalizes the Service Manager client library.<br>**Args:** None (`void`) |
| `GetServiceHandle` (`service`) | `_ZN2nn2sm16GetServiceHandleEPNS_3svc6HandleEPKcm` | Gets a registered service handle by name (`IUserInterface::GetServiceHandle`).<br>**Args:** `nn::svc::Handle *outHandle`, `const char *serviceName`, `size_t nameLength` |
| `RegisterService` | `_ZN2nn2sm15RegisterServiceEPNS_3svc6HandleEPKcmib` | Registers a service (`IUserInterface::RegisterService`).<br>**Args:** `nn::svc::Handle *outHandle`, `const char *serviceName`, `size_t nameLength`, `int maxSessions`, `bool isLight` |
| `UnregisterService` | `_ZN2nn2sm17UnregisterServiceEPKcm` | Unregisters a service (`IUserInterface::UnregisterService`).<br>**Args:** `const char *serviceName`, `size_t nameLength` |
| `InitializeForManager` | `_ZN2nn2sm20InitializeForManagerEv` | Initializes Service Manager for manager client.<br>**Args:** None (`void`) |
| `FinalizeForManager` | `_ZN2nn2sm18FinalizeForManagerEv` | Finalizes Service Manager for manager client.<br>**Args:** None (`void`) |
| `RegisterProcess` | `_ZN2nn2sm15RegisterProcessENS_2os9ProcessIdEPKvmS4_m` | Registers a process and access rights (`IManagerInterface::RegisterProcess`).<br>**Args:** `nn::os::ProcessId pid`, `const void *accessRightsLimit`, `size_t limitSize`, `const void *accessRights`, `size_t rightsSize` |
| `UnregisterProcess` | `_ZN2nn2sm17UnregisterProcessENS_2os9ProcessIdE` | Unregisters a process (`IManagerInterface::UnregisterProcess`).<br>**Args:** `nn::os::ProcessId pid` |

---

## 4. `nn::hid`

Controller handles and state management functions in the public `nn::hid` namespace.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `GetNpadState` (Handheld) | `_ZN2nn3hid12GetNpadStateEPNS0_17NpadHandheldStateERKj` | Gets handheld controller state.<br>**Args:** `NpadHandheldState *outState`, `const uint32_t &npadId` |
| `GetNpadState` (FullKey) | `_ZN2nn3hid12GetNpadStateEPNS0_16NpadFullKeyStateERKj` | Gets Pro Controller (full key) state.<br>**Args:** `NpadFullKeyState *outState`, `const uint32_t &npadId` |
| `GetNpadState` (JoyDual) | `_ZN2nn3hid12GetNpadStateEPNS0_16NpadJoyDualStateERKj` | Gets dual Joy-Con state.<br>**Args:** `NpadJoyDualState *outState`, `const uint32_t &npadId` |
| `GetNpadState` (JoyLeft) | `_ZN2nn3hid12GetNpadStateEPNS0_16NpadJoyLeftStateERKj` | Gets left Joy-Con state.<br>**Args:** `NpadJoyLeftState *outState`, `const uint32_t &npadId` |
| `GetNpadState` (JoyRight) | `_ZN2nn3hid12GetNpadStateEPNS0_17NpadJoyRightStateERKj` | Gets right Joy-Con state.<br>**Args:** `NpadJoyRightState *outState`, `const uint32_t &npadId` |
| `GetTouchScreenState` | `_ZN2nn3hid19GetTouchScreenStateILm16EEEvPNS0_16TouchScreenStateIXT_EEE` | Gets multi-touch screen state (supporting up to 16 simultaneous contact points with coordinates, bounding diameters, and timestamps).<br>**Args:** `TouchScreenState<16> *outState` |
| `GetNpadStyleSet` | `_ZN2nn3hid15GetNpadStyleSetERKj` | Gets active controller style mask tag.<br>**Args:** `const uint32_t &npadId` |
| `GetSixAxisSensorHandles` (`motionHandles`) | `_ZN2nn3hid23GetSixAxisSensorHandlesEPNS0_19SixAxisSensorHandleEiRKjNS_4util10BitFlagSetILi32ENS0_12NpadStyleTagEEE` | Gets six-axis motion sensor handles.<br>**Args:** `SixAxisSensorHandle *outHandles`, `int maxCount`, `const uint32_t &npadId`, `BitFlagSet<32, NpadStyleTag> styleSet` |
| `GetVibrationDeviceHandles` (`vibrationHandles`) | `_ZN2nn3hid25GetVibrationDeviceHandlesEPNS0_21VibrationDeviceHandleEiRKjNS_4util10BitFlagSetILi32ENS0_12NpadStyleTagEEE` | Gets vibration device handles.<br>**Args:** `VibrationDeviceHandle *outHandles`, `int maxCount`, `const uint32_t &npadId`, `BitFlagSet<32, NpadStyleTag> styleSet` |

---

## 5. `nn::hid::detail`

Detailed or internal HID, motion, vibration, keyboard, mouse, and peripheral support functions.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `GetNpadStyleSet` (`style`) | `_ZN2nn3hid6detail15GetNpadStyleSetEPNS_4util10BitFlagSetILi32ENS0_12NpadStyleTagEEERKj` | Gets active controller style set bitflags.<br>**Args:** `BitFlagSet<32, NpadStyleTag> *outStyleSet`, `const uint32_t &npadId` |
| `StartSixAxisSensor` (`motionStart`) | `_ZN2nn3hid6detail18StartSixAxisSensorERKNS0_19SixAxisSensorHandleE` | Starts six-axis motion sensor acquisition.<br>**Args:** `const SixAxisSensorHandle &handle` |
| `StopSixAxisSensor` (`motionStop`) | `_ZN2nn3hid6detail17StopSixAxisSensorERKNS0_19SixAxisSensorHandleE` | Stops six-axis motion sensor acquisition.<br>**Args:** `const SixAxisSensorHandle &handle` |
| `GetSixAxisSensorStates` (`motionRead`) | `_ZN2nn3hid6detail22GetSixAxisSensorStatesEPiPNS0_18SixAxisSensorStateEiRKNS0_19SixAxisSensorHandleE` | Reads six-axis sensor states (96-byte structure).<br>**Args:** `int *outCount`, `SixAxisSensorState *outStates`, `int maxCount`, `const SixAxisSensorHandle &handle` |
| `InitializeVibrationDevice` (`vibrationInit`) | `_ZN2nn3hid6detail25InitializeVibrationDeviceERKNS0_21VibrationDeviceHandleE` | Initializes a vibration device.<br>**Args:** `const VibrationDeviceHandle &handle` |
| `SendVibrationValue` (`vibrationSend`) | `_ZN2nn3hid6detail18SendVibrationValueERKNS0_21VibrationDeviceHandleERKNS0_14VibrationValueE` | Sends vibration value (amplitude/frequency) to device.<br>**Args:** `const VibrationDeviceHandle &handle`, `const VibrationValue &value` |
| `GetActualVibrationValue` (`vibrationRead`) | `_ZN2nn3hid6detail23GetActualVibrationValueEPNS0_14VibrationValueERKNS0_21VibrationDeviceHandleE` | Reads actual vibration value from device.<br>**Args:** `VibrationValue *outValue`, `const VibrationDeviceHandle &handle` |
| `IsVibrationPermitted` (`vibrationPermitted`) | `_ZN2nn3hid6detail20IsVibrationPermittedEPb` | Checks if vibration is permitted by system policy.<br>**Args:** `bool *outPermitted` |
| `GetMouseState` (`mouse`) | `_ZN2nn3hid6detail13GetMouseStateEPNS0_10MouseStateE` | Gets generic mouse state (40-byte structure).<br>**Args:** `MouseState *outState` |
| `GetKeyboardStates` (`keyboard`) | `_ZN2nn3hid6detail17GetKeyboardStatesEPiPNS0_13KeyboardStateEi` | Gets keyboard states (48-byte structure).<br>**Args:** `int *outCount`, `KeyboardState *outStates`, `int maxCount` |
| `GetNpadControllerColor` (`color`) | `_ZN2nn3hid6detail22GetNpadControllerColorEPNS0_19NpadControllerColorES3_RKj` | Gets controller body and button colors.<br>**Args:** `NpadControllerColor *outBodyColor`, `NpadControllerColor *outButtonColor`, `const uint32_t &npadId` |
| `GetPlayerLedPattern` (`led`) | `_ZN2nn3hid6detail19GetPlayerLedPatternEPhRKj` | Gets player LED indicator pattern.<br>**Args:** `uint8_t *outPattern`, `const uint32_t &npadId` |

---

## 6. `nn::vi`

VI (Video Interface) display, layer, and window management.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `Initialize` | `_ZN2nn2vi10InitializeEv` | Initializes the VI service subsystem.<br>**Args:** None (`void`) |
| `Finalize` | `_ZN2nn2vi8FinalizeEv` | Finalizes the VI service subsystem.<br>**Args:** None (`void`) |
| `OpenDefaultDisplay` | `_ZN2nn2vi18OpenDefaultDisplayEPPNS0_7DisplayE` | Opens the system default display.<br>**Args:** `Display **outDisplay` |
| `CloseDisplay` | `_ZN2nn2vi12CloseDisplayEPNS0_7DisplayE` | Closes an open display handle.<br>**Args:** `Display *display` |
| `CreateLayer` | `_ZN2nn2vi11CreateLayerEPPNS0_5LayerEPNS0_7DisplayE` | Creates a rendering layer on a display.<br>**Args:** `Layer **outLayer`, `Display *display` |
| `DestroyLayer` | `_ZN2nn2vi12DestroyLayerEPNS0_5LayerE` | Destroys an existing rendering layer.<br>**Args:** `Layer *layer` |
| `GetNativeWindow` | `_ZN2nn2vi15GetNativeWindowEPPvPNS0_5LayerE` | Gets native window handle for NVN / graphics backend binding.<br>**Args:** `void **outNativeWindow`, `Layer *layer` |

---

## 7. `nn::account`

User account management and authorization services.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `OpenUser` | `_ZN2nn7account8OpenUserEPNS0_10UserHandleERKNS0_3UidE` | Opens a user handle for a given user ID (`Uid`).<br>**Args:** `UserHandle *outUserHandle`, const `Uid &uid` |
| `GetUserId` | `_ZN2nn7account6detail9GetUserIdERKNS0_10UserHandleE` | Extracts user ID (`Uid`) from an open user handle.<br>**Args:** `const UserHandle &userHandle` |

---

## 8. `nn::time`

Time service, system clocks, and calendar time conversion.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `StandardSteadyClock::now` | `_ZN2nn4time19StandardSteadyClock3nowEv` | Gets current monotonic steady clock time point.<br>**Args:** None (`void`) |
| `ToPosixTimeFromUtc` | `_ZN2nn4time18ToPosixTimeFromUtcERKNS0_12CalendarTimeE` | Converts calendar time to POSIX timestamp.<br>**Args:** `const CalendarTime &calendarTime` |

---

## 9. `nn::os`

Operating system synchronization primitives, thread management, and memory heap info.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `GetMemoryHeapSize` | `_ZN2nn2os17GetMemoryHeapSizeEv` | Gets current application memory heap size.<br>**Args:** None (`void`) |
| `GetCurrentCoreNumber` | `_ZN2nn2os20GetCurrentCoreNumberEv` | Gets ID of currently executing CPU core.<br>**Args:** None (`void`) |
| `GetHostArgc` | `_ZN2nn2os11GetHostArgcEv` | Gets host command-line argument count (`argc`).<br>**Args:** None (`void`) |
| `GetHostArgv` | `_ZN2nn2os11GetHostArgvEv` | Gets host command-line argument values (`argv`).<br>**Args:** None (`void`) |
| `InitializeMessageQueue` | `_ZN2nn2os22InitializeMessageQueueEPNS0_16MessageQueueTypeEPmm` | Initializes an OS message queue buffer.<br>**Args:** `MessageQueueType *outQueue`, `void *buffer`, `size_t bufferSize` |

---

## 10. `nn::nifm`

Network interface manager functions.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `GetInternetConnectionStatus` (`netStatus`) | `_ZN2nn4nifm27GetInternetConnectionStatusEPNS0_24InternetConnectionStatusE` | Gets internet connection status.<br>**Args:** `InternetConnectionStatus *outStatus` |
| `GetCurrentPrimaryIpAddress` (`netAddress`) | `_ZN2nn4nifm26GetCurrentPrimaryIpAddressEPNS_6socket6InAddrE` | Gets current primary local IP address.<br>**Args:** `nn::socket::InAddr *outAddr` |

---

## 11. `nn::irsensor::detail`

IR camera sensor details and data acquisition.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `GetIrCameraHandle` (`irHandle`) | `_ZN2nn8irsensor6detail17GetIrCameraHandleEPNS0_14IrCameraHandleERKj` | Gets IR camera handle for controller.<br>**Args:** `IrCameraHandle *outHandle`, `const uint32_t &npadId` |
| `GetIrCameraStatus` (`irStatus`) | `_ZN2nn8irsensor6detail17GetIrCameraStatusEPNS0_14IrCameraStatusERKNS0_14IrCameraHandleE` | Gets IR camera operational status.<br>**Args:** `IrCameraStatus *outStatus`, `const IrCameraHandle &handle` |

---

## 12. `nn::nfc`

Near Field Communication (NFC / Amiibo) functions.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `GetState` (`nfcState`) | `_ZN2nn3nfc8GetStateEv` | Gets NFC service state.<br>**Args:** None (`void`) |
| `Initialize` (`nfcInit`) | `_ZN2nn3nfc10InitializeEv` | Initializes NFC library.<br>**Args:** None (`void`) |
| `Finalize` (`nfcFinalize`) | `_ZN2nn3nfc8FinalizeEv` | Finalizes NFC library.<br>**Args:** None (`void`) |
| `ListDevices` (`nfcList`) | `_ZN2nn3nfc11ListDevicesEPNS0_12DeviceHandleEPii` | Lists connected NFC devices.<br>**Args:** `DeviceHandle *outHandles`, `int *outCount`, `int maxCount` |
| `StartDetection` (`nfcStart`) | `_ZN2nn3nfc14StartDetectionERKNS0_12DeviceHandleE` | Starts NFC tag detection on a device.<br>**Args:** `const DeviceHandle &handle` |
| `StopDetection` (`nfcStop`) | `_ZN2nn3nfc13StopDetectionERKNS0_12DeviceHandleE` | Stops NFC tag detection on a device.<br>**Args:** `const DeviceHandle &handle` |
| `GetTagInfo` (`nfcTag`) | `_ZN2nn3nfc10GetTagInfoEPNS0_7TagInfoERKNS0_12DeviceHandleE` | Gets tag information (UID, type, protocol).<br>**Args:** `TagInfo *outTagInfo`, `const DeviceHandle &handle` |
| `GetNpadId` (`nfcPad`) | `_ZN2nn3nfc9GetNpadIdEPjRKNS0_12DeviceHandleE` | Gets associated Npad ID for an NFC device.<br>**Args:** `uint32_t *outNpadId`, `const DeviceHandle &handle` |

---

## 13. `nn::audio`

Audio management, output device listing, and audio rendering / playback pipeline.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `ListAudioIns` (`audioInputs`) | `_ZN2nn5audio12ListAudioInsEPNS0_11AudioInInfoEi` | Lists connected audio input devices.<br>**Args:** `AudioInInfo *outInfos`, `int maxCount` |
| `OpenDefaultAudioOut` | `_ZN2nn5audio19OpenDefaultAudioOutEPNS0_8AudioOutEPNS_2os11SystemEventERKNS0_17AudioOutParameterE` | Opens the default hardware audio output device with an event handle.<br>**Args:** `AudioOut *outAudioOut`, `nn::os::SystemEvent *outEvent`, `const AudioOutParameter &param` |
| `CloseAudioOut` | `_ZN2nn5audio13CloseAudioOutEPNS0_8AudioOutE` | Closes an opened audio output device.<br>**Args:** `AudioOut *audioOut` |
| `StartAudioOut` | `_ZN2nn5audio13StartAudioOutEPNS0_8AudioOutE` | Starts audio output stream playback.<br>**Args:** `AudioOut *audioOut` |
| `StopAudioOut` | `_ZN2nn5audio12StopAudioOutEPNS0_8AudioOutE` | Stops audio output stream playback.<br>**Args:** `AudioOut *audioOut` |
| `AppendAudioOutBuffer` | `_ZN2nn5audio20AppendAudioOutBufferEPNS0_8AudioOutEPNS0_14AudioOutBufferE` | Enqueues a PCM audio buffer for playback.<br>**Args:** `AudioOut *audioOut`, `AudioOutBuffer *buffer` |
| `GetReleasedAudioOutBuffer` | `_ZN2nn5audio25GetReleasedAudioOutBufferEPNS0_8AudioOutE` | Retrieves the next finished/released audio playback buffer.<br>**Args:** `AudioOut *audioOut` |
| `GetAudioOutState` | `_ZN2nn5audio16GetAudioOutStateEPKNS0_8AudioOutE` | Queries current audio output stream state (Started vs Stopped).<br>**Args:** `const AudioOut *audioOut` |
| `GetAudioOutVolume` | `_ZN2nn5audio17GetAudioOutVolumeEPKNS0_8AudioOutE` | Queries current audio output volume gain.<br>**Args:** `const AudioOut *audioOut` |
| `SetAudioOutVolume` | `_ZN2nn5audio17SetAudioOutVolumeEPNS0_8AudioOutEf` | Sets master audio output playback volume (`0.0` - `1.0`).<br>**Args:** `AudioOut *audioOut`, `float volume` |
| `FlushAudioOutBuffers` | `_ZN2nn5audio20FlushAudioOutBuffersEPNS0_8AudioOutE` | Flushes all pending audio output playback buffers.<br>**Args:** `AudioOut *audioOut` |
| `InitializeAudioOutParameter` | `_ZN2nn5audio27InitializeAudioOutParameterEPNS0_17AudioOutParameterE` | Initializes default audio output parameters (48000 Hz, 2 channels).<br>**Args:** `AudioOutParameter *outParam` |

---

## 14. `nn::swkbd`

Native Software Keyboard Subsystem, Library Applet, buffer sizing, and inline keyboard routines.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `ShowKeyboard` | `_ZN2nn5swkbd12ShowKeyboardEPNS0_6StringERKNS0_15ShowKeyboardArgE` | Synchronously launches the native software keyboard modal applet.<br>**Args:** `String *outResultString`, `const ShowKeyboardArg &arg` |
| `InitializeKeyboardConfig` | `_ZN2nn5swkbd24InitializeKeyboardConfigEPNS0_14KeyboardConfigE` | Initializes keyboard configuration struct with platform defaults.<br>**Args:** `KeyboardConfig *outConfig` |
| `MakePresetDefault` | `_ZN2nn5swkbd17MakePresetDefaultEPNS0_14KeyboardConfigE` | Configures keyboard layout for standard default text entry.<br>**Args:** `KeyboardConfig *outConfig` |
| `MakePresetPassword` | `_ZN2nn5swkbd18MakePresetPasswordEPNS0_14KeyboardConfigE` | Configures keyboard for masked password / pin entry.<br>**Args:** `KeyboardConfig *outConfig` |
| `MakePresetUserName` | `_ZN2nn5swkbd18MakePresetUserNameEPNS0_14KeyboardConfigE` | Configures keyboard for alphanumeric username entry.<br>**Args:** `KeyboardConfig *outConfig` |
| `MakePresetDownloadCode` | `_ZN2nn5swkbd22MakePresetDownloadCodeEPNS0_14KeyboardConfigE` | Configures keyboard for alphanumeric download code entry.<br>**Args:** `KeyboardConfig *outConfig` |
| `SetHeaderTextUtf8` | `_ZN2nn5swkbd17SetHeaderTextUtf8EPNS0_14KeyboardConfigEPKc` | Sets header title text displayed above the keyboard (UTF-8).<br>**Args:** `KeyboardConfig *config`, `const char *utf8Text` |
| `SetSubTextUtf8` | `_ZN2nn5swkbd14SetSubTextUtf8EPNS0_14KeyboardConfigEPKc` | Sets descriptive subtitle caption text (UTF-8).<br>**Args:** `KeyboardConfig *config`, `const char *utf8Text` |
| `SetGuideTextUtf8` | `_ZN2nn5swkbd16SetGuideTextUtf8EPNS0_14KeyboardConfigEPKc` | Sets placeholder guide text inside the input box (UTF-8).<br>**Args:** `KeyboardConfig *config`, `const char *utf8Text` |
| `SetOkTextUtf8` | `_ZN2nn5swkbd13SetOkTextUtf8EPNS0_14KeyboardConfigEPKc` | Sets custom text on positive confirmation button (UTF-8).<br>**Args:** `KeyboardConfig *config`, `const char *utf8Text` |
| `SetInitialTextUtf8` | `_ZN2nn5swkbd18SetInitialTextUtf8EPNS0_15ShowKeyboardArgEPKc` | Populates initial editable text inside the input field (UTF-8).<br>**Args:** `ShowKeyboardArg *arg`, `const char *utf8Text` |
| `GetRequiredWorkBufferSize` | `_ZN2nn5swkbd25GetRequiredWorkBufferSizeEb` | Returns required work buffer bytes (4,096 B without dict, 53,248 B with dict).<br>**Args:** `bool hasCustomizeDic` |
| `GetRequiredStringBufferSize` | `_ZN2nn5swkbd27GetRequiredStringBufferSizeEv` | Returns required buffer size for receiving output strings (2,004 bytes).<br>**Args:** None (`void`) |
| `GetRequiredTextCheckWorkBufferSize` | `_ZN2nn5swkbd34GetRequiredTextCheckWorkBufferSizeEv` | Returns required buffer size for text verification callbacks (2,004 bytes).<br>**Args:** None (`void`) |
| `InlineKeyboard::GetRequiredWorkBufferSize` | `_ZN2nn5swkbd14InlineKeyboard25GetRequiredWorkBufferSizeEv` | Returns required work buffer size for inline overlay keyboard mode (1,760 bytes).<br>**Args:** None (`void`) |
| `InlineKeyboard::Launch` | `_ZN2nn5swkbd14InlineKeyboard6LaunchEv` | Launches background worker for non-modal inline keyboard overlay.<br>**Args:** `InlineKeyboard *this` |
| `InlineKeyboard::Appear` | `_ZN2nn5swkbd14InlineKeyboard6AppearERKNS0_9AppearArgE` | Shows and animates the inline keyboard onto screen.<br>**Args:** `InlineKeyboard *this`, `const AppearArg &arg` |
| `InlineKeyboard::Disappear` | `_ZN2nn5swkbd6detail18InlineKeyboardImpl9DisappearEv` | Hides and dismisses the inline keyboard.<br>**Args:** `InlineKeyboardImpl *this` |

---

## 15. `nn::web`

Native Web Browser Applet Subsystem, argument configuration, and return telemetry.

| Function Name | C++ Symbol | Description & Arguments |
| --- | --- | --- |
| `ShowWebPage` | `_ZN2nn3web11ShowWebPageEPNS0_18WebPageReturnValueERKNS0_14ShowWebPageArgE` | Synchronously launches the native S2 OS Web Browser Library Applet modal.<br>**Args:** `WebPageReturnValue *outReturnValue`, `const ShowWebPageArg &arg` |
| `ShowWebPageArg` (constructor) | `_ZN2nn3web14ShowWebPageArgC1EPKc` | Constructs argument container initialized with target URL.<br>**Args:** `ShowWebPageArg *this`, `const char *url` |
| `ShowWebPageArg::SetCallbackUrl` | `_ZN2nn3web14ShowWebPageArg14SetCallbackUrlEPKc` | Sets callback intercept URL to trigger automatic closure on navigation match.<br>**Args:** `ShowWebPageArg *this`, `const char *callbackUrl` |
| `ShowWebPageArg::SetTouchEnabledOnContents` | `_ZN2nn3web14ShowWebPageArg25SetTouchEnabledOnContentsEb` | Enables or disables capacitive touch interaction inside webpage contents.<br>**Args:** `ShowWebPageArg *this`, `bool enabled` |
| `ShowWebPageArg::OverrideWebAudioVolume` | `_ZN2nn3web14ShowWebPageArg22OverrideWebAudioVolumeEf` | Overrides master gain volume for Web Audio API audio elements (`0.0` - `1.0`).<br>**Args:** `ShowWebPageArg *this`, `float volume` |
| `ShowWebPageArg::OverrideMediaAudioVolume` | `_ZN2nn3web14ShowWebPageArg24OverrideMediaAudioVolumeEf` | Overrides audio volume gain for HTML5 `<audio>` and `<video>` tags (`0.0` - `1.0`).<br>**Args:** `ShowWebPageArg *this`, `float volume` |
| `WebPageReturnValue` (constructor) | `_ZN2nn3web18WebPageReturnValueC1Ev` | Constructs and initializes the return value output block.<br>**Args:** `WebPageReturnValue *this` |
| `WebPageReturnValue::GetWebExitReason` | `_ZNK2nn3web18WebPageReturnValue16GetWebExitReasonEv` | Extracts exit reason code enum (`0 = USER_EXIT`, `1 = CALLBACK_URL`, `2 = ERROR`).<br>**Args:** `const WebPageReturnValue *this` |
| `WebPageReturnValue::GetLastUrl` | `_ZNK2nn3web18WebPageReturnValue10GetLastUrlEv` | Retrieves pointer to the last visited URL string when applet was closed.<br>**Args:** `const WebPageReturnValue *this` |

---

## 16. Internal / Low-Level IPC Helpers (`ipc-functions.json`)

Internal utility routines used by the runtime bridge.

| Key | Offset | Description |
| --- | --- | --- |
| `send` | `0x13F270` | Qualified CMIF / IPC send routine |
| `aruid` | `0x1AE9D0` | Application resource ID query routine (`aruid`) |
| `transfer` | `0x1583D4` | Handle transfer helper routine |
| `copy` | `0x586FB0` | Memory copy / dispatch utility routine |
