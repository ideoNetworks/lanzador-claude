; Lanzador Claude - NSIS installer hooks and "first-run seed" page.
; Included by windows/nsis/installer.nsi (see bundle.windows.nsis.template in tauri.conf.json).
;
; The seed is written to HKCU\Software\iDeo\LanzadorClaude\Seed:
;   Autostart (DWORD 0/1), Profile (SZ: ""|safe|auto|ps-opus), Pinned (SZ: "id[=value];id2;...")
; The app reads it on first run (no config.json yet) and turns it into configuration.
;
; Silent (/S) installs do not show the page. They still write a seed from defaults
; (Autostart=0, Profile="", Pinned="") unless overridden on the command line:
;   setup.exe /S /AUTOSTART=1 /PROFILE=ps-opus "/PINNED=flag.verbose;env.DISABLE_TELEMETRY=1"
; Updates (/UPDATE) never touch the seed.

!define SEED_KEY "Software\iDeo\LanzadorClaude\Seed"

; WordFunc.nsh is included by the template; instantiate the function used for command-line parsing.
!insertmacro WordReplace

Var SeedAutostart
Var SeedProfile
Var SeedPinned
Var SeedC1
Var SeedC2
Var SeedC3
Var SeedC4
Var SeedC5
Var SeedC6
Var SeedC7
Var SeedC8
Var SeedHAuto
Var SeedHNone
Var SeedHSafe
Var SeedHAutoProf
Var SeedHPsOpus
Var SeedH1
Var SeedH2
Var SeedH3
Var SeedH4
Var SeedH5
Var SeedH6
Var SeedH7
Var SeedH8

; ---- Page texts (LCIDs: 1034 Spanish, 1033 English, 2052 Simplified Chinese) ----
LangString SeedTitle 1034 "Opciones iniciales"
LangString SeedTitle 1033 "Initial options"
LangString SeedTitle 2052 "初始选项"
LangString SeedSubtitle 1034 "Elige cómo se configurará Lanzador Claude la primera vez que se abra."
LangString SeedSubtitle 1033 "Choose how Lanzador Claude will be configured the first time it starts."
LangString SeedSubtitle 2052 "选择 Lanzador Claude 首次启动时的配置方式。"
LangString SeedAutostart 1034 "Arrancar con Windows"
LangString SeedAutostart 1033 "Start with Windows"
LangString SeedAutostart 2052 "随 Windows 启动"
LangString SeedProfileLabel 1034 "Perfil inicial"
LangString SeedProfileLabel 1033 "Initial profile"
LangString SeedProfileLabel 2052 "初始配置文件"
LangString SeedProfNone 1034 "Ninguno"
LangString SeedProfNone 1033 "None"
LangString SeedProfNone 2052 "无"
LangString SeedProfSafe 1034 "Seguro"
LangString SeedProfSafe 1033 "Safe"
LangString SeedProfSafe 2052 "安全"
LangString SeedProfAuto 1034 "Autónomo"
LangString SeedProfAuto 1033 "Autonomous"
LangString SeedProfAuto 2052 "自主"
LangString SeedProfPs 1034 "PowerShell + Opus"
LangString SeedProfPs 1033 "PowerShell + Opus"
LangString SeedProfPs 2052 "PowerShell + Opus"
LangString SeedPinnedLabel 1034 "Opciones fijadas por defecto"
LangString SeedPinnedLabel 1033 "Options pinned by default"
LangString SeedPinnedLabel 2052 "默认固定的选项"

; ---- Page functions. Inserted by the template after the installer variables are declared. ----
!macro SEED_PAGE_FUNCTIONS
  Function SeedPageCreate
    ; No page for passive or update installs (silent installs never show pages).
    ${If} $PassiveMode = 1
    ${OrIf} $UpdateMode = 1
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$(SeedTitle)" "$(SeedSubtitle)"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateCheckbox} 0u 0u 130u 11u "$(SeedAutostart)"
    Pop $SeedHAuto
    ${If} $SeedAutostart == 1
      ${NSD_Check} $SeedHAuto
    ${EndIf}

    ${NSD_CreateLabel} 0u 20u 130u 11u "$(SeedProfileLabel)"
    Pop $0
    ${NSD_CreateRadioButton} 8u 32u 122u 11u "$(SeedProfNone)"
    Pop $SeedHNone
    ${NSD_AddStyle} $SeedHNone ${WS_GROUP}
    ${NSD_CreateRadioButton} 8u 44u 122u 11u "$(SeedProfSafe)"
    Pop $SeedHSafe
    ${NSD_CreateRadioButton} 8u 56u 122u 11u "$(SeedProfAuto)"
    Pop $SeedHAutoProf
    ${NSD_CreateRadioButton} 8u 68u 122u 11u "$(SeedProfPs)"
    Pop $SeedHPsOpus
    ${If} $SeedProfile == "safe"
      ${NSD_Check} $SeedHSafe
    ${ElseIf} $SeedProfile == "auto"
      ${NSD_Check} $SeedHAutoProf
    ${ElseIf} $SeedProfile == "ps-opus"
      ${NSD_Check} $SeedHPsOpus
    ${Else}
      ${NSD_Check} $SeedHNone
    ${EndIf}

    ${NSD_CreateLabel} 140u 0u 160u 11u "$(SeedPinnedLabel)"
    Pop $0
    ${NSD_CreateCheckbox} 140u 12u 160u 11u "--model opus"
    Pop $SeedH1
    ${NSD_CreateCheckbox} 140u 24u 160u 11u "--continue"
    Pop $SeedH2
    ${NSD_CreateCheckbox} 140u 36u 160u 11u "--permission-mode auto"
    Pop $SeedH3
    ${NSD_CreateCheckbox} 140u 48u 160u 11u "--ide"
    Pop $SeedH4
    ${NSD_CreateCheckbox} 140u 60u 160u 11u "--verbose"
    Pop $SeedH5
    ${NSD_CreateCheckbox} 140u 72u 160u 11u "CLAUDE_CODE_USE_POWERSHELL_TOOL"
    Pop $SeedH6
    ${NSD_CreateCheckbox} 140u 84u 160u 11u "DISABLE_TELEMETRY"
    Pop $SeedH7
    ${NSD_CreateCheckbox} 140u 96u 160u 22u "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"
    Pop $SeedH8
    ${If} $SeedC1 == 1
      ${NSD_Check} $SeedH1
    ${EndIf}
    ${If} $SeedC2 == 1
      ${NSD_Check} $SeedH2
    ${EndIf}
    ${If} $SeedC3 == 1
      ${NSD_Check} $SeedH3
    ${EndIf}
    ${If} $SeedC4 == 1
      ${NSD_Check} $SeedH4
    ${EndIf}
    ${If} $SeedC5 == 1
      ${NSD_Check} $SeedH5
    ${EndIf}
    ${If} $SeedC6 == 1
      ${NSD_Check} $SeedH6
    ${EndIf}
    ${If} $SeedC7 == 1
      ${NSD_Check} $SeedH7
    ${EndIf}
    ${If} $SeedC8 == 1
      ${NSD_Check} $SeedH8
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function SeedPageLeave
    ${NSD_GetState} $SeedHAuto $SeedAutostart
    StrCpy $SeedProfile ""
    ${NSD_GetState} $SeedHSafe $0
    ${If} $0 == 1
      StrCpy $SeedProfile "safe"
    ${EndIf}
    ${NSD_GetState} $SeedHAutoProf $0
    ${If} $0 == 1
      StrCpy $SeedProfile "auto"
    ${EndIf}
    ${NSD_GetState} $SeedHPsOpus $0
    ${If} $0 == 1
      StrCpy $SeedProfile "ps-opus"
    ${EndIf}
    ${NSD_GetState} $SeedH1 $SeedC1
    ${NSD_GetState} $SeedH2 $SeedC2
    ${NSD_GetState} $SeedH3 $SeedC3
    ${NSD_GetState} $SeedH4 $SeedC4
    ${NSD_GetState} $SeedH5 $SeedC5
    ${NSD_GetState} $SeedH6 $SeedC6
    ${NSD_GetState} $SeedH7 $SeedC7
    ${NSD_GetState} $SeedH8 $SeedC8
  FunctionEnd
!macroend

!macro SEED_APPEND COND ENTRY
  ${If} ${COND} == 1
    ${If} $SeedPinned == ""
      StrCpy $SeedPinned "${ENTRY}"
    ${Else}
      StrCpy $SeedPinned "$SeedPinned;${ENTRY}"
    ${EndIf}
  ${EndIf}
!macroend

; ---- Tauri hooks ----
!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode <> 1
    ; Page choices -> Pinned list (ids from the catalog; fixed env values are "=1")
    StrCpy $SeedPinned ""
    !insertmacro SEED_APPEND $SeedC1 "flag.model=opus"
    !insertmacro SEED_APPEND $SeedC2 "flag.continue"
    !insertmacro SEED_APPEND $SeedC3 "flag.permission-mode=auto"
    !insertmacro SEED_APPEND $SeedC4 "flag.ide"
    !insertmacro SEED_APPEND $SeedC5 "flag.verbose"
    !insertmacro SEED_APPEND $SeedC6 "env.CLAUDE_CODE_USE_POWERSHELL_TOOL=1"
    !insertmacro SEED_APPEND $SeedC7 "env.DISABLE_TELEMETRY=1"
    !insertmacro SEED_APPEND $SeedC8 "env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1"
    ${If} $SeedAutostart != 1
      StrCpy $SeedAutostart 0
    ${EndIf}

    ; Command-line overrides (meant for silent deployments). Quotes are stripped first so that
    ; "/PINNED=a;b" and /PINNED=a;b behave the same (values cannot contain spaces).
    ${WordReplace} $CMDLINE '"' "" "+*" $1
    ClearErrors
    ${GetOptions} $1 "/AUTOSTART=" $0
    ${IfNot} ${Errors}
      ${If} $0 == "1"
        StrCpy $SeedAutostart 1
      ${Else}
        StrCpy $SeedAutostart 0
      ${EndIf}
    ${EndIf}
    ClearErrors
    ${GetOptions} $1 "/PROFILE=" $0
    ${IfNot} ${Errors}
      StrCpy $SeedProfile $0
    ${EndIf}
    ClearErrors
    ${GetOptions} $1 "/PINNED=" $0
    ${IfNot} ${Errors}
      StrCpy $SeedPinned $0
    ${EndIf}
    ClearErrors

    WriteRegDWORD HKCU "${SEED_KEY}" "Autostart" $SeedAutostart
    WriteRegStr HKCU "${SEED_KEY}" "Profile" "$SeedProfile"
    WriteRegStr HKCU "${SEED_KEY}" "Pinned" "$SeedPinned"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; First-run seed
    DeleteRegKey HKCU "Software\iDeo\LanzadorClaude"
    DeleteRegKey /ifempty HKCU "Software\iDeo"
    ; Explorer context menu created by the app
    DeleteRegKey HKCU "Software\Classes\Directory\shell\LanzadorClaude"
    DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\LanzadorClaude"
    ; Autostart Run values (the template already removes "${PRODUCTNAME}")
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${MAINBINARYNAME}"
    ; %APPDATA%\iDeo\LanzadorClaude (config) is intentionally left alone.
  ${EndIf}
!macroend
