using FK8s.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace FK8s;

public class CreateNodeFunction : FunctionBase
{
    private readonly ILogger<CreateNodeFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FK8sService _aks;

    public CreateNodeFunction(ILogger<CreateNodeFunction> logger, GitHubAuthService gitHub, FK8sService aks)
    {
        _logger = logger;
        _gitHub = gitHub;
        _aks = aks;
    }

    [Function("CreateNode")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "CreateNode")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "CreateNode", _aks.CreateNodeAsync);
}
