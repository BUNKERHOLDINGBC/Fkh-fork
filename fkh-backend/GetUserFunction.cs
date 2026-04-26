using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class GetUserFunction : FunctionBase
{
    private readonly ILogger<GetUserFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhGetUser _getUser;

    public GetUserFunction(ILogger<GetUserFunction> logger, GitHubAuthService gitHub, FkhGetUser getUser)
    {
        _logger = logger;
        _gitHub = gitHub;
        _getUser = getUser;
    }

    [Function("GetUser")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "GetUser")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "GetUser", _getUser.GetUserAsync);
}
