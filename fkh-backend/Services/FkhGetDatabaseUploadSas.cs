using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhGetDatabaseUploadSas : FkhServiceBase
{
    public FkhGetDatabaseUploadSas(ILogger<FkhGetDatabaseUploadSas> logger) : base(logger) { }

    public async Task<object> GetUploadSasAsync(Dictionary<string, string> parameters)
    {
        var containerName = parameters.TryGetValue("containerName", out var cn) ? cn : "databases";

#pragma warning disable CS0618
        var credential = new ManagedIdentityCredential(ClientId);
#pragma warning restore CS0618
        var blobServiceClient = new BlobServiceClient(
            new Uri($"https://{DbsStorageAccountName}.blob.core.windows.net"), credential);

        // Ensure the blob container exists
        var blobContainerClient = blobServiceClient.GetBlobContainerClient(containerName);
        await blobContainerClient.CreateIfNotExistsAsync();

        // Generate a user-delegation SAS valid for 60 minutes with read, write, list permissions
        var delegationKey = await blobServiceClient.GetUserDelegationKeyAsync(
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(60));

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = containerName,
            Resource = "c", // container-level SAS
            ExpiresOn = DateTimeOffset.UtcNow.AddMinutes(60)
        };
        sasBuilder.SetPermissions(BlobSasPermissions.Read | BlobSasPermissions.Write | BlobSasPermissions.List);

        var sasToken = sasBuilder.ToSasQueryParameters(delegationKey, blobServiceClient.AccountName);

        var sasUrl = $"https://{DbsStorageAccountName}.blob.core.windows.net/{containerName}?{sasToken}";

        Logger.LogInformation("Generated 60-minute upload SAS for container '{ContainerName}' (admin: {Username})",
            containerName, parameters.GetValueOrDefault("_githubUsername", "unknown"));

        return new
        {
            SasUrl = sasUrl,
            ContainerName = containerName,
            ExpiresInMinutes = 60,
            StorageAccountName = DbsStorageAccountName
        };
    }
}
