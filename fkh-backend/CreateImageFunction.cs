using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class CreateImageFunction : FunctionBase
{
    private readonly ILogger<CreateImageFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhCreateImage _createImage;

    public CreateImageFunction(ILogger<CreateImageFunction> logger, GitHubAuthService gitHub, FkhCreateImage createImage)
    {
        _logger = logger;
        _gitHub = gitHub;
        _createImage = createImage;
    }

    [Function("CreateImage")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "CreateImage")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "CreateImage", _createImage.CreateImageAsync);
}
