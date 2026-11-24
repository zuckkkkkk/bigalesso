; BIGALESSO GAMES – installer extras (electron-builder NSIS include).
; Windows graphics preference "High performance" for the game exe: on laptops with Intel + NVIDIA/AMD the game
; runs on the dedicated GPU (same as Settings → System → Display → Graphics). Removed on uninstall.
!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\DirectX\UserGpuPreferences" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "GpuPreference=2;"
!macroend
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\DirectX\UserGpuPreferences" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend
