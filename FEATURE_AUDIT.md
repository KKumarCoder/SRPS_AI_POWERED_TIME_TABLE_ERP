# Feature audit — 4 October 2026

Overall: automated coverage passes after fixes, but the project is not yet verified end to end for operational use. The current imported timetable still requires review, and browser/hardware/email delivery checks remain outstanding.

## Verification results

- `npm test`: 14/14 unit tests passed (scheduling conflicts, eligibility, workload, recommendations, generation, attendance summaries, handwritten parsing and QR signatures).
- `npm run build`: production build passed. Non-blocking third-party annotation and bundle-size warnings remain.
- Original `server/test/integration.mjs`: passed on an isolated MongoDB instance, covering concurrent scans, token revocation, date/holiday/leave checks, revisions, protected cells, publication, attendance overrides and role isolation.
- `TEST_MONGODB_URI=mongodb://127.0.0.1:27028 npm run test:features -w server`: all 17 feature groups passed. Each run uses a fresh randomly named local database, deletes that database afterwards and explicitly disables outbound email.
- Running project `/api/health`: successful. Configured database ping succeeded; 34 teachers and one timetable were present. School records were not modified during these checks.

## Fixed defects

1. Teacher create/edit rejected empty optional birth/joining dates sent by the UI. Empty values are now accepted; non-empty values remain date-validated.
2. Administrator-created leave accepted an end date before the start date. Create/update now validate dates, teacher reference, reason, type and status.
3. School settings accepted impossible clock values such as `99:99`. Arrival, attendance windows and cutoff now validate clock ranges.
4. A timetable save without `slots` could erase an unlocked draft. Save and conflict-check endpoints now require a slot array.
5. Invalid report months such as `2026-13` caused a server error. They now return a validation error.
6. Copy-day accepted duplicate target days and could overwrite locked target cells. Both cases are rejected.
7. Setting a teacher login could overwrite an administrator account sharing that email. Existing accounts must belong to the same teacher before credentials are updated.
8. The cell editor discarded its Lock checkbox when applying the edit. The chosen lock value is now retained.
9. An initial bell schedule had no way to add periods. Add/remove-period controls are now available, up to nine periods.
10. Teacher-specific attendance URLs ignored the teacher ID. The report now initializes and updates its teacher filter from the route.
11. Teacher substitution acknowledgement errors were unhandled in the UI. They now display through the notification mechanism.

Items 1–7 were reproduced with API regression tests and verified after fixes. Items 8–11 were found through code review and pass compilation; interactive browser verification remains outstanding.

## Current school-data blockers and remaining checks

- The actual timetable is `HANDWRITTEN_REFERENCE_DAY`, `REFERENCE_DAY`, `DRAFT`, with `weekdayVerified=false`.
- It has 20 unmatched imported teacher rows and 37 cells marked for review. Complete identity/class/subject mapping and weekday verification before publication. These values were read only; no school timetable was changed.
- Substitutions are gated until the imported timetable is verified and published.
- AI generation is explicitly disabled for a timetable whose source is `HANDWRITTEN_REFERENCE_DAY`, including after weekday verification. Ordinary timetable generation passed on test fixtures. The application currently offers no separate working-schedule creation flow once a master timetable exists; this workflow remains a product limitation.
- Outbound email is disabled in the current configuration. SMTP settings exist, but delivery and the scheduled daily email job were not exercised. No real emails were sent.
- Camera permissions, QR detection, physical USB scanner input, print/PDF layout, interactive edits/dragging, responsive layouts and all browser navigation flows remain unverified. Browser inspection was attempted, but concurrent user browser activity prevented completion.
- Passing these checks does not establish correctness for every possible input or race condition. The new regression suite covers representative success/failure flows, not exhaustive certification.

## Repeat the isolated checks

Start a dedicated local MongoDB instance on port 27028 with its data directory outside the project. Then run:

```sh
npm test
npm run build
TEST_MONGODB_URI=mongodb://127.0.0.1:27028 npm run test:features -w server
```

The feature suite supplies test-only signing secrets and does not load the school `.env`. The original integration suite must also be pointed at an isolated MongoDB instance: it clears the fixed `srps_integration_test` database on that instance.
