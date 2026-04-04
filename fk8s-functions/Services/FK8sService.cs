using Microsoft.Extensions.Logging;

namespace FK8s.Services;

public class FK8sService
{
    private readonly string _resourceGroup;
    private readonly string _clusterName;
    private readonly string _subscriptionId;
    private readonly string _acrName;
    private readonly string _clientId;
    private readonly string _baseImage;
    private readonly ILogger<FK8sService> _logger;
    private readonly AcrBuildService _acrBuild;

    public FK8sService(ILogger<FK8sService> logger, AcrBuildService acrBuild)
    {
        _logger = logger;
        _acrBuild = acrBuild;
        _subscriptionId = Environment.GetEnvironmentVariable("AKS_SUBSCRIPTION_ID")
            ?? throw new InvalidOperationException("AKS_SUBSCRIPTION_ID is not configured.");
        _resourceGroup = Environment.GetEnvironmentVariable("AKS_RESOURCE_GROUP")
            ?? throw new InvalidOperationException("AKS_RESOURCE_GROUP is not configured.");
        _clusterName = Environment.GetEnvironmentVariable("AKS_CLUSTER_NAME")
            ?? throw new InvalidOperationException("AKS_CLUSTER_NAME is not configured.");
        _acrName = Environment.GetEnvironmentVariable("ACR_NAME")
            ?? throw new InvalidOperationException("ACR_NAME is not configured.");
        _clientId = Environment.GetEnvironmentVariable("AZURE_CLIENT_ID")
            ?? throw new InvalidOperationException("AZURE_CLIENT_ID is not configured.");
        _baseImage = Environment.GetEnvironmentVariable("BASE_IMAGE")
            ?? throw new InvalidOperationException("BASE_IMAGE is not configured.");
    }

    public async Task<string> CreateNodeAsync(Dictionary<string, string> parameters)
    {
        var artifactUrl = parameters["artifactUrl"];
        var adminUsername = parameters["adminUsername"];
        var adminPassword = parameters["adminPassword"];

        var appUri = new Uri(artifactUrl);
        var imageName = $"{_acrName}.azurecr.io/fk8s:{appUri.AbsolutePath.ToLowerInvariant().Replace('/', '-').TrimStart('-')}";

        _logger.LogInformation("Checking if image {Image} already exists...", imageName);

        if (await _acrBuild.ImageExistsAsync(_acrName, imageName))
        {
            _logger.LogInformation("Image {Image} already exists, skipping build.", imageName);
            return $"Image {imageName} already exists in {_acrName}. Deploy to AKS pending.";
        }

        _logger.LogInformation("Submitting ACR task for image {Image}...", imageName);

        await _acrBuild.BuildAndPushAsync(
            _subscriptionId, _resourceGroup, _acrName, imageName, _baseImage, artifactUrl);

        return $"Image {imageName} built and pushed to {_acrName}. Deploy to AKS pending.";
    }

    public Task<string> RemoveNodeAsync(Dictionary<string, string> parameters)
    {
        var nodeUrl = parameters["NodeUrl"];

        return Task.FromResult("Hello World");
    }
}
