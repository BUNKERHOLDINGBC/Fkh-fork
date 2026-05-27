if ($doNotPublishApps) {
    Write-Host "Not publishing apps, skipping pipeline initialization"
    return
}

# BcContainerHelper override

$ENV:FKH_BACKEND_URL = "https://fkh-freddydk-backend.azurewebsites.net/api"
$ENV:FKH_TIMEZONE = "Europe/Copenhagen"

$parts = "$ENV:GITHUB_REPOSITORY". Split('/')
$containerName = "$($parts[0])-$($parts[1])-$($ENV:_project)-$($ENV:_buildMode)-$($ENV:GITHUB_RUN_ID)".ToLower() -replace "[^a-z0-9\-]"

$containers = fkh listcontainers --all --asjson --useOIDC | convertfrom-json
$container = $containers.containers | Where-Object { $_.appLabel -eq $containerName }
if (-not $container) {
    $adminUsername = "admin"
    $adminPassword = GetRandomPassword
    Write-Host "Creating container $containerName"
    $result = fkh createcontainer --name $containerName --artifactUrl $artifact --adminUsername $adminUsername --adminPassword $adminPassword --autostop 6h --useOIDC --asJson --repo $ENV:REPOSITORY --project $ENV:_project
    Write-Host "CreateContainer Result: $result"
    $container = $result | ConvertFrom-Json
}
$bcAuthContext = @{
    "username" = $adminUsername
    "password" = ConvertTo-SecureString -String $adminPassword -AsPlainText -Force
}
Set-Variable -Name 'bcAuthContext' -value $bcAuthContext -scope 1
Set-Variable -Name 'environment' -value $container.webClient -scope 1
