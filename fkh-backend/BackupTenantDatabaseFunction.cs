using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class BackupTenantDatabaseFunction : FunctionBase
{
    private readonly ILogger<BackupTenantDatabaseFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhBackupTenantDatabase _backupTenantDatabase;

    public BackupTenantDatabaseFunction(
        ILogger<BackupTenantDatabaseFunction> logger,
        GitHubAuthService gitHub,
        FkhBackupTenantDatabase backupTenantDatabase)
    {
        _logger = logger;
        _gitHub = gitHub;
        _backupTenantDatabase = backupTenantDatabase;
    }

    [Function("BackupTenantDatabase")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "BackupTenantDatabase")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "BackupTenantDatabase", _backupTenantDatabase.BackupTenantDatabaseAsync);
}
