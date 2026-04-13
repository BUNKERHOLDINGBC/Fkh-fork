using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class GetDatabaseDownloadSasFunction : FunctionBase
{
    private readonly ILogger<GetDatabaseDownloadSasFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhGetDatabaseDownloadSas _getDatabaseDownloadSas;

    public GetDatabaseDownloadSasFunction(ILogger<GetDatabaseDownloadSasFunction> logger, GitHubAuthService gitHub, FkhGetDatabaseDownloadSas getDatabaseDownloadSas)
    {
        _logger = logger;
        _gitHub = gitHub;
        _getDatabaseDownloadSas = getDatabaseDownloadSas;
    }

    [Function("GetDatabaseDownloadSas")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "GetDatabaseDownloadSas")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "GetDatabaseDownloadSas", _getDatabaseDownloadSas.GetDownloadSasAsync);
}
