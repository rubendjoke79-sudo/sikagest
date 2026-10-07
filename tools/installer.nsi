; Installateur Windows de SikaGest (NSIS)
; makensis -DVERSION=1.0.0 -DSRC=<dossier de l'application> -DOUTFILE=<fichier.exe> -DICON=<icon.ico> installer.nsi
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APP "SikaGest"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}"

Name "${APP}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APP} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "Installation de ${APP}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${APP}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Installation de ${APP} ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Logiciel de gestion commerciale : caisse, ventes, achats, stock, clients et rapports.$\r$\n$\r$\nAucune connexion Internet n'est nécessaire pour l'installer ni pour l'utiliser.$\r$\n$\r$\nCliquez sur Suivant pour continuer."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer ${APP} maintenant"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

Section "Installation"
  ; Mise à jour silencieuse : on laisse le logiciel se fermer
  IfSilent 0 +2
    Sleep 2500
  nsExec::Exec 'taskkill /F /IM "${APP}.exe"'
  Pop $0
  Sleep 500

  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources\app"
  File /r "${SRC}\*.*"
  File "/oname=$INSTDIR\${APP}.ico" "${ICON}"
  WriteUninstaller "$INSTDIR\Desinstaller ${APP}.exe"

  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${APP}.exe" "" "$INSTDIR\${APP}.ico" 0
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${APP}.exe" "" "$INSTDIR\${APP}.ico" 0
  CreateShortcut "$SMPROGRAMS\${APP}\Désinstaller ${APP}.lnk" "$INSTDIR\Desinstaller ${APP}.exe"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP}.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstaller ${APP}.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Function .onInstSuccess
  ; Après une mise à jour silencieuse, on relance le logiciel (sauf si /norun)
  IfSilent 0 done
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/norun" $R1
  IfErrors 0 done
  Exec '"$INSTDIR\${APP}.exe"'
  done:
FunctionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${APP}.exe"'
  Pop $0
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  ; Les données (ventes, produits…) sont conservées dans %APPDATA%\${APP}
SectionEnd
