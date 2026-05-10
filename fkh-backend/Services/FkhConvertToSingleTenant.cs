using k8s;
using k8s.Models;
using Microsoft.Extensions.Logging;
using System.Text.Json;

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
        var deploymentName = $"{containerName}-deployment";

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
        // 1. Stops the service tier
        // 2. Exports the application tables from the app database into the tenant database (Export-NAVApplication)
        // 3. Reconfigures the server instance to single-tenant mode
        // 4. Optionally restarts the service tier
        var restartPart = doNotRestart
            ? ""
            : " Start-NAVServerInstance -ServerInstance $ServerInstance -Force;";

        var script =
            ". 'C:\\run\\prompt.ps1' -silent; " +
            "Stop-NAVServerInstance -ServerInstance $ServerInstance -Force; " +
            $"$securePassword = ConvertTo-SecureString ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{saPasswordBase64}'))) -AsPlainText -Force; " +
            "$databaseCredentials = New-Object System.Management.Automation.PSCredential('sa', $securePassword); " +
            $"Export-NAVApplication -DatabaseServer 'mssql-service' -DatabaseInstance '' " +
            $"-DatabaseName '{appDatabaseName}' -DestinationDatabaseName '{tenantDatabaseName}' " +
            "-DatabaseCredentials $databaseCredentials -Force; " +
            "Set-NAVServerConfiguration -ServerInstance $ServerInstance -KeyName 'Multitenant' -KeyValue 'false';" +
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

        // Drop the old app database and rename the tenant database to the app database name
        // so the DatabaseName in custom config doesn't need to change
        var mssqlPod = await FindMssqlPodAsync(client);
        var dropSql = $"IF DB_ID('{appDatabaseName}') IS NOT NULL BEGIN ALTER DATABASE [{appDatabaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{appDatabaseName}]; END";
        var dropScript = $"{SqlcmdPath} -S localhost -U sa -P \"$MSSQL_SA_PASSWORD\" -C -b -Q \"{dropSql}\" && echo 'DROP_COMPLETE'";
        var dropResult = await ExecInMssqlPodAsync(client, mssqlPod, dropScript);
        if (!dropResult.Stdout.Contains("DROP_COMPLETE"))
            throw new InvalidOperationException($"Failed to drop old app database '{appDatabaseName}'. {dropResult}");

        var renameSql = $"ALTER DATABASE [{tenantDatabaseName}] MODIFY NAME = [{appDatabaseName}]";
        var renameScript = $"{SqlcmdPath} -S localhost -U sa -P \"$MSSQL_SA_PASSWORD\" -C -b -Q \"{renameSql}\" && echo 'RENAME_COMPLETE'";
        var renameResult = await ExecInMssqlPodAsync(client, mssqlPod, renameScript);
        if (!renameResult.Stdout.Contains("RENAME_COMPLETE"))
            throw new InvalidOperationException($"Failed to rename database '{tenantDatabaseName}' to '{appDatabaseName}'. {renameResult}");

        Logger.LogInformation("Dropped old app database and renamed '{TenantDb}' to '{AppDb}'.", tenantDatabaseName, appDatabaseName);

        // Remove the multitenant env var from the deployment so restarts stay single-tenant
        var deployment = await client.ReadNamespacedDeploymentAsync(deploymentName, Namespace);
        var container = deployment.Spec.Template.Spec.Containers[0];
        container.Env = container.Env?.Where(e => e.Name != "multitenant").ToList();
        await client.ReplaceNamespacedDeploymentAsync(deployment, deploymentName, Namespace);
        Logger.LogInformation("Removed 'multitenant' env var from deployment '{Deployment}'.", deploymentName);

        Logger.LogInformation("Container '{Container}' converted to single-tenant successfully.", containerName);

        var restartMsg = doNotRestart
            ? " Service tier was not restarted (--doNotRestart)."
            : " Service tier has been restarted.";

        return new
        {
            message = $"Container '{containerName}' converted to single-tenant.{restartMsg}",
            containerName,
            tenant,
            databaseName = appDatabaseName
        };
    }
}
