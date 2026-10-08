# SRPS AI Timetable ERP

## Local development

1. Install dependencies with `npm install`.
2. Configure `server/.env` with a development MongoDB database and strong JWT/QR signing secrets.
3. Run `npm run dev` from the project root.
4. To safely prepare the existing school copy for timetable development, run `npm run enrich:dev-staff` (the legacy `npm run seed` command now runs the same non-destructive enrichment).
5. To import the supplied handwritten sheet as one unverified reference day, run `npm run import:handwritten` or use the **Import review** page. The import preserves the prior working schedule in history, creates an immutable original snapshot, and leaves Monday–Saturday unassigned. It is safe to rerun.

### Development staff enrichment

`npm run enrich:dev-staff` is an additive, idempotent development migration. It requires `NODE_ENV=development` (or another non-production value), an active Principal account, and existing teacher records. It never clears a collection, deletes a person, renames a teacher, changes a non-empty email/employee ID, replaces a Principal account, or resets an existing user password. It may regenerate a development-marked timetable and adjust development-marked sample attendance, but leaves non-demo attendance and non-empty school records intact.

The script adds missing CBSE-inspired subjects, class/section records, bell periods, teacher timetable mappings, a draft timetable, and clearly marked sample attendance. Values inferred from designations are **DEVELOPMENT / DEMO DATA**, not verified school assignments. Review and replace them with approved school data before operational use. Teachers whose role is marked NTT or pre-primary are kept in the directory and excluded from Classes 3–12 timetable assignment by default.

Teacher logins are created only when no account already exists for that teacher or email. The development-only shared password defaults to `Teacher@123`; override it with `DEMO_TEACHER_PASSWORD` in `server/.env`. No email is sent during enrichment. Change/remove development credentials before production.

Outbound email is disabled unless `EMAIL_SENDING_ENABLED=true`. Keep it `false` while testing. Set it to `true` only after SMTP sender, credentials, recipients, and schedule have been verified. QR generation and the scanner remain available independently.

Weekly subject allocations are sample school scheduling values for development, not official CBSE mandates. They are stored on subject records, editable in the Principal's Subjects screen as JSON entries shaped like `{"grade":11,"stream":"Science","count":6}`, and should be reviewed before publishing a timetable.

### Handwritten reference-day import

The uploaded teacher/period sheet contains no weekday, so its 24 teacher rows and 9 period cells are stored under `REFERENCE_DAY` with `weekdayVerified=false`; it is never automatically copied to Monday–Saturday. Open `/timetable/import-review` to inspect raw labels, confidence flags, teacher identity matches, the immutable source snapshot, weekday verification, and the copy-day conflict preview. Schedule publication and AI generation remain blocked until a Principal explicitly verifies a weekday. Ambiguous labels stay marked for review; raw handwritten text is retained alongside parsed fields.

Run `npm test` and `npm run build` from the project root to validate the server tests and client production build.

### Isolated feature regression tests

Run `TEST_MONGODB_URI=mongodb://127.0.0.1:27028 npm run test:features -w server` against a local test MongoDB instance. The suite creates a randomly named `srps_feature_test_*` database and drops only that database on completion. It uses test signing secrets and disables outbound email. It covers login and roles, master records, timetable operations, attendance and Excel export, substitutions, leave requests, QR preview, and handwritten import, including regression cases found during the feature audit.

See `FEATURE_AUDIT.md` for results and remaining manual checks.

### Realtime T304 mini face attendance

Primary: direct FkWeb push (diagnostic receiver locally implemented; physical protocol and public deployment pending). Fallback: official SBXPC Windows x86 bridge. Both reuse the same attendance pipeline, staff mappings and daily register. Open **Face attendance** in the sidebar.

See [configuration, status, APIs and controlled physical-test procedure](docs/realtime-t304-face-attendance.md) and [Windows fallback bridge](integrations/realtime-t304-bridge/README.md). Do not change the device's existing Web Server URL until a public receiver has passed readiness checks. Diagnostic captures never create attendance automatically.
