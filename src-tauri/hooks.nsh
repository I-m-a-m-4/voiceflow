!macro NSIS_HOOK_PREINSTALL
    DetailPrint "Closing any running instances of Voiceflow..."
    nsExec::Exec 'taskkill /F /IM voiceflow.exe /T'
    nsExec::Exec 'taskkill /F /IM app.exe /T'
    nsExec::Exec 'taskkill /F /IM Voiceflow.exe /T'
    Sleep 1000
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    DetailPrint "Closing any running instances of Voiceflow..."
    nsExec::Exec 'taskkill /F /IM voiceflow.exe /T'
    nsExec::Exec 'taskkill /F /IM app.exe /T'
    nsExec::Exec 'taskkill /F /IM Voiceflow.exe /T'
    Sleep 1000
!macroend
