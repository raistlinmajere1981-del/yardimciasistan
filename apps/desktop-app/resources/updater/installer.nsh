; Never let electron-builder's default CHECK_APP_RUNNING terminate other sessions.
; Abort safely if a session (or another installation with the same exe) is open.
!macro customCheckAppRunning
  nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Please close all Yardimci Asistan sessions before updating. No running session has been stopped." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

; Offline Microsoft Visual C++ prerequisite. Never continue on failure.
!macro customInstall
  StrCpy $R1 "ia32"
  IfFileExists "$INSTDIR\resources\vc-runtime\VC_redist.x64.exe" 0 +2
    StrCpy $R1 "x64"
  StrCpy $R4 "x86"
  ${If} $R1 == "x64"
    StrCpy $R4 "x64"
    SetRegView 64
  ${Else}
    SetRegView 32
  ${EndIf}
  StrCpy $R2 0
  ReadRegDWORD $R2 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\$R4" "Installed"
  ${If} $R2 != 1
    IfFileExists "$INSTDIR\resources\vc-runtime\VC_redist.$R1.exe" +3 0
      MessageBox MB_OK|MB_ICONSTOP "Microsoft Visual C++ yukleyicisi bulunamadi. Kurulum durduruldu."
      Abort
    DetailPrint "Microsoft Visual C++ Runtime ($R1) kuruluyor..."
    ExecWait '"$INSTDIR\resources\vc-runtime\VC_redist.$R1.exe" /install /quiet /norestart' $R3
    ${If} $R3 == 3010
      SetRebootFlag true
    ${EndIf}
    ${If} $R3 != 0
    ${AndIf} $R3 != 3010
    ${AndIf} $R3 != 1638
      MessageBox MB_OK|MB_ICONSTOP "Microsoft Visual C++ kurulamadı (kod $R3). Yardimci Asistan baslatilmayacak."
      Abort
    ${EndIf}
  ${EndIf}
!macroend
