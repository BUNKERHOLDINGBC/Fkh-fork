using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhRestoreTenantDatabase : FkhServiceBase
{
    public FkhRestoreTenantDatabase(ILogger<FkhRestoreTenantDatabase> logger) : base(logger) { }

    public async Task<object> RestoreTenantDatabaseAsync(Dictionary<string, string> parameters)
    {
        var containerName = ResolveAppName(parameters);
        var tenant = parameters.TryGetValue("tenant", out var t) && !string.IsNullOrWhiteSpace(t) ? t : "default";
        var database = parameters["database"];

        var databaseName = $"{containerName}-{tenant}";

        var sasUrl = await ResolveUseDatabaseAsync(database);

        var client = await GetKubernetesClientAsync();
        await RestoreDatabaseViaExecAsync(client, sasUrl, databaseName);

        return new { message = $"Tenant database '{databaseName}' restored successfully.", containerName, tenant, databaseName };
    }
}
