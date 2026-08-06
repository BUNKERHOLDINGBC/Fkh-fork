using Azure.Storage.Sas;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhGetDatabaseDownloadSas : FkhBlobContainerSasService
{
    public FkhGetDatabaseDownloadSas(ILogger<FkhGetDatabaseDownloadSas> logger) : base(logger) { }

    public async Task<object> GetDownloadSasAsync(Dictionary<string, string> parameters)
    {
        return await GetContainerSasAsync(
            "databases",
            BlobSasPermissions.Read | BlobSasPermissions.List,
            createIfNotExists: false,
            accessDescription: "read-only download",
            parameters);
    }
}
