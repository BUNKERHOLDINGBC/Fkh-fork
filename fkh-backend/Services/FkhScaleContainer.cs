using k8s;
using k8s.Models;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhScaleContainer : FkhServiceBase
{
    public FkhScaleContainer(ILogger<FkhScaleContainer> logger) : base(logger) { }

    public async Task<string> StopContainerAsync(Dictionary<string, string> parameters)
    {
        var result = await ScaleAsync(parameters, 0);
        // Clear auto-stop annotation when manually stopping
        var name = parameters["name"];
        var githubUsername = parameters["_githubUsername"];
        var appName = SanitizeAppName($"{githubUsername}-{name}");
        var deploymentName = $"{appName}-deployment";
        var client = await GetKubernetesClientAsync();
        await ClearAutoStopAnnotationAsync(client, deploymentName);
        return result;
    }

    public async Task<string> StartContainerAsync(Dictionary<string, string> parameters)
    {
        // Ensure a Windows node with healthy CNS is available before scaling up
        var name = parameters["name"];
        var githubUsername = parameters["_githubUsername"];
        var appName = SanitizeAppName($"{githubUsername}-{name}");
        var deploymentName = $"{appName}-deployment";

        var client = await GetKubernetesClientAsync();

        // Check if the existing deployment targets spot nodes
        var deployment = await client.ReadNamespacedDeploymentAsync(deploymentName, Namespace);
        var useSpot = deployment.Spec.Template.Spec.NodeSelector != null
            && deployment.Spec.Template.Spec.NodeSelector.TryGetValue("kubernetes.azure.com/scalesetpriority", out var priority)
            && priority == "spot";

        await EnsureWindowsNodeReadyAsync(client, useSpot);
        await CleanupPlaceholderPodAsync(client, useSpot);

        var result = await ScaleAsync(parameters, 1);
        var autoStopInfo = "";

        parameters.TryGetValue("autostop", out var autoStopValue);
        parameters.TryGetValue("_timezone", out var autoStopTz);
        var autoStop = ParseAutoStop(autoStopValue, autoStopTz);
        if (autoStop is not null)
        {
            await SetAutoStopAnnotationAsync(client, deploymentName, autoStop.Value.StopAt);
            autoStopInfo = $"\n  AutoStop: {autoStop.Value.StopAt:yyyy-MM-dd HH:mm} UTC ({autoStop.Value.Description})";
        }

        return result + autoStopInfo;
    }

    public async Task<string> ExtendAutoStopAsync(Dictionary<string, string> parameters)
    {
        var name = parameters["name"];
        var githubUsername = parameters["_githubUsername"];
        var appName = SanitizeAppName($"{githubUsername}-{name}");
        var deploymentName = $"{appName}-deployment";

        var client = await GetKubernetesClientAsync();
        var deployment = await client.ReadNamespacedDeploymentAsync(deploymentName, Namespace);

        if (deployment.Metadata.Annotations == null
            || !deployment.Metadata.Annotations.TryGetValue(AutoStopAnnotation, out var stopAtStr)
            || !DateTimeOffset.TryParse(stopAtStr, out var currentStopAt))
        {
            // No auto-stop set — set one 2 hours from now
            currentStopAt = DateTimeOffset.UtcNow;
        }

        // If the current stop time is in the past, extend from now instead
        if (currentStopAt < DateTimeOffset.UtcNow)
            currentStopAt = DateTimeOffset.UtcNow;

        var newStopAt = currentStopAt.AddHours(2);
        await SetAutoStopAnnotationAsync(client, deploymentName, newStopAt);

        return $"Extended auto-stop for '{appName}'.\n  AutoStop: {newStopAt:yyyy-MM-dd HH:mm} UTC";
    }

    private async Task<string> ScaleAsync(Dictionary<string, string> parameters, int replicas)
    {
        var name = parameters["name"];
        var githubUsername = parameters["_githubUsername"];
        var appName = SanitizeAppName($"{githubUsername}-{name}");
        var deploymentName = $"{appName}-deployment";

        Logger.LogInformation("Scaling deployment '{Deployment}' to {Replicas} replicas...", deploymentName, replicas);
        var client = await GetKubernetesClientAsync();

        var deployment = await client.ReadNamespacedDeploymentAsync(deploymentName, Namespace);
        deployment.Spec.Replicas = replicas;
        await client.ReplaceNamespacedDeploymentAsync(deployment, deploymentName, Namespace);

        var action = replicas == 0 ? "Stopped" : "Started";
        Logger.LogInformation("{Action} deployment '{Deployment}'.", action, deploymentName);
        return $"{action} container '{appName}'.\n  Deployment: {deploymentName}\n  Replicas: {replicas}";
    }
}
