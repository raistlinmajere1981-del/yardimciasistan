; Never let electron-builder's default CHECK_APP_RUNNING terminate other sessions.
; Abort safely if a session (or another installation with the same exe) is open.
!macro customCheckAppRunning
  nsProcess::FindProcess "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Please close all Yardimci Asistan sessions before updating. No running session has been stopped." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
