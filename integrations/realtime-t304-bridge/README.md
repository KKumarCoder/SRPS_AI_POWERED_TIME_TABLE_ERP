# SBXPC fallback / recovery / diagnostic bridge

**Primary integration is direct FkWeb.** This Windows bridge is preserved for recovery and diagnostics. See [integration documentation](../../docs/realtime-t304-face-attendance.md). Physical device execution and Windows compilation have not been verified on the Mac development host.

## Layout

- `src/`: bridge services, queue, logging, console/Windows Service entry point.
- `src/sbxpc/SBXPCDLL.cs`: unmodified official vendor wrapper.
- `vendor/`: official x86 native dependencies; DLLs excluded from Git.
- `logs/`, `queue/`: placeholders for local development; runtime path is configurable.
- `App.config`: safe configuration example; environment variables override its values.

Default durable runtime directory is `%ProgramData%\SRPS\T304Bridge`, containing `logs/` and `queue/`. Set DATA_DIRECTORY to the integration directory for local development if desired; service deployments should use a separate, ACL-restricted writable data directory. Do not grant general users access to attendance logs/queue or secrets.

## Official SDK provenance

Source located at `/Users/krishna/Desktop/20211204-SBXPC-1`, sample `samples/Sample_A30/C#_SBXPCDLL_Sample/SBXPCDLLSampleCSharp/`.

| File | SHA-256 |
|---|---|
| src/sbxpc/SBXPCDLL.cs | f63ecded2e633578ba55f0db71e1d1dc297b3b23ec48d942934997e302116ae1 |
| vendor/SBXPCDLL.dll | 54f95cf4e408b062c21ece8a352163dc58377fe76780af011e05df5478c316f1 |
| vendor/SBPCCOMM.dll | f71019ab02f2b87025f802f1fcf59819dac9fec50822b583b6e5a02ae4f1e8f3 |

The wrapper contains other SDK APIs, but bridge application code does not call biometric-template/photo enrollment APIs or destructive log operations. Preserve vendor licensing/distribution terms. The copied wrapper already supports x64 selection; this project intentionally targets x86. Future x64 work requires both matching 64-bit DLLs and native dependency tests.

## Build on Windows

Install Visual Studio Build Tools with .NET Framework 4.8 targeting/developer pack and MSBuild. Runtime requires .NET Framework 4.8. No NuGet packages are needed: System.Configuration, System.Net.Http, System.Web.Extensions, System.Xml.Linq and System.ServiceProcess are framework assemblies.

From Developer PowerShell:

```powershell
msbuild .\RealtimeT304Bridge.csproj /p:Configuration=Release /p:PlatformTarget=x86
```

Output: `bin\Release\RealtimeT304Bridge.exe`, its `.config`, `SBXPCDLL.dll`, `SBPCCOMM.dll`. If DLLs are absent after checkout, copy the official x86 pair from SDK `bin/` to `vendor/` before building. Verify any native runtime prerequisites from the vendor on the actual Windows PC; do not download replacement DLLs from arbitrary websites.

## Configuration

Copy/edit the output `.exe.config` privately or set environment variables visible to the service account. Never put real keys in the source `App.config`.

| Key | Example/default |
|---|---|
| DEVICE_MODEL | Realtime Pro T304 mini |
| DEVICE_SERIAL_EXPECTED | RSS202506122297 |
| DEVICE_MACHINE_NUMBER | 1 |
| DEVICE_IP | Blank until deliberately configured for a connection test |
| DEVICE_PORT | 5005 |
| DEVICE_PASSWORD | 0, configurable; latest owner report says no password configured |
| EVENT_SOURCE_IP / EVENT_PORT | 0.0.0.0 / 5005 |
| ERP_API_BASE_URL | Full API prefix, e.g. `https://your-erp.example/api/` |
| ERP_BRIDGE_API_KEY | Same 32+ character secret as backend ATTENDANCE_BRIDGE_API_KEY |
| BRIDGE_ID | SRPS-T304-BRIDGE-01 |
| TIMEZONE | Asia/Kolkata |
| DATA_DIRECTORY | Default `%ProgramData%\SRPS\T304Bridge` |
| BRIDGE_ENVIRONMENT | production; explicit development needed for localhost HTTP/mock |
| RAW_DIAGNOSTICS | false; enable only for controlled SDK XML diagnostics |
| ATTENDANCE_BRIDGE_MOCK | false |
| FALLBACK_SECONDS | 300 |
| DIAGNOSTIC_DEVICE_INFO_SELECTOR | Optional numeric selector verified against vendor documentation |
| DIAGNOSTIC_DEVICE_STATUS_SELECTOR | Optional numeric selector verified against vendor documentation |

Without IP, console returns: **Device IP is not configured. Physical device connection test is pending.** No sample IP is silently used. IP was later reported as 192.168.1.224 by the owner, but no network connection has been tested.

Use HTTPS; no certificate validation bypass exists. Development HTTP is accepted only for loopback. Register the device and teacher mappings in ERP before starting. Realtime/fallback FACE interpretation remains in REVIEW until explicitly verified in Attendance Settings.

## Diagnostics and first physical connection

```powershell
$env:RAW_DIAGNOSTICS = 'true'
.\bin\Release\RealtimeT304Bridge.exe --diagnose
```

This probes ping (advisory), TCP reachability, ConnectTcpip, serial, product code, optional explicitly selected device info/status, then starts SDK event capture and historical recovery. Configure the ERP API/key as well so normalized events can be uploaded. Model, serial, machine, IP/port and connection time are logged; communication password/API key are not.

Use an existing test teacher enrolled **on the device**. Perform one face attendance. Inspect Time Log XML fields, verification status, timestamp and teacher mapping. Verification Success/Failure notifications do not create attendance. SDK callback uses vendor XML_ParseInt/XML_ParseString; native GetLastError is used on failed connection/read calls. A serial mismatch warns and retains actual serial; backend allow-list rejects unknown hardware.

Diagnostic XML is rotating and redacts photo/image/face/template/fingerprint/binary fields. Malformed XML is omitted rather than persisted unsafely. Full unredacted photographic XML is intentionally not logged. Raw non-biometric strings/codes are retained. Keep LAN listener firewall access restricted to the actual machine; callback XML does not independently authenticate the network sender. Verify event source-IP numeric conversion against the official sample for non-default bindings; 0.0.0.0 follows the sample unchanged.

## Offline, fallback and resilience tests

1. **Duplicate:** replay one event through bridge and shared test pipeline; one raw event and one daily effect.
2. **Offline:** disconnect internet while keeping LAN working, scan once, verify durable `.json` queue, restore internet, confirm upload and deletion only after explicit API acknowledgement.
3. **Fallback:** stop listener, scan, reconnect; full read recovers history, incremental ReadGeneralLogData(machine,1) continues. No device logs are deleted.
4. **Reconnect:** disconnect/reconnect machine network; 5–60-second backoff must remain alive. Verify real SDK timeout behavior.
5. **Restart:** stop bridge with pending uploads and restart; queue survives. Full replay covers read-mark interruption before spool commit, subject to device history retention.
6. **Disk error:** fix storage/permissions and restart; do not delete evidence. Hardware history is the recovery source if local persistence fails.

Queue is oldest-first and durable before upload. Permanent 400/401/403 errors preserve the oldest record and block further sending until corrected; inspect sanitized status and configuration. It does not discard failed records to appear healthy. Logs rotate at 5 MiB with four archives. Upload retries cap at 120 seconds; heartbeat every 30 seconds. Shutdown stops capture/disconnects. SDK native calls may block; exercise this on Windows and use service recovery monitoring.

Development simulation requires both backend ATTENDANCE_BRIDGE_MOCK=true and bridge development + mock flags. Example `--simulate 12 2026-01-05T08:00:00+05:30`; status/mode strings come from MOCK_ATTENDANCE_STATUS/MOCK_VERIFICATION_MODE. It uses the same API key and allow-list and never bypasses production authentication. Simulation proves software transport only.

## Windows Service deployment

After a successful Windows build and hardware test, copy the output to a protected installation folder and configure its `.exe.config`/service environment privately. Run under a dedicated least-privileged Windows service identity with write permission only to the runtime data directory and LAN/HTTPS access. Do not place the API key in `sc.exe` arguments.

Administrator PowerShell example (paths/account must be chosen locally):

```powershell
sc.exe create SRPST304Bridge binPath= '"C:\SRPS\T304Bridge\RealtimeT304Bridge.exe"' start= auto
sc.exe failure SRPST304Bridge reset= 86400 actions= restart/10000/restart/30000/restart/60000
# Configure dedicated service identity, environment/config and directory ACLs before starting.
sc.exe start SRPST304Bridge
sc.exe stop SRPST304Bridge
```

Service uses the same runner as console. A fatal runner fault exits nonzero for service recovery. Missing configuration fails startup. No Visual Studio session is required. Native DLL loading and Windows Service lifecycle must be verified on the school PC before unattended operation.
