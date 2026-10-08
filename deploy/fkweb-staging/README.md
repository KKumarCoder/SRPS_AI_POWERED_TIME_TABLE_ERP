# First staging deployment (prepared, not deployed)

Dedicated Linux/systemd/Nginx staging host, Node 22+, MongoDB, TLS certificate and DNS are prerequisites. No existing production configuration is replaced. Use `/opt/srps/SRPS_AI_POWERED_TIME_TABLE_ERP` as the installation path and a separate staging database. Backend remains loopback-only on port 4100. Existing ERP port 4000 is unchanged.

## Private environment

From project root, generate on the staging host (never commit the result):

```sh
node server/scripts/prepare-fkweb-staging.mjs create /private/writable/path/fkweb-staging.private.env
```

The generated file contains separate random JWT/QR secrets, a 256-bit URL-safe capture token, AES key and these operational variables:

```dotenv
NODE_ENV=development
PORT=4100
MONGODB_URI=mongodb://127.0.0.1:27017/srps_fkweb_staging
EMAIL_SENDING_ENABLED=false
SCHOOL_TIMEZONE=Asia/Kolkata
ATTENDANCE_BRIDGE_MOCK=false
FKWEB_DIAGNOSTIC_MODE=true
FKWEB_RAW_LOG_DIR=/var/lib/srps-fkweb/captures
FKWEB_MAX_RAW_BODY_SIZE=1048576
FKWEB_ALLOWED_DEVICE_SERIALS=RSS202506122297
FKWEB_DIAGNOSTIC_DEVICE_SERIAL=RSS202506122297
FKWEB_DIAGNOSTIC_ALLOWED_IPS=
FKWEB_DIAGNOSTIC_TOKEN=<generated privately>
FKWEB_DIAGNOSTIC_ENCRYPTION_KEY=<generated privately>
FKWEB_DIAGNOSTIC_UNTIL=
JWT_SECRET=<generated privately>
QR_SIGNING_SECRET=<generated privately>
ORIGINAL_WEB_SERVER_URL=http://biometric.rankry.in/?school=newdemo
```

Capture starts closed. Configure a dedicated staging MongoDB URI privately; never copy the school production `.env`. Diagnostic mode is disabled under NODE_ENV=production, so this isolated staging service deliberately uses development mode. Only its receiver route is exposed by the dedicated vhost.

## Install and start

Run repository commands from the installation directory. Use an existing non-root deployment account for npm. Confirm `/usr/bin/node` exists; otherwise update both service files to its absolute path.

```sh
npm ci
npm run build
npm test
npm run test:fkweb -w server
# Frontend build is a regression check; it is not required to serve the raw receiver.
# Provision staging MongoDB before starting the backend. No seed/import command is needed.

# Create this service identity only if it does not already exist:
getent passwd srps-fkweb || sudo useradd --system --no-create-home --shell /usr/sbin/nologin srps-fkweb
sudo install -d -o root -g srps-fkweb -m 0750 /etc/srps
sudo install -d -o srps-fkweb -g srps-fkweb -m 0700 /var/lib/srps-fkweb/captures
sudo install -o root -g srps-fkweb -m 0640 /private/writable/path/fkweb-staging.private.env /etc/srps/fkweb-staging.env
sudo install -m 0644 deploy/fkweb-staging/srps-fkweb.service /etc/systemd/system/
sudo install -m 0644 deploy/fkweb-staging/srps-fkweb-purge.service /etc/systemd/system/
sudo install -m 0644 deploy/fkweb-staging/srps-fkweb-purge.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now srps-fkweb.service srps-fkweb-purge.timer
```

Ensure the service identity can read/traverse the installation directory. The systemd sandbox only permits writes to the capture directory. The independent timer deletes expired captures even while the receiver is stopped. Do not back up, sync or serve that directory.

Configure `nginx.conf.example` with the REAL staging hostname and certificate paths. Install as a new dedicated vhost using the host's existing Nginx convention. It proxies unchanged entity bytes to 127.0.0.1:4100; all other routes return 404. Limits match the 1 MiB application setting. Do not copy its catch-all into the existing ERP vhost.

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Immediately before external readiness checks, open the 15-minute window (the script atomically replaces the file, so restore service-group readability):

```sh
sudo /usr/bin/node server/scripts/prepare-fkweb-staging.mjs activate /etc/srps/fkweb-staging.env
sudo chown root:srps-fkweb /etc/srps/fkweb-staging.env
sudo chmod 0640 /etc/srps/fkweb-staging.env
sudo systemctl restart srps-fkweb
sudo journalctl -u srps-fkweb -f -o cat
```

Log entries show timestamp, token-redacted path, method, content type, byte length, capture ID/file, hash and NOT_VERIFIED parser status. No raw body or API secrets are printed.

## External tests

In a private operator terminal, set `FKWEB_TEST_URL` to the real HTTPS hostname plus `/biometric/fkweb/` and the configured token. It must never be committed or published in frontend code.

```sh
curl --fail --silent --show-error "$FKWEB_TEST_URL/__health"
printf 'srps-transport-probe' | curl --silent --show-error -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/octet-stream' --data-binary @- "$FKWEB_TEST_URL"
printf 'srps-transport-probe' | sha256sum
```

Health returns minimal readiness text, no credentials. Probe returns **503**, deliberately not a guessed vendor ACK. Compare the hash with `bodySha256` in the receiver log; confirm the encrypted `.capture` file exists. Unknown payloads never create attendance. After expiry health/capture return 404 and the file disappears via cleanup. Local automated tests verify binary/JSON/XML/form/gzip byte preservation and expiry. Run the probe from outside the server network, not merely localhost.

## HTTP fallback

Prefer HTTPS. Firmware HTTPS compatibility remains unknown. `nginx-http.conf.example` prepares a separate port-80 ingestion-only vhost with a mandatory school PUBLIC egress IP allow-list. Plain HTTP exposes request content and the bearer URL to the transit network: restrict the test window, isolate the route and close it afterward. Do not enable it until the actual egress IP is known. Prefer the private LAN/VPN relay documented in `docs/fkweb-http-private.example.conf`. Neither example is currently deployed.

## Close test

```sh
sudo /usr/bin/node server/scripts/prepare-fkweb-staging.mjs close /etc/srps/fkweb-staging.env
sudo chown root:srps-fkweb /etc/srps/fkweb-staging.env
sudo chmod 0640 /etc/srps/fkweb-staging.env
sudo systemctl restart srps-fkweb
```

Keep cleanup timer running until all captures expire. Device URL remains `http://biometric.rankry.in/?school=newdemo` until public readiness is verified and the owner begins testing. No exact device URL is available yet: real domain, host access, TLS and public verification are pending.
