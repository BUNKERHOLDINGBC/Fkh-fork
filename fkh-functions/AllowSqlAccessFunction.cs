using FKH.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace FKH;

public class AllowSqlAccessFunction : FunctionBase
{
    private readonly ILogger<AllowSqlAccessFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FKHAllowSqlAccess _sqlAccess;

    public AllowSqlAccessFunction(ILogger<AllowSqlAccessFunction> logger, GitHubAuthService gitHub, FKHAllowSqlAccess sqlAccess)
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
