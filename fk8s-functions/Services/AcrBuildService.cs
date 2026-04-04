using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.ContainerRegistry;
using Azure.ResourceManager.ContainerRegistry.Models;
using Microsoft.Extensions.Logging;

namespace FK8s.Services;

/// <summary>
/// Submits an ACR multi-step task that downloads BcContainerHelper,
/// prepares the build context via New-BcImage, builds the Docker image,
/// and pushes it — all inside an ACR Task container (no local PowerShell).
/// </summary>
public class AcrBuildService
{
    private readonly ILogger<AcrBuildService> _logger;

    public AcrBuildService(ILogger<AcrBuildService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Checks whether an image tag already exists in the ACR registry
    /// using the Docker Registry HTTP API v2.
    /// </summary>
    public async Task<bool> ImageExistsAsync(string acrName, string imageName)
    {
        // imageName is "registry.azurecr.io/repo:tag" — split into repo and tag
        var repoAndTag = imageName.Contains('/')
            ? imageName[(imageName.IndexOf('/') + 1)..]
            : imageName;

        var parts = repoAndTag.Split(':', 2);
        var repository = parts[0];
        var tag = parts.Length > 1 ? parts[1] : "latest";

        var loginServer = $"{acrName}.azurecr.io";

        var clientId = Environment.GetEnvironmentVariable("AZURE_CLIENT_ID");
        var managedId = string.IsNullOrEmpty(clientId)
            ? ManagedIdentityId.SystemAssigned
            : ManagedIdentityId.FromUserAssignedClientId(clientId);
        var credential = new ManagedIdentityCredential(managedId);

        // Get an ACR access token via the OAuth2 exchange endpoint
        var acrToken = await GetAcrAccessTokenAsync(credential, loginServer, repository);

        using var httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", acrToken);

        var url = $"https://{loginServer}/v2/{repository}/manifests/{tag}";
        var request = new HttpRequestMessage(HttpMethod.Head, url);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.docker.distribution.manifest.v2+json"));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.oci.image.manifest.v1+json"));

        var response = await httpClient.SendAsync(request);
        return response.IsSuccessStatusCode;
    }

    private static async Task<string> GetAcrAccessTokenAsync(
        ManagedIdentityCredential credential, string loginServer, string repository)
    {
        // Step 1: Get an AAD token for the ACR audience
        var tokenResult = await credential.GetTokenAsync(
            new Azure.Core.TokenRequestContext(new[] { "https://management.azure.com/.default" }));

        // Step 2: Exchange AAD token for an ACR refresh token, then access token
        using var httpClient = new HttpClient();
        var exchangeUrl = $"https://{loginServer}/oauth2/exchange";
        var exchangeContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "access_token",
            ["service"] = loginServer,
            ["access_token"] = tokenResult.Token
        });

        var exchangeResponse = await httpClient.PostAsync(exchangeUrl, exchangeContent);
        exchangeResponse.EnsureSuccessStatusCode();
        var exchangeJson = JsonSerializer.Deserialize<JsonElement>(
            await exchangeResponse.Content.ReadAsStringAsync());
        var refreshToken = exchangeJson.GetProperty("refresh_token").GetString()!;

        var tokenUrl = $"https://{loginServer}/oauth2/token";
        var tokenContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["service"] = loginServer,
            ["scope"] = $"repository:{repository}:pull",
            ["refresh_token"] = refreshToken
        });

        var tokenResponse = await httpClient.PostAsync(tokenUrl, tokenContent);
        tokenResponse.EnsureSuccessStatusCode();
        var tokenJson = JsonSerializer.Deserialize<JsonElement>(
            await tokenResponse.Content.ReadAsStringAsync());
        return tokenJson.GetProperty("access_token").GetString()!;
    }

    public async Task BuildAndPushAsync(
        string subscriptionId,
        string resourceGroup,
        string acrName,
        string imageName,
        string baseImage,
        string artifactUrl)
    {
        // ── Authenticate with managed identity ──────────────────────────────
        var clientId = Environment.GetEnvironmentVariable("AZURE_CLIENT_ID");
        var managedId = string.IsNullOrEmpty(clientId)
            ? ManagedIdentityId.SystemAssigned
            : ManagedIdentityId.FromUserAssignedClientId(clientId);
        var credential = new ManagedIdentityCredential(managedId);
        var armClient = new ArmClient(credential);

        var registryId = ContainerRegistryResource.CreateResourceIdentifier(
            subscriptionId, resourceGroup, acrName);
        var registry = armClient.GetContainerRegistryResource(registryId);

        // ── Build the ACR task YAML ─────────────────────────────────────────
        // Split "registry.azurecr.io/repo:tag" into "repo:tag"
        var imageTag = imageName.Contains('/')
            ? imageName[(imageName.IndexOf('/') + 1)..]
            : imageName;

        var taskYaml = """
            version: v1.1.0
            steps:
              - cmd: >-
                  {{.Values.baseImage}}
                  powershell -NoProfile -ExecutionPolicy Bypass -Command "
                    $ProgressPreference='SilentlyContinue';
                    $bcchZip = 'C:\bcch.zip';
                    Invoke-WebRequest -Uri 'https://bccontainerhelper-addgd5gzaxf9fneh.b02.azurefd.net/public/latest.zip' -OutFile $bcchZip -UseBasicParsing;
                    Expand-Archive $bcchZip -DestinationPath C:\bcch -Force;
                    . C:\bcch\BcContainerHelper\BcContainerHelper.ps1;
                    New-BcImage -artifactUrl '{{.Values.artifactUrl}}' -imageName '{{.Values.imageName}}' -multitenant -baseImage '{{.Values.baseImage}}' -populateBuildFolder C:\build
                  "
                id: prepare
              - build: -t {{.Run.Registry}}/{{.Values.imageTag}} -f C:\build\Dockerfile C:\build
                id: build
                when:
                  - prepare
              - push:
                  - "{{.Run.Registry}}/{{.Values.imageTag}}"
                when:
                  - build
            """;

        var encodedTask = Convert.ToBase64String(Encoding.UTF8.GetBytes(taskYaml));

        _logger.LogInformation(
            "Submitting ACR task for image {Image} using artifact {ArtifactUrl}...",
            imageTag, artifactUrl);

        var taskRun = new ContainerRegistryEncodedTaskRunContent(
            encodedTask,
            new ContainerRegistryPlatformProperties(ContainerRegistryOS.Windows))
        {
            TimeoutInSeconds = 7200,
        };

        taskRun.Values.Add(new ContainerRegistryTaskOverridableValue("artifactUrl", artifactUrl));
        taskRun.Values.Add(new ContainerRegistryTaskOverridableValue("imageName", imageName));
        taskRun.Values.Add(new ContainerRegistryTaskOverridableValue("imageTag", imageTag));
        taskRun.Values.Add(new ContainerRegistryTaskOverridableValue("baseImage", baseImage));

        var operation = await registry.ScheduleRunAsync(
            Azure.WaitUntil.Completed, taskRun);

        var run = operation.Value;
        _logger.LogInformation("ACR task scheduled. Run ID: {RunId}, Status: {Status}",
            run.Data.RunId, run.Data.Status);

        // Poll until the run reaches a terminal state
        var terminalStatuses = new ContainerRegistryRunStatus[]
        {
            ContainerRegistryRunStatus.Succeeded,
            ContainerRegistryRunStatus.Failed,
            ContainerRegistryRunStatus.Canceled,
            ContainerRegistryRunStatus.Error,
            ContainerRegistryRunStatus.Timeout
        };

        while (run.Data.Status is null || !terminalStatuses.Any(s => s == run.Data.Status))
        {
            await Task.Delay(TimeSpan.FromSeconds(15));
            run = (await run.GetAsync()).Value;
            _logger.LogInformation("ACR task Run ID: {RunId}, Status: {Status}",
                run.Data.RunId, run.Data.Status);
        }

        if (run.Data.Status != ContainerRegistryRunStatus.Succeeded)
        {
            throw new InvalidOperationException(
                $"ACR task failed with status '{run.Data.Status}'. Run ID: {run.Data.RunId}");
        }
    }
}
