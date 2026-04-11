using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class ExtendAutoStopFunction : FunctionBase
{
    private readonly ILogger<ExtendAutoStopFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhScaleContainer _scaleContainer;

    public ExtendAutoStopFunction(ILogger<ExtendAutoStopFunction> logger, GitHubAuthService gitHub, FkhScaleContainer scaleContainer)
    {
        _logger = logger;
        _gitHub = gitHub;
        _scaleContainer = scaleContainer;
    }

    [Function("ExtendAutoStop")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ExtendAutoStop")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "ExtendAutoStop", _scaleContainer.ExtendAutoStopAsync);
}
