using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class StopFkhFunction : FunctionBase
{
    private readonly ILogger<StopFkhFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhClusterControl _clusterControl;

    public StopFkhFunction(ILogger<StopFkhFunction> logger, GitHubAuthService gitHub, FkhClusterControl clusterControl)
    {
        _logger = logger;
        _gitHub = gitHub;
        _clusterControl = clusterControl;
    }

    [Function("StopFkh")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "StopFkh")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "StopFkh", _clusterControl.StopClusterAsync, skipClusterCheck: true);
}
