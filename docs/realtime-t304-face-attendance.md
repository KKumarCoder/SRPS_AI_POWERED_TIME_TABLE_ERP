# Realtime T304 mini face attendance

## Current delivery status

- FkWeb receiver implementation: **locally tested; public deployment pending**.
- FkWeb protocol and acknowledgement: **NOT YET VERIFIED**.
- Physical face attendance push: **NOT YET VERIFIED**.
- SBXPC fallback: source/project and official x86 dependencies present; **Windows compilation and hardware tests pending**.
- No production attendance is created from FkWeb diagnostic captures. No fabricated vendor parser or ACK exists.
- No device settings or original Web Server URL have been changed.

## Architecture

PRIMARY: T304 mini → Internet / FkWeb → isolated Express transport → observed-protocol parser (pending physical capture) → shared attendance service → MongoDB → existing ERP.

FALLBACK / RECOVERY / DIAGNOSTICS: T304 mini → TCP/IP :5005 → Windows C# SBXPC bridge → HTTPS bridge endpoint → the **same** attendance service.

The existing Express server, MongoDB connection, JWT role middleware, response/error patterns and React theme are reused. There is no second attendance database or second attendance dashboard. Scheduling algorithms are untouched. Previously existing QR modules are preserved; this integration adds FACE attendance only.

## Hardware configuration, reported by owner

| Item | Value |
|---|---|
| Brand / model | Realtime Biometrics / ProT304mini (Realtime Pro T304 mini) |
| Serial / Cloud ID | RSS202506122297 |
| Product type | TR/AC |
| Device ID / machine | 1 |
| LAN IP | 192.168.1.224 — subsequently confirmed by owner; not independently tested |
| TCP port | 5005 |
| Communication password | Owner reports no password configured; SDK configurable numeric default remains 0 |
| Mode | FkWeb |
| **Original Web Server URL** | **http://biometric.rankry.in/?school=newdemo** |
| Face engine | EbknFace V3.0 |
| Firmware | K7H V3.15.1116 |
| Build | v5.3.5 (240219) |
| Scope | FACE ATTENDANCE ONLY |

The bridge example keeps DEVICE_IP blank so copying its configuration cannot initiate an unintended connection. Enter the owner-confirmed IP only for an intentional fallback test. The application never writes the machine's Web Server URL, clears its logs, enrolls faces or fetches biometric templates.

## Backend implementation

- `server/src/attendance/models.js`: AttendanceDevice, TeacherDeviceMapping, AttendanceEvent.
- Existing `Attendance` in `models/index.js` is the daily TeacherAttendance equivalent. Additive fields retain event IDs, machine first/latest times, counts, methods, device serials and adjustment audit metadata.
- `attendance/policy.js`: strict normalized validation, stable identity hash, IST grouping and heartbeat status.
- `attendance/service.js`: `ingest()` is the shared normalization/processing entry. `processEvent()` handles mapping and daily effects.
- `attendance/routes.js`: bridge authentication and JWT/admin APIs.
- `attendance/fkweb/receiver.js`: byte-preserving transport only; mounted before global JSON middleware.
- `attendance/fkweb/response.js`: isolated negative discovery response, ready for an observed ACK implementation.
- `attendance/fkweb/parser.js`: explicit NOT_YET_VERIFIED gate. It throws rather than invent protocol fields.

Canonical real sources: `FKWEB`, `SBXPC_REALTIME`, `SBXPC_SYNC`. Legacy bridge source names are accepted and normalized for compatibility. Explicit development simulation uses `isMock`; production rejects it. A bridge cannot submit a FKWEB source.

The hash uses device serial + canonical numeric enrollment ID + UTC timestamp + event type; source is excluded. A native FkWeb event ID, when observed, is retained as provenance rather than added to the shared hash, because SBXPC does not necessarily expose it. `sourcesSeen` and `nativeEventIds` retain duplicate delivery provenance. Timestamp precision and whether multiple real punches can occur in the same second must be checked physically before final protocol approval.

Raw normalized event fields are immutable through Mongoose. Only processing metadata, teacher binding and delivery provenance can change. There is no update/delete raw-event API. These are application controls, not a tamper-proof database: restrict database administration separately.

Daily updates use atomic aggregation with event-ID set union. Retrying after a crash between event storage, daily calculation and final acknowledgement does not double-count. First/latest times remain correct for out-of-order delivery. A single event has no check-out. Machine IN/OUT strings remain raw until firmware semantics are verified. Manual corrections always win over subsequent machine events; original events remain intact. Conflicts with leave, disabled teachers or existing other-method attendance remain REVIEW.

Initial arrival/grace settings inherit existing school settings (currently defaults 08:00 / 5 minutes if not configured). Saving face settings makes that policy independent. Realtime and historical FACE confirmation switches default false: verify firmware before enabling. Minimum working minutes records shortfall; checkout policy flags missing checkout. Neither automatically imposes absence/half-day. Saved policy changes apply when a day next receives processing; no silent historical bulk recalculation occurs.

Unmapped events persist and are visible. Principal/Super Admin creates the explicit device-user → teacher mapping and chooses **Reprocess history**. Reprocessing batches are cursor-paginated at 500 records. Once bound, an event's teacher is not silently changed by later mappings.

Reports use active attendance-enabled staff and recorded joining dates, school working days, holidays and approved leave. Missing records become absent only after school cutoff. Historical reports use the current active roster; they are not a snapshot of past employment membership. Percentage includes leave in its denominator and counts half-day as 0.5. This policy is described in the UI.

## Routes and permissions

| Route | Access / behavior |
|---|---|
| POST `/api/attendance/device/events` | `X-SRPS-Bridge-Key`; strictly validated bridge events |
| POST `/api/attendance/device/heartbeat` | Same key; server receipt time drives liveness |
| GET `/api/attendance/devices` | Existing admin roles |
| GET `/api/attendance/devices/:id/status` | Existing admin roles |
| POST `/api/attendance/devices` | Principal / Super Admin |
| PATCH `/api/attendance/devices/:id` | Principal / Super Admin; identity is not silently rewritten |
| GET `/api/attendance/live` | Latest 100 events, optional teacherId / before timestamp |
| GET `/api/attendance/daily?date=YYYY-MM-DD` | Admin; optional teacherId |
| GET `/api/attendance/monthly?month=YYYY-MM` | Admin; optional teacherId |
| GET `/api/attendance/unmapped` | Admin; up to 500 grouped device users |
| GET/POST `/api/attendance/mappings` | Admin read, Principal/Super Admin write |
| PATCH `/api/attendance/mappings/:id` | Enable/disable mapping; audited |
| POST `/api/attendance/mappings/:id/reprocess` | Principal/Super Admin, optional `{after}` cursor |
| GET/PUT `/api/attendance/settings` | Admin read, Principal/Super Admin write |
| POST `/api/attendance/adjustments` | Principal/Super Admin; reason required; audited |
| Any method `/biometric/fkweb/<capture-token>[/suffix]` | Temporary diagnostic capability, no browser/session login |
| GET `/biometric/fkweb/<capture-token>/__health` | Operator readiness probe; does not capture a device event |

Register “SRPS Main Face Attendance” from **Face attendance → Devices**. UI pre-fills the owner's model/serial/bridge/machine/port; IP remains blank. No seed process modifies existing users or school records.

FkWeb request activity and SBXPC heartbeat are independent. The device tracks `lastFkWebRequestAt`, `lastAttendanceEventAt`, `lastSbxpcSyncAt`. Discovery requests indicate activity, not authenticated device identity or verified FACE attendance. `fkwebProtocolVerified` is false and intentionally has no ordinary settings toggle until real parser/authentication work is reviewed. A verified FkWeb device will not need a Windows heartbeat to appear online.

## Controlled FkWeb capture

**Do not change the machine URL yet.** A public hostname/deployment target has not been supplied, so there is no deployed test URL to give.

Configure a staging/development instance, never turn capture on in the production process:

```dotenv
NODE_ENV=development
FKWEB_DIAGNOSTIC_MODE=true
FKWEB_DIAGNOSTIC_UNTIL=<absolute UTC ISO expiry within the next hour>
FKWEB_DIAGNOSTIC_TOKEN=<independent random 32-byte hex secret>
FKWEB_DIAGNOSTIC_ENCRYPTION_KEY=<another independent random 32-byte hex secret>
FKWEB_RAW_LOG_DIR=<absolute private directory outside web root>
FKWEB_DIAGNOSTIC_ALLOWED_IPS=<optional exact IPs; restrict at proxy when proxied>
FKWEB_DIAGNOSTIC_DEVICE_SERIAL=RSS202506122297
FKWEB_ALLOWED_DEVICE_SERIALS=RSS202506122297
FKWEB_MAX_RAW_BODY_SIZE=1048576
ORIGINAL_WEB_SERVER_URL=http://biometric.rankry.in/?school=newdemo
```

Generate independent values with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Do not paste keys into source, screenshots, Git or shared terminal logs. Capture URL is a temporary secret capability, not finalized device authentication. FKWEB_ALLOWED_DEVICE_SERIALS restricts configured capture scope only; unknown raw bytes are not falsely treated as authenticated serial evidence. Legacy FKWEB_DIAGNOSTIC_ENABLED / FKWEB_DIAGNOSTIC_DIRECTORY names remain supported; prefer the names above. The server does not trust forwarded IP headers; with a reverse proxy, enforce school public-IP restrictions at that proxy.

Receiver limits: configurable body cap (default 1 MiB, maximum 8 MiB)/request, 10-second body deadline, 4 concurrent captures, 120 requests/minute, 100 stored files / 32 MiB total, maximum 1-hour capture session. Each capture expires after at most 15 minutes (or earlier session expiry). Ordinary Express JSON routes remain unchanged.

Every accepted discovery request stores exact **HTTP entity body** bytes, including compressed bytes if Content-Encoding is present. HTTP chunk framing, TLS records and wire-header casing are not body bytes and are not retained. Metadata includes method, sanitized original URL/path, query parameters (credential/image fields redacted), safe header allow-list, content type/length, server receipt timestamp and remote IP. Presence of the configured serial in raw bytes is only a diagnostic observation, never authentication.

Raw bytes and an optional lossless UTF-8 readable representation are stored in an AES-256-GCM encrypted `.capture` file with restrictive permissions. This temporary evidence may contain unknown photo/template fields; it is never copied into attendance tables or ordinary logs. Do not back up or sync this directory. Routine console logs contain capture ID, byte count, body SHA-256, content type and transport status only. No raw body, Authorization/Cookie header, capture token, API key or device password is logged.

The server purges expired files every 30 seconds and on new capture. Also schedule the purge command independently, so cleanup continues if the server is stopped. Encryption does not replace deletion. Disable discovery and remove captures when the controlled test ends.

```sh
# From server/, with the private staging env loaded:
node --env-file=.env scripts/fkweb-capture.mjs list
node --env-file=.env scripts/fkweb-capture.mjs inspect /private/capture/directory/<file>.capture
node --env-file=.env scripts/fkweb-capture.mjs purge
```

`inspect` prints safe transport metadata, not biometric body contents. For controlled local payload review, `readCapture(file,key)` in `capture-store.js` returns `bodyBase64` and `readableBody` in memory during the unexpired window. Inspect locally, identify/redact biometric and secret fields, then retain only a sanitized protocol fixture. Do not export the complete raw capture permanently.

The diagnostic response is deliberately **empty HTTP 503 with Retry-After: 60**, not guessed JSON success. This is an explicit negative transport result, not a known vendor ACK. Record request hashes/timestamps and whether the device retries. A device may require a handshake before sending time logs; if no Time Log arrives, capture its initial requests and obtain official FkWeb documentation. Do not assume 503 is a valid production protocol response.

## Deployment readiness and first physical test

Required: chosen staging domain/server access, DNS, valid TLS certificate, reverse proxy to existing Node API, private writable capture directory, staging MongoDB, environment secrets, expiration/cleanup job, and controlled source access. `fkweb-nginx.example.conf` is a deployment fragment, not evidence of a deployment. Node currently binds loopback; proxy locally. Do not make the whole development ERP publicly accessible merely to capture a request.

Before requesting any device change, verify from an external network:

1. `https://<staging-host>/biometric/fkweb/<capture-token>/__health` returns 200 and the explicit **Protocol and acknowledgement NOT VERIFIED** message.
2. An operator-supplied harmless diagnostic request returns empty 503 and writes one encrypted capture. Verify its SHA-256 and exact body with the local inspection module.
3. Wrong token and disabled/expired sessions return 404; unrelated ERP routes still require their existing authentication.
4. Watch the Node process log for `component: fkweb-discovery` and the private capture directory. Confirm purge works and proxy access logs do not record the capability URL.
5. Determine whether this firmware supports HTTPS, certificate chains and the configured path. Its original URL is HTTP; HTTPS support is **not verified**. Do not send secret URLs over public HTTP as a workaround. If HTTPS fails, use an explicitly approved private network/VPN or on-site TLS relay and capture its protocol behavior.

Only after the public receiver is confirmed ready and the owner explicitly begins the physical test:

1. Save original URL exactly: `http://biometric.rankry.in/?school=newdemo`.
2. Owner manually sets the agreed temporary receiver URL; application does not change device settings.
3. Reconnect/reboot only if the device requires it.
4. Perform one face scan using an existing device enrollment.
5. Capture all initial/heartbeat/attendance requests, including retries; do not create attendance from guesses.
6. Identify actual method/path, framing, encoding, Cloud/Device/User IDs, timestamp semantics, verification/status fields, native event ID, command and exact ACK requirements.
7. Save a sanitized fixture, implement parser and device authentication from evidence, verify expected ACK/retries, then connect parsed events to `ingest()`.
8. Verify FACE, explicit teacher mapping, IST date and deduplication with SBXPC recovery before enabling operational processing. Restore original URL at the end of the temporary test if agreed.

## SBXPC fallback

See `integrations/realtime-t304-bridge/README.md` for build, service setup and diagnostics. Runtime uses the official vendor wrapper, not a guessed TCP protocol. Never load Windows DLLs from Node/Linux.

Durable spool precedes upload; successful API acknowledgement containing event ID and processing status precedes deletion. Unmapped/review records count as durable server acceptance and stay in MongoDB for administrator action. API outages retry oldest-first with exponential backoff capped at 120 seconds. A permanently rejected oldest record intentionally blocks the queue instead of discarding evidence; operator review is required. Heartbeat runs independently every 30 seconds.

Reconnect uses 5–60-second backoff. On startup/reconnect, a full non-destructive log replay recovers records that might have been marked read before a process/storage failure; normal fallback uses ReadGeneralLogData(machine,1) / GetGeneralLogData. Device read-mark semantics, SDK end-of-log errors and native call blocking must be validated on hardware. Never call EmptyGeneralLogData. Disk failure is a critical condition requiring storage repair/restart and historical recovery; no software can guarantee capture through disk failure or hardware log overwrite.

## Verification commands and limits

```sh
npm test
npm run build
TEST_MONGODB_URI=mongodb://127.0.0.1:27028 npm run test:face -w server
npm run test:fkweb -w server
TEST_MONGODB_URI=mongodb://127.0.0.1:27028 npm run test:features -w server
```

Integration suites create/drop only random isolated local databases; they never load the school `.env`. FkWeb transport tests use synthetic bytes, not a claimed vendor fixture. Cross-source pipeline tests do not prove physical FkWeb protocol compatibility.

Windows .NET Framework compilation, native DLL loading, actual serial/product reads, real event capture, firmware FACE/IN/OUT mappings, fallback recovery, internet outage replay, firewall behavior and end-to-end physical attendance remain acceptance gates. Public deployment is also pending. The module must not be described as production-ready until these are completed.

### HTTP-only device option (not deployed)

`fkweb-http-private.example.conf` shows a dedicated on-site/private-VPN HTTP relay restricted to the confirmed device LAN IP, forwarding to the staging receiver over verified TLS. Only this ingestion route is exposed; the ERP site's HTTPS behavior stays unchanged. Keep the device→relay segment isolated. This addresses a firmware HTTP limitation without exposing a bearer capture URL over the public internet. A reverse proxy alone cannot encrypt the device's initial HTTP connection. No HTTP or HTTPS deployment has been provisioned or tested in this session.

### Staging deployment command sequence

A host/domain and credentials are still needed; these commands are a prepared procedure, not a deployment claim. On the selected host, from a copied project:

```sh
npm ci
npm run build
# Create server/.env privately using server/.env.example; use a staging database,
# strong JWT/QR secrets, NODE_ENV=development and a bounded FkWeb capture window.
# Set FKWEB_RAW_LOG_DIR outside the application/web root with mode 0700.
npm start -w server
# Install the reviewed HTTPS reverse-proxy fragment and actual TLS certificate.
# Validate before applying on the chosen server:
sudo nginx -t
sudo systemctl reload nginx
```

Use the host's existing process manager for unattended staging runtime. Run an independent scheduled `node --env-file=.env scripts/fkweb-capture.mjs purge` from the server directory every minute while captures exist. Route only `/biometric/fkweb/` to staging on the dedicated hostname. Do not include the token in proxy command lines or access logs.

External operator readiness check (in a private terminal):

```sh
# FKWEB_TEST_URL is the complete staging URL including the temporary capture token.
curl --fail --silent --show-error "$FKWEB_TEST_URL/__health"
# Harmless transport probe; EXPECT HTTP 503 and an encrypted capture, not a vendor ACK:
printf 'srps-transport-probe' | curl --silent --show-error -o /dev/null -w '%{http_code}\n' \
  -H 'Content-Type: application/octet-stream' --data-binary @- "$FKWEB_TEST_URL"
```

Exact URL format: `https://<verified-staging-host>/biometric/fkweb/<64-hex-capture-token>`.
**Exact deployed URL: not available yet. Do not enter a placeholder URL in the device.**
