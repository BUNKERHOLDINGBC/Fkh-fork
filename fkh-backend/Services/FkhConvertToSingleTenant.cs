using k8s;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhConvertToSingleTenant : FkhServiceBase
{
    public FkhConvertToSingleTenant(ILogger<FkhConvertToSingleTenant> logger) : base(logger) { }

    public async Task<object> ConvertToSingleTenantAsync(Dictionary<string, string> parameters)
    {
        var containerName = ResolveAppName(parameters);
        var tenant = parameters.TryGetValue("tenant", out var t) && !string.IsNullOrWhiteSpace(t) ? t : "default";
        var doNotRestart = parameters.TryGetValue("doNotRestart", out var flag)
            && string.Equals(flag, "true", StringComparison.OrdinalIgnoreCase);

        var appDatabaseName = containerName; // app database is named after the container
        var tenantDatabaseName = $"{containerName}-{tenant}";

        var client = await GetKubernetesClientAsync();

        // Find the BC pod for this container
        var pods = await client.ListNamespacedPodAsync(Namespace, labelSelector: $"app={containerName}");
        var pod = pods.Items.FirstOrDefault(p => p.Status?.Phase == "Running")
            ?? throw new InvalidOperationException($"No running container found for '{containerName}'. Make sure the container is started and ready.");

        var podName = pod.Metadata.Name;
        var bcContainerName = pod.Spec.Containers[0].Name;

        // Read database credentials from the mssql-secret
        var secret = await client.ReadNamespacedSecretAsync("mssql-secret", Namespace);
        var saPassword = System.Text.Encoding.UTF8.GetString(secret.Data["sa-password"]);
        var saPasswordBase64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(saPassword));

        // Build the script that:
        // 1. Creates SQL credentials
        // 2. Exports the application tables from the app database into the tenant database (Export-NAVApplication)
        // 3. Reconfigures the server instance to use the tenant database as a single-tenant database
        // 4. Optionally restarts the service tier
        var restartPart = doNotRestart
            ? ""
            : " Restart-NAVServerInstance -ServerInstance $ServerInstance -Force;";

        var script =
            ". 'C:\\run\\prompt.ps1' -silent; " +
            $"$securePassword = ConvertTo-SecureString ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{saPasswordBase64}'))) -AsPlainText -Force; " +
            "$databaseCredentials = New-Object System.Management.Automation.PSCredential('sa', $securePassword); " +
            $"Export-NAVApplication -DatabaseServer 'mssql-service' -DatabaseInstance '' " +
            $"-DatabaseName '{appDatabaseName}' -DestinationDatabaseName '{tenantDatabaseName}' " +
            "-DatabaseCredentials $databaseCredentials -Force; " +
            "Set-NAVServerConfiguration -ServerInstance $ServerInstance -KeyName 'Multitenant' -KeyValue 'false'; " +
            $"Set-NAVServerConfiguration -ServerInstance $ServerInstance -KeyName 'DatabaseName' -KeyValue '{tenantDatabaseName}';" +
            restartPart;

        Logger.LogInformation(
            "Converting container '{Container}' to single-tenant using tenant '{Tenant}' (database '{Database}')...",
            containerName, tenant, tenantDatabaseName);

        var result = await RunDetachedInBcPodAsync(
            client, podName, bcContainerName,
            jobPrefix: "fkh-converttosingletenant",
            jobIdInput: $"{containerName}|{tenant}|{tenantDatabaseName}",
            script: script,
            retryAfterSeconds: 15,
            retryMessage: "Converting to single-tenant — still running...");

        if (!string.IsNullOrWhiteSpace(result.Stderr))
            throw new InvalidOperationException($"Failed to convert container '{containerName}' to single-tenant: {result.Stderr}");

        Logger.LogInformation("Container '{Container}' converted to single-tenant successfully.", containerName);

        var restartMsg = doNotRestart
            ? " Service tier was not restarted (--doNotRestart)."
            : " Service tier has been restarted.";

        return new
        {
            message = $"Container '{containerName}' converted to single-tenant using database '{tenantDatabaseName}'.{restartMsg} The original app database is left behind.",
            containerName,
            tenant,
            databaseName = tenantDatabaseName
        };
    }
}
