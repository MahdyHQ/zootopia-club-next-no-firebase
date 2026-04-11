$ledgerPath = "zootopia-club-next-ledger.txt"
$backupPath = ".history/zootopia-club-next-ledger_20260411132302.txt"

$current = Get-Content $ledgerPath -Raw
$backup = Get-Content $backupPath -Raw

$marker = "Change Log"
$currentMarkerIndex = $current.IndexOf($marker)
$backupMarkerIndex = $backup.IndexOf($marker)

if ($currentMarkerIndex -lt 0 -or $backupMarkerIndex -lt 0) {
  throw "Change Log heading not found in current or backup ledger."
}

$currentPrefix = $current.Substring(0, $currentMarkerIndex + $marker.Length)
$backupEntries = $backup.Substring($backupMarkerIndex + $marker.Length).TrimStart("`r", "`n")

$newEntry = @'
- 2026-04-11 | Supabase/Auth.js/Vercel Truth-Alignment Pass (Docs + Comments + Ledger)
  - Mandatory-first-step compliance:
    - Read `zootopia-club-next-ledger.txt` completely before edits.
    - Ran an exploration subagent + direct file audits before applying changes.
  - Active-truth normalization completed:
    - Rewrote the pre-changelog architecture block so active runtime truth is consistently:
      - Supabase Auth
      - Supabase Postgres
      - Supabase Storage
      - Auth.js session/auth layer
      - Vercel deployment target
    - Removed/rewrote active-present Firebase/App Hosting claims from core active sections.
  - Section rewrites performed in this pass:
    - `Current Truth Snapshot`
    - `Important Folders And Files`
    - `API Map`
    - `Backend Runtime And Service Ownership`
    - `Auth And Session Architecture`
    - `Admin Login Architecture`
    - `Mandatory Profile Completion Architecture`
    - `Legacy Firebase Integration (Historical/Inactive)`
    - `Legacy Firebase Rules, Storage Rules, And Indexes (Reference Only)`
    - `Environment Strategy`
    - `Deployment Strategy`
    - `Important Security Assumptions And Trust Boundaries`
    - `Current Behavior And Boundaries`
  - Additional truth-alignment edits:
    - `README.md` docs links normalized to workspace-relative paths.
    - `docs/architecture.md` rewritten to Vercel/Supabase/Auth.js current truth.
    - App Hosting guide reframed as legacy reference; shared admin-password gate marked deprecated in active flow context.
    - Source comments in active server files updated to remove stale Firestore/App Hosting active-tense wording.
    - `packages/shared-config/src/features.ts` updated to `appHostingFirst: false` with explicit legacy-compatibility note.
  - Remaining Firebase references intentionally retained (with scope):
    - Legacy/reference documentation and archive context (`docs/legacy-reference/*`, legacy App Hosting guide sections).
    - Legacy migration/ETL terminology where source system is explicitly Firebase-era data.
    - Historical changelog entries documenting earlier architecture states.
  - Verification in this pass:
    - `npm run lint --workspace @zootopia/web` ✅ passed
    - `npm run typecheck --workspace @zootopia/web` ✅ passed
    - `npm run build --workspace @zootopia/web` ✅ passed
  - Safety and scope notes:
    - Runtime logic changes were intentionally minimal; most edits are architecture-truth wording and comments.
    - The workspace contained unrelated pre-existing file changes/deletions outside this pass; those were not reverted.
'@

$merged = $currentPrefix + "`r`n" + $newEntry.TrimEnd() + "`r`n" + $backupEntries
Set-Content -Path $ledgerPath -Value $merged -Encoding utf8NoBOM -NoNewline
Write-Output "LEDGER_CHANGELOG_RESTORED_OK"
