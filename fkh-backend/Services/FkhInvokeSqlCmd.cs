using System.Security.Cryptography;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhInvokeSqlCmd : FkhServiceBase
{
    public FkhInvokeSqlCmd(ILogger<FkhInvokeSqlCmd> logger) : base(logger) { }

    public async Task<object> InvokeSqlCmdAsync(Dictionary<string, string> parameters)
    {
        var githubUsername = parameters["_githubUsername"];
        var containerName = parameters.TryGetValue("name", out var n) ? n : null;
        var query = parameters["query"];
        var isAdmin = parameters.TryGetValue("_isAdmin", out var adminVal)
            && string.Equals(adminVal, "true", StringComparison.OrdinalIgnoreCase);

        var databaseName = ResolveAppName(parameters);

        Logger.LogInformation(
            "User '{User}' invoking SQL on database '{Database}' (admin={IsAdmin}).",
            githubUsername, databaseName, isAdmin);

        var client = await GetKubernetesClientAsync();
        var podName = await FindMssqlPodAsync(client);

        // Verify the database exists
        var checkScript = $"{SqlcmdPath} -S localhost -U sa -P \"$MSSQL_SA_PASSWORD\" -C -h -1 -W " +
            $"-Q \"SELECT name FROM sys.databases WHERE name = '{databaseName.Replace("'", "''")}'\"";
        var checkResult = await ExecInMssqlPodAsync(client, podName, checkScript);
        var dbExists = checkResult.Stdout
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(l => string.Equals(l, databaseName, StringComparison.OrdinalIgnoreCase));

        if (!dbExists)
        {
            return new { Database = databaseName, Message = "Database not found. Make sure the container name is correct." };
        }

        var safeSql = query.Replace("\"", "\\\"").Replace("$", "\\$");

        if (isAdmin)
        {
            // Admins execute as sa with full cross-database access
            var execScript = $"{SqlcmdPath} -S localhost -U sa -P \"$MSSQL_SA_PASSWORD\" -C -d \"{databaseName}\" " +
                $"-Q \"{safeSql}\"";
            var result = await ExecInMssqlPodAsync(client, podName, execScript);

            return new
            {
                Database = databaseName,
                Output = result.Stdout.TrimEnd(),
                Stderr = string.IsNullOrWhiteSpace(result.Stderr) ? null : result.Stderr.TrimEnd(),
            };
        }

        // Non-admin: create a temporary SQL login scoped to the user's database only
        var tempLogin = $"fkh_tmp_{githubUsername}".Replace("-", "_");
        var tempPassword = GenerateTempPassword();
        var safeDbName = databaseName.Replace("'", "''");
        var safeLogin = tempLogin.Replace("'", "''");
        var safePassword = tempPassword.Replace("'", "''");

        var createLoginScript = $"{SqlcmdPath} -S localhost -U sa -P \"$MSSQL_SA_PASSWORD\" -C " +
            $"-Q \"" +
            $"IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '{safeLogin}') " +
            $"DROP LOGIN [{tempLogin}]; " +
            $"CREATE LOGIN [{tempLogin}] WITH PASSWORD = '{safePassword}', DEFAULT_DATABASE = [{databaseName}], CHECK_POLICY = OFF; " +
            $"USE [{databaseName}]; " +
            $"CREATE USER [{tempLogin}] FOR LOGIN [{tempLogin}]; " +
            $"ALTER ROLE db_owner ADD MEMBER [{tempLogin}]; " +
            $"DENY VIEW ANY DATABASE TO [{tempLogin}];\"";

        try
        {
            var createResult = await ExecInMssqlPodAsync(client, podName, createLoginScript);
            if (!string.IsNullOrWhiteSpace(createResult.Stderr) && createResult.Stderr.Contains("Msg "))
            {
                Logger.LogError("Failed to create temp login: {StdErr}", createResult.Stderr);
                return new { Database = databaseName, Message = "Failed to set up temporary database access." };
            }

            // Execute the user's SQL with the restricted login
            var execScript = $"{SqlcmdPath} -S localhost -U \"{tempLogin}\" -P \"{safePassword}\" -C -d \"{databaseName}\" " +
                $"-Q \"{safeSql}\"";
            var result = await ExecInMssqlPodAsync(client, podName, execScript);

            return new
            {
                Database = databaseName,
                Output = result.Stdout.TrimEnd(),
                Stderr = string.IsNullOrWhiteSpace(result.Stderr) ? null : result.Stderr.TrimEnd(),
            };
        }
        finally
        {
            // Always clean up the temporary login
            var dropScript = $"{SqlcmdPath} -S localhost -U sa -P \"$MSSQL_SA_PASSWORD\" -C " +
                $"-Q \"" +
                $"USE [{databaseName}]; " +
                $"IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '{safeLogin}') " +
                $"DROP USER [{tempLogin}]; " +
                $"IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '{safeLogin}') " +
                $"DROP LOGIN [{tempLogin}];\"";
            try
            {
                await ExecInMssqlPodAsync(client, podName, dropScript);
            }
            catch (Exception ex)
            {
                Logger.LogWarning(ex, "Failed to clean up temp login '{Login}'.", tempLogin);
            }
        }
    }

    private static string GenerateTempPassword()
    {
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#%^&*";
        return string.Create(32, chars, (span, state) =>
        {
            var bytes = RandomNumberGenerator.GetBytes(span.Length);
            for (int i = 0; i < span.Length; i++)
                span[i] = state[bytes[i] % state.Length];
        });
    }
}
