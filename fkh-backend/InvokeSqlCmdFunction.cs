using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class InvokeSqlCmdFunction : FunctionBase
{
    private readonly ILogger<InvokeSqlCmdFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhInvokeSqlCmd _invokeSqlCmd;

    public InvokeSqlCmdFunction(ILogger<InvokeSqlCmdFunction> logger, GitHubAuthService gitHub, FkhInvokeSqlCmd invokeSqlCmd)
    {
        _logger = logger;
        _gitHub = gitHub;
        _invokeSqlCmd = invokeSqlCmd;
    }

    [Function("InvokeSqlCmd")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "InvokeSqlCmd")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "InvokeSqlCmd", _invokeSqlCmd.InvokeSqlCmdAsync);
}
