using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class RestoreTenantDatabaseFunction : FunctionBase
{
    private readonly ILogger<RestoreTenantDatabaseFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhRestoreTenantDatabase _restoreTenantDatabase;

    public RestoreTenantDatabaseFunction(
        ILogger<RestoreTenantDatabaseFunction> logger,
        GitHubAuthService gitHub,
        FkhRestoreTenantDatabase restoreTenantDatabase)
    {
        _logger = logger;
        _gitHub = gitHub;
        _restoreTenantDatabase = restoreTenantDatabase;
    }

    [Function("RestoreTenantDatabase")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "RestoreTenantDatabase")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "RestoreTenantDatabase", _restoreTenantDatabase.RestoreTenantDatabaseAsync);
}
