using FKH.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace FKH;

public class RevokeSqlAccessFunction : FunctionBase
{
    private readonly ILogger<RevokeSqlAccessFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FKHAllowSqlAccess _sqlAccess;

    public RevokeSqlAccessFunction(ILogger<RevokeSqlAccessFunction> logger, GitHubAuthService gitHub, FKHAllowSqlAccess sqlAccess)
    {
        _logger = logger;
        _gitHub = gitHub;
        _sqlAccess = sqlAccess;
    }

    [Function("RevokeSqlAccess")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "RevokeSqlAccess")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "RevokeSqlAccess", _sqlAccess.RevokeSqlAccessAsync);
}
