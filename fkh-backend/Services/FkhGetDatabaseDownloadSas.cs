using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhGetDatabaseDownloadSas : FkhServiceBase
{
    public FkhGetDatabaseDownloadSas(ILogger<FkhGetDatabaseDownloadSas> logger) : base(logger) { }

    public async Task<object> GetDownloadSasAsync(Dictionary<string, string> parameters)
    {
#pragma warning disable CS0618
        var credential = new ManagedIdentityCredential(ClientId);
#pragma warning restore CS0618
        var blobServiceClient = new BlobServiceClient(
            new Uri($"https://{DbsStorageAccountName}.blob.core.windows.net"), credential);

        var blobContainerClient = blobServiceClient.GetBlobContainerClient("databases");

        // Generate a user-delegation SAS valid for 60 minutes with read and list permissions only
        var delegationKey = await blobServiceClient.GetUserDelegationKeyAsync(
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(60));

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = "databases",
            Resource = "c", // container-level SAS
            ExpiresOn = DateTimeOffset.UtcNow.AddMinutes(60)
        };
        sasBuilder.SetPermissions(BlobSasPermissions.Read | BlobSasPermissions.List);

        var sasToken = sasBuilder.ToSasQueryParameters(delegationKey, blobServiceClient.AccountName);

        var sasUrl = $"https://{DbsStorageAccountName}.blob.core.windows.net/databases?{sasToken}";

        Logger.LogInformation("Generated 60-minute read-only download SAS for databases container (user: {Username})",
            parameters.GetValueOrDefault("_githubUsername", "unknown"));

        return new
        {
            SasUrl = sasUrl,
            ContainerName = "databases",
            ExpiresInMinutes = 60,
            StorageAccountName = DbsStorageAccountName
        };
    }
}
