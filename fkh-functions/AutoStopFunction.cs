using FKH.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace FKH;

public class AutoStopFunction
{
    private readonly ILogger<AutoStopFunction> _logger;
    private readonly FKHAutoStop _autoStop;
    private readonly FKHAllowSqlAccess _sqlAccess;

    public AutoStopFunction(ILogger<AutoStopFunction> logger, FKHAutoStop autoStop, FKHAllowSqlAccess sqlAccess)
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
