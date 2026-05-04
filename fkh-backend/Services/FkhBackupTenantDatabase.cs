using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhBackupTenantDatabase : FkhBackupDatabaseBase
{
    public FkhBackupTenantDatabase(ILogger<FkhBackupTenantDatabase> logger) : base(logger) { }

    public async Task<object> BackupTenantDatabaseAsync(Dictionary<string, string> parameters)
    {
        var githubUsername = parameters["_githubUsername"];
        var containerName = ResolveAppName(parameters);
        var tenant = parameters.TryGetValue("tenant", out var t) && !string.IsNullOrWhiteSpace(t) ? t : "default";
        var backupName = parameters["backupName"];
        var backupVersion = parameters["backupVersion"];

        var databaseName = $"{containerName}-{tenant}";

        return await BackupDatabaseToStorageAsync(githubUsername, databaseName, backupName, backupVersion);
    }
}
