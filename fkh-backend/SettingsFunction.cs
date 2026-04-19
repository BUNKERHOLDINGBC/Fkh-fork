using Fkh.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace Fkh;

public class GetSettingsFunction : FunctionBase
{
    private readonly ILogger<GetSettingsFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhUserSettings _userSettings;

    public GetSettingsFunction(ILogger<GetSettingsFunction> logger, GitHubAuthService gitHub, FkhUserSettings userSettings)
    {
        _logger = logger;
        _gitHub = gitHub;
        _userSettings = userSettings;
    }

    [Function("GetSettings")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "GetSettings")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "GetSettings", _userSettings.GetSettingsAsync);
}

public class SetSettingsFunction : FunctionBase
{
    private readonly ILogger<SetSettingsFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhUserSettings _userSettings;

    public SetSettingsFunction(ILogger<SetSettingsFunction> logger, GitHubAuthService gitHub, FkhUserSettings userSettings)
    {
        _logger = logger;
        _gitHub = gitHub;
        _userSettings = userSettings;
    }

    [Function("SetSettings")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "SetSettings")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "SetSettings", _userSettings.SetSettingsAsync);
}

public class ClearSettingsFunction : FunctionBase
{
    private readonly ILogger<ClearSettingsFunction> _logger;
    private readonly GitHubAuthService _gitHub;
    private readonly FkhUserSettings _userSettings;

    public ClearSettingsFunction(ILogger<ClearSettingsFunction> logger, GitHubAuthService gitHub, FkhUserSettings userSettings)
    {
        _logger = logger;
        _gitHub = gitHub;
        _userSettings = userSettings;
    }

    [Function("ClearSettings")]
    public Task<HttpResponseData> RunAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ClearSettings")] HttpRequestData req)
        => ExecuteAsync(req, _logger, _gitHub, "ClearSettings", _userSettings.ClearSettingsAsync);
}
