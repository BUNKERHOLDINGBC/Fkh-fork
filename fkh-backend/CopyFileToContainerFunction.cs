using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class CopyFileToContainerFunction : FunctionBase
{
    private readonly ILogger<CopyFileToContainerFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhCopyFileToContainer _copyFileToContainer;

    public CopyFileToContainerFunction(ILogger<CopyFileToContainerFunction> logger, GitHubAuthService gitHub, FkhCopyFileToContainer copyFileToContainer)
    {
        _logger = logger;
        _gitHub = gitHub;
        _copyFileToContainer = copyFileToContainer;
    }

    [Function("CopyFileToContainer")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "CopyFileToContainer")] HttpRequestData req)
        => ExecuteWithFileAsync(req, _logger, _gitHub, "CopyFileToContainer", _copyFileToContainer.CopyFileToContainerAsync);
}
