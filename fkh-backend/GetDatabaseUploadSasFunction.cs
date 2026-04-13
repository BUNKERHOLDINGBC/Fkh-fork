using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class GetDatabaseUploadSasFunction : FunctionBase
{
    private readonly ILogger<GetDatabaseUploadSasFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhGetDatabaseUploadSas _getDatabaseUploadSas;

    public GetDatabaseUploadSasFunction(
        ILogger<GetDatabaseUploadSasFunction> logger,
        GitHubAuthService gitHub,
        FkhGetDatabaseUploadSas getDatabaseUploadSas)
    {
        _logger = logger;
        _gitHub = gitHub;
        _getDatabaseUploadSas = getDatabaseUploadSas;
    }

    [Function("GetDatabaseUploadSas")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "GetDatabaseUploadSas")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "GetDatabaseUploadSas", _getDatabaseUploadSas.GetUploadSasAsync);
}
