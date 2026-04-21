using Azure.Identity;
using k8s;
using Microsoft.Extensions.Logging;
using Microsoft.Graph;
using Microsoft.Graph.Models;

namespace Fkh.Services;

public class FkhRemoveContainer : FkhServiceBase
{
    public FkhRemoveContainer(ILogger<FkhRemoveContainer> logger) : base(logger) { }

    public async Task<object> RemoveContainerAsync(Dictionary<string, string> parameters)
    {
        var name = parameters.TryGetValue("name", out var n) ? n : null;
        var githubUsername = parameters["_githubUsername"];
        var appName = ResolveAppName(parameters);
        var databaseName = appName;

        var deploymentName = $"{appName}-deployment";
        var serviceName = $"{appName}-service";
        var secretName = $"{appName}-secret";

        Logger.LogInformation("Removing container '{AppName}'...", appName);
        var client = await GetKubernetesClientAsync();
        var results = new List<string>();

        // Delete Kubernetes resources (ignore NotFound)
        results.Add(await TryDeleteAsync("Deployment", () => client.DeleteNamespacedDeploymentAsync(deploymentName, Namespace)));
        results.Add(await TryDeleteAsync("Service", () => client.DeleteNamespacedServiceAsync(serviceName, Namespace)));
        results.Add(await TryDeleteAsync("Secret", () => client.DeleteNamespacedSecretAsync(secretName, Namespace)));

        // Drop databases via k8s exec (ignore if they don't exist)
        results.Add(await TryDropDatabaseAsync(client, $"{databaseName}-default"));
        results.Add(await TryDropDatabaseAsync(client, databaseName));

        // Remove AAD redirect URI if AAD auth is configured
        if (!string.IsNullOrWhiteSpace(AadAppClientId))
        {
            var redirectUri = $"https://{appName}.{AksLocation}.cloudapp.azure.com/BC/SignIn";
            results.Add(await TryRemoveAadRedirectUriAsync(redirectUri));
        }

        Logger.LogInformation("Container '{AppName}' removal complete.", appName);
        return new { Container = appName, Results = results };
    }

    private async Task<string> TryDeleteAsync(string resourceType, Func<Task> deleteAction)
    {
        try
        {
            await deleteAction();
            return $"{resourceType} deleted";
        }
        catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return $"{resourceType} not found (skipped)";
        }
    }

    private async Task<string> TryDropDatabaseAsync(Kubernetes client, string databaseName)
    {
        try
        {
            var podName = await FindMssqlPodAsync(client);
            var script = $"{SqlcmdPath} -S localhost -U sa -P \"$MSSQL_SA_PASSWORD\" -C -b -Q " +
                $"\"IF DB_ID(N'{databaseName}') IS NOT NULL BEGIN ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{databaseName}]; PRINT N'DATABASE_DROPPED'; END ELSE PRINT N'DATABASE_NOT_FOUND'\"";
            var result = await ExecInMssqlPodAsync(client, podName, script);
            if (result.Stdout.Contains("DATABASE_DROPPED"))
                return "Database dropped";
            if (result.Stdout.Contains("DATABASE_NOT_FOUND"))
                return "Database not found (skipped)";
            return $"Database drop uncertain: {result}";
        }
        catch (Exception ex)
        {
            Logger.LogWarning(ex, "Failed to drop database '{DatabaseName}'", databaseName);
            return $"Database drop failed: {ex.Message}";
        }
    }

    private async Task<string> TryRemoveAadRedirectUriAsync(string redirectUri)
    {
        try
        {
#pragma warning disable CS0618
            var credential = new ManagedIdentityCredential(ClientId);
#pragma warning restore CS0618
            var graphClient = new GraphServiceClient(credential);

            var apps = await graphClient.Applications.GetAsync(r =>
            {
                r.QueryParameters.Filter = $"appId eq '{AadAppClientId}'";
                r.QueryParameters.Select = new[] { "id", "web" };
            });

            var app = apps?.Value?.FirstOrDefault();
            if (app is null)
                return "AAD App Registration not found (skipped)";

            var existingUris = app.Web?.RedirectUris ?? new List<string>();
            var updatedUris = existingUris
                .Where(u => !string.Equals(u, redirectUri, StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (updatedUris.Count == existingUris.Count)
                return "AAD redirect URI not found (skipped)";

            await graphClient.Applications[app.Id].PatchAsync(new Application
            {
                Web = new WebApplication { RedirectUris = updatedUris }
            });

            return "AAD redirect URI removed";
        }
        catch (Exception ex)
        {
            Logger.LogWarning(ex, "Failed to remove AAD redirect URI '{RedirectUri}'", redirectUri);
            return $"AAD redirect URI removal failed: {ex.Message}";
        }
    }
}
