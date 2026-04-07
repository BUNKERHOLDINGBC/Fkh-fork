using FK8s.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace FK8s;

public class RevokeSqlAccessFunction : FunctionBase
{
    private readonly ILogger<RevokeSqlAccessFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FK8sAllowSqlAccess _sqlAccess;

    public RevokeSqlAccessFunction(ILogger<RevokeSqlAccessFunction> logger, GitHubAuthService gitHub, FK8sAllowSqlAccess sqlAccess)
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
