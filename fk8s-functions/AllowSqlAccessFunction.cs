using FK8s.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace FK8s;

public class AllowSqlAccessFunction : FunctionBase
{
    private readonly ILogger<AllowSqlAccessFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FK8sAllowSqlAccess _sqlAccess;

    public AllowSqlAccessFunction(ILogger<AllowSqlAccessFunction> logger, GitHubAuthService gitHub, FK8sAllowSqlAccess sqlAccess)
    {
        _logger = logger;
        _gitHub = gitHub;
        _sqlAccess = sqlAccess;
    }

    [Function("AllowSqlAccess")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "AllowSqlAccess")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "AllowSqlAccess", _sqlAccess.AllowSqlAccessAsync);
}
