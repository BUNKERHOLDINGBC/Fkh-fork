if ($doNotPublishApps) {
    Write-Host "Not publishing apps, skipping pipeline initialization"
    return
}

# BcContainerHelper override

$parts = "$ENV:GITHUB_REPOSITORY". Split('/')
$containerName = "$($parts[0])-$($parts[1])-$($ENV:_project)-$($ENV:_buildMode)-$($ENV:GITHUB_RUN_ID)".ToLower() -replace "[^a-z0-9\-]"

$containersJson = fkh listcontainers --all --asjson --useOIDC
Write-Host $containersJson
$containers = $containersJson | convertfrom-json
$container = $containers.containers | Where-Object { $_.appLabel -eq $containerName }
if (-not $container) {
    $adminUsername = "admin"
    $adminPassword = GetRandomPassword
    $settings = $ENV:Settings | ConvertFrom-Json

    $params = @{
        name           = $containerName
        artifactUrl    = $artifact
        adminUsername  = $adminUsername
        adminPassword  = $adminPassword
        autostop       = "6h"
        repo           = $ENV:REPOSITORY
        project        = $ENV:_project
    }
    if ($settings.PSObject.Properties.Name -eq "fkh") {
        $fkhSettings = $settings."fkh"
        foreach ($prop in $fkhSettings.PSObject.Properties) {
            if ($prop.Name -like "CreateContainer.*") {
                $paramName = $prop.Name.Substring("CreateContainer.".Length)
                if (-not $params.ContainsKey($paramName)) {
                    $params[$paramName] = $prop.Value
                }
            }
        }
    }
    $fkhArgs = @("createcontainer", "--useOIDC", "--asJson")
    foreach ($key in $params.Keys) {
        if ($params[$key]) {
            $fkhArgs += "--$key"
            $fkhArgs += "$($params[$key])"
        }
    }

    Write-Host "Creating container $containerName $($fkhArgs -join ' ')"
    $result = fkh @fkhArgs
    Write-Host "CreateContainer Result: $result"
    $container = $result | ConvertFrom-Json
}
$bcAuthContext = @{
    "username" = $adminUsername
    "password" = ConvertTo-SecureString -String $adminPassword -AsPlainText -Force
}
Set-Variable -Name 'bcAuthContext' -value $bcAuthContext -scope 1
Set-Variable -Name 'environment' -value $container.webClient -scope 1
