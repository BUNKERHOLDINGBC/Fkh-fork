using FKH.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace FKH;

public class ListNodesFunction : FunctionBase
{
    private readonly ILogger<ListNodesFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FKHListNodes _listNodes;

    public ListNodesFunction(ILogger<ListNodesFunction> logger, GitHubAuthService gitHub, FKHListNodes listNodes)
    {
        _logger = logger;
        _gitHub = gitHub;
        _listNodes = listNodes;
    }

    [Function("ListNodes")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ListNodes")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "ListNodes", _listNodes.ListNodesAsync);
}
