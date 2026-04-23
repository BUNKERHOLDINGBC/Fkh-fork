using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class CopyFileFromContainerFunction : FunctionBase
{
    private readonly ILogger<CopyFileFromContainerFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhCopyFileFromContainer _copyFileFromContainer;

    public CopyFileFromContainerFunction(ILogger<CopyFileFromContainerFunction> logger, GitHubAuthService gitHub, FkhCopyFileFromContainer copyFileFromContainer)
    {
        _logger = logger;
        _gitHub = gitHub;
        _copyFileFromContainer = copyFileFromContainer;
    }

    [Function("CopyFileFromContainer")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "CopyFileFromContainer")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "CopyFileFromContainer", _copyFileFromContainer.CopyFileFromContainerAsync);
}
