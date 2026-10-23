# Windows desktop update handoff

`electron/desktop-update-service.ts` owns download verification, update safety
backups, `pending.json`, `installing.json` and settings `lastResult`. IPC channels,
lock gates and renderer status fields remain the existing update contract.
`main-entry.ts` awaits the update decision before importing `main.ts`, opening
SQLite or applying pending data maintenance.

## Independent installation window

Windows x64 and x86 configurations include `resources/updater/windows-install.ps1`
through Windows `extraResources`; the x86 configuration inherits the base Windows
resources. The source requires the Windows inbox PowerShell 5.1 and WPF. It is
copied verbatim to `userData/updates/sessions/<uuid>/`, alongside a validated JSON
request. Its executable, working directory, script and loaded frameworks are
outside the installation being replaced. No Electron helper window or installed
`elevate.exe` stays alive during installation.

The service checks the download's path, real path, size and SHA-256 before starting
any helper, then calls the existing `createUpdateSafetyBackup` owner. Startup checks Electron's singleton before staging an update, so a duplicate
shortcut cannot stage an installer while the original UI is still running. A per-data-root
`preparing.json` exclusive lock serializes simultaneous launchers and is recovered
when its owner has exited. A new `installing.json` keeps the pending record and
backup folder name, adding `helperSession` and `helperPid`. Existing markers
without helper fields retain the previous result reconciliation behavior.

PowerShell is spawned with an argument array, `shell: false`, `-NoProfile`, `-STA`
and `-File`. Request values never become script/command text. The helper validates
its request location/session, version/hash/size, direct download path, reparse
points and requesting executable/process identity. It renders WPF and initializes
its worker before writing `ready` to its session's atomic `status.json`. Only that
acknowledgment lets the service write `proceed.json`, remove `pending.json` and quit
the current app. There is no updater `app.relaunch()`.

A WPF worker runspace handles blocking work so the window remains responsive.
The phases describe observations rather than inferred numeric progress:

| Phase | Observation |
| --- | --- |
| Preparing | Parent process/installation directory processes must exit; then SHA-256 is checked again under a read lock. |
| Awaiting permission | Windows `RunAs` is being requested for the verified installer. |
| Installing | The elevated NSIS process was returned and is still running. |
| Finishing | NSIS exited with code 0; target app startup has not yet acknowledged success. |
| Error / not verified | Cancellation, launch/exit failure, an expired wait, or no target startup acknowledgment. |

The activity bar is indeterminate and explicitly says it reports neither a
percentage nor remaining time. Windows' UAC secure desktop can cover the window
while permission is requested; the helper survives and remains on the normal
desktop. This OS security boundary cannot be drawn over by a normal application.

The helper requests elevation directly for NSIS with the existing fixed arguments
`--updated /S --force-run`. It waits for the exact original process to exit and
checks for remaining processes under the install directory. It never terminates
processes. `resources/updater/installer.nsh` overrides electron-builder's default
process termination with a safe refusal if an app session remains. This safeguard
applies to installers built with this configuration; existing released installers
are unchanged.

## Completion and recovery

Only startup of an app whose version is at least `targetVersion` writes
`lastResult.kind = success` and the matching session's `success.json`. The helper
closes automatically only after that acknowledgment. NSIS exit 0 or process spawn
alone never produces success. NSIS retains its normal app restart behavior. If no
acknowledgment arrives within 15 seconds of exit 0, the normal-user helper attempts
one restart of the original executable path with `--updated`; it never starts it
while NSIS is running. After two minutes without acknowledgment, the window shows
an explicit not-verified instruction and permits closing.

During an active helper or a surviving installer process, reopening the old app
exits before domain/SQLite startup and preserves all update markers and artifacts.
This includes an installer that outlives a crashed helper or a four-hour install
observation deadline. Process checks use signal 0 only. Once the helper/installer
are no longer active, old-version startup records an error and performs the
existing artifact cleanup; safety backups and preferences remain intact. The
helper writes session status, never competing writes to settings `lastResult`.

Readiness has a 90-second application deadline. Helpers without authorization
stop after 120 seconds, and application/process shutdown has a three-minute
budget. Installation observation stops after four hours without terminating NSIS;
the visible result remains not verified. UAC itself waits for the user's native
permission response. Polling stops on terminal results. Closing the window during
an active operation is refused; minimizing is available. Closing an error or
not-verified result never kills the installer.

If PowerShell, WPF or the packaged source cannot start/render/acknowledge, the app
shows an explicit native error and stays open. `pending.json` and the safety backup
are retained for retry, with no silent installer launch or exit. Late helpers lack
`proceed.json` and cannot install after a failed handshake.

## Verification boundary and next-release Windows sequence

`verify:check -- desktop-visible-updater` executes the compiled production service
with a stubbed process launcher and temporary data, checks startup deferral and
recovery, and loads/merges/schema-validates both builder configurations without
building installers. Native helper state assertions inspect source on Linux;
they do not execute WPF, UAC, NSIS or prove Windows file-lock behavior.

For the next authorized release, validate on disposable Windows x64 and x86 VMs
with a real prior installation, a backed-up database and representative slow CPU
and storage settings. Use local update feeds and test-only packages, never live
customer data:

1. Download and approve an update. Confirm the light native window is visible
   before the original app exits, has no percentages, and stays responsive while
   hashing and waiting. Verify data and backup folder contents.
2. Delay UAC, switch back to the normal desktop, then approve. Confirm the helper
   survives the original process and resource replacement, no wizard steps appear,
   and phases follow the actual installer process.
3. Open the old shortcut repeatedly while shutdown/UAC/install is pending. Check
   that no domain/SQLite initialization occurs, no second installer starts, and
   `installing.json` is preserved. Repeat with another Windows user session open;
   verify safe refusal and that no unrelated session is terminated.
4. Cancel UAC, then test an installer with a nonzero exit. Confirm a persistent
   error window, no success record, and truthful error reconciliation on reopening.
5. Block PowerShell/WPF or remove the helper in a test installation; corrupt the
   download/hash. Confirm an explicit app notification, no app exit, no installer,
   and a pending download available for retry.
6. Exercise spaces, Turkish characters, apostrophes, ampersands, dollar signs and
   backticks in supported local paths. Confirm they remain literal. Junctions and
   paths outside the download directory must be refused.
7. Let an update finish normally. Confirm new-version startup writes the matching
   acknowledgment and success `lastResult`, the helper disappears, and existing
   data/preferences survive. Do not use installer exit 0 as proof.
8. Block NSIS's app restart, then allow the helper's single post-exit restart.
   Block both and verify the two-minute not-verified message remains visible.
   Exercise shutdown and install observation deadlines with shortened constants
   in a disposable test build; verify no process is killed and no false success.
9. Terminate only the helper in a disposable VM after it has recorded the installer
   PID. Reopen the old app while NSIS runs; confirm it refuses to lock application
   files. Complete/recover the install and verify the next startup result.
10. Try close/Alt+F4 and minimize during each active phase and close terminal
    results. Confirm these actions never cancel or terminate a running installer.

Relevant platform behavior: [Electron singleton lock](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata),
[Microsoft Start-Process](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-5.1)
(`RunAs`, `PassThru`, independent Windows process lifetime) and
[WPF DispatcherTimer](https://learn.microsoft.com/en-us/dotnet/api/system.windows.threading.dispatchertimer)
(UI dispatcher scheduling). Native behavior remains a Windows validation item.
