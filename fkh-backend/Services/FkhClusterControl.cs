using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.ContainerService;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhClusterControl : FkhServiceBase
{
    public FkhClusterControl(ILogger<FkhClusterControl> logger) : base(logger) { }

    public async Task<object> StopClusterAsync(Dictionary<string, string> parameters)
    {
        var cluster = GetClusterResource();
        var data = (await cluster.GetAsync()).Value.Data;
        var powerState = data.PowerStateCode?.ToString();

        if (string.Equals(powerState, "Stopped", StringComparison.OrdinalIgnoreCase))
            return new { Message = "Cluster is already stopped.", PowerState = "Stopped" };

        Logger.LogInformation("Stopping AKS cluster {Cluster} in resource group {RG}...", ClusterName, ResourceGroup);
        await cluster.StopAsync(Azure.WaitUntil.Completed);
        Logger.LogInformation("AKS cluster {Cluster} stopped.", ClusterName);

        return new { Message = "Cluster stopped.", PowerState = "Stopped" };
    }

    public async Task<object> StartClusterAsync(Dictionary<string, string> parameters)
    {
        var cluster = GetClusterResource();
        var data = (await cluster.GetAsync()).Value.Data;
        var powerState = data.PowerStateCode?.ToString();

        if (string.Equals(powerState, "Running", StringComparison.OrdinalIgnoreCase))
            return new { Message = "Cluster is already running.", PowerState = "Running" };

        Logger.LogInformation("Starting AKS cluster {Cluster} in resource group {RG}...", ClusterName, ResourceGroup);
        await cluster.StartAsync(Azure.WaitUntil.Completed);
        Logger.LogInformation("AKS cluster {Cluster} started.", ClusterName);

        return new { Message = "Cluster started.", PowerState = "Running" };
    }

    private ContainerServiceManagedClusterResource GetClusterResource()
    {
#pragma warning disable CS0618
        var credential = new ManagedIdentityCredential(ClientId);
#pragma warning restore CS0618
        var armClient = new ArmClient(credential);
        var aksId = ContainerServiceManagedClusterResource
            .CreateResourceIdentifier(SubscriptionId, ResourceGroup, ClusterName);
        return armClient.GetContainerServiceManagedClusterResource(aksId);
    }
}
