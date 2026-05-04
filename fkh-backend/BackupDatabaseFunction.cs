using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class BackupDatabaseFunction : FunctionBase
{
    private readonly ILogger<BackupDatabaseFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhBackupDatabase _backupDatabase;

    public BackupDatabaseFunction(
        ILogger<BackupDatabaseFunction> logger,
        GitHubAuthService gitHub,
        FkhBackupDatabase backupDatabase)
    {
        _logger = logger;
        _gitHub = gitHub;
        _backupDatabase = backupDatabase;
    }

    [Function("BackupDatabase")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "BackupDatabase")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "BackupDatabase", _backupDatabase.BackupDatabaseAsync);
}
