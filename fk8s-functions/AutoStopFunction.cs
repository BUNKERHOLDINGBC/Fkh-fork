using FK8s.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace FK8s;

public class AutoStopFunction
{
    private readonly ILogger<AutoStopFunction> _logger;
    private readonly FK8sAutoStop _autoStop;
    private readonly FK8sAllowSqlAccess _sqlAccess;

    public AutoStopFunction(ILogger<AutoStopFunction> logger, FK8sAutoStop autoStop, FK8sAllowSqlAccess sqlAccess)
    {
        _logger = logger;
        _autoStop = autoStop;
        _sqlAccess = sqlAccess;
    }

    [Function("AutoStop")]
    public async Task RunAsync([TimerTrigger("0 */30 * * * *")] TimerInfo timerInfo)
    {
        try
        {
            await _autoStop.CheckAndStopExpiredNodesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Auto-stop check failed.");
        }

        try
        {
            await _sqlAccess.CheckAndRevokeExpiredAccessAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SQL access auto-revoke check failed.");
        }
    }
}
