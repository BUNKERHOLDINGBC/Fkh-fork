param([switch]$silent)
Invoke-Expression (Get-Content 'c:\run\prompt.ps1' -Raw)
Remove-Item Env:\databasePassword -ErrorAction SilentlyContinue
