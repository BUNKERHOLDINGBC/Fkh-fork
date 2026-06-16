using k8s;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhGetVersion : FkhServiceBase
{
    public FkhGetVersion(ILogger<FkhGetVersion> logger) : base(logger) { }

    public async Task<object> GetVersionAsync(Dictionary<string, string> parameters)
    {
        var backendVersion = Environment.GetEnvironmentVariable("FKH_VERSION");
        string? clusterVersion = null;

        try
        {
            var client = await GetKubernetesClientAsync();
            var configMap = await client.CoreV1.ReadNamespacedConfigMapAsync("fkh-version", Namespace);
            if (configMap?.Data is not null)
            {
                configMap.Data.TryGetValue("version", out clusterVersion);
            }
        }
        catch (Exception ex)
        {
            Logger.LogDebug(ex, "Failed to read fkh-version ConfigMap");
        }

        return new
        {
            BackendVersion = FormatVersion(backendVersion),
            ClusterVersion = FormatVersion(clusterVersion),
        };
    }

    private static string FormatVersion(string? version)
    {
        if (string.IsNullOrEmpty(version)) return "Not available";
        if (version.StartsWith('v') && Version.TryParse(version[1..], out var parsed))
            return parsed.ToString();
        return version;
    }
}
