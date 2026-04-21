using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class StartFkhFunction : FunctionBase
{
    private readonly ILogger<StartFkhFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhClusterControl _clusterControl;

    public StartFkhFunction(ILogger<StartFkhFunction> logger, GitHubAuthService gitHub, FkhClusterControl clusterControl)
    {
        _logger = logger;
        _gitHub = gitHub;
        _clusterControl = clusterControl;
    }

    [Function("StartFkh")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "StartFkh")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "StartFkh", _clusterControl.StartClusterAsync, skipClusterCheck: true);
}
