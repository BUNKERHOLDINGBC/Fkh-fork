using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class RemoveImageFunction : FunctionBase
{
    private readonly ILogger<RemoveImageFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhRemoveImage _removeImage;

    public RemoveImageFunction(ILogger<RemoveImageFunction> logger, GitHubAuthService gitHub, FkhRemoveImage removeImage)
    {
        _logger = logger;
        _gitHub = gitHub;
        _removeImage = removeImage;
    }

    [Function("RemoveImage")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "RemoveImage")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "RemoveImage", _removeImage.RemoveImageAsync);
}
