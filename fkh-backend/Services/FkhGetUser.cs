using k8s;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace Fkh.Services;

public class FkhGetUser : FkhServiceBase
{
    public FkhGetUser(ILogger<FkhGetUser> logger) : base(logger) { }

    public async Task<object> GetUserAsync(Dictionary<string, string> parameters)
    {
        var githubUsername = parameters["_githubUsername"];
        var appName = ResolveAppName(parameters);
        var tenant = parameters.TryGetValue("tenant", out var t) ? t : "default";
        var username = parameters["username"];

        Logger.LogInformation(
            "User '{User}' getting user info from container '{Container}' (tenant={Tenant}, username={Username}).",
            githubUsername, appName, tenant, username);

        var client = await GetKubernetesClientAsync();

        var pods = await client.ListNamespacedPodAsync(Namespace, labelSelector: $"app={appName}");
        var pod = pods.Items.FirstOrDefault(p => p.Status?.Phase == "Running")
            ?? throw new InvalidOperationException($"No running container found for '{appName}'. Make sure the container is started and ready.");

        var podName = pod.Metadata.Name;
        var containerName = pod.Spec.Containers[0].Name;

        // Escape single quotes in parameters for safe embedding in PowerShell script
        var escapedTenant = tenant.Replace("'", "''");
        var escapedUsername = username.Replace("'", "''");

        var script = $@"
$ErrorActionPreference = 'Stop'
. 'c:\run\prompt.ps1'
$user = Get-NAVServerUser -ServerInstance BC -Tenant '{escapedTenant}' |
    Where-Object {{ $_.UserName -eq '{escapedUsername}' }}
if (-not $user) {{
    @{{ Error = ""User '{escapedUsername}' not found in tenant '{escapedTenant}'"" }} | ConvertTo-Json -Depth 5
}} else {{
    $permSets = Get-NAVServerUserPermissionSet -ServerInstance BC -Tenant '{escapedTenant}' -Username $user.UserName |
        Select-Object PermissionSetID, CompanyName, Scope, AppID, PermissionSetName, AppName |
        ForEach-Object {{ $_ }}
    @{{
        UserName = $user.UserName
        FullName = $user.FullName
        State = [string]$user.State
        LicenseType = [string]$user.LicenseType
        AuthenticationEmail = $user.AuthenticationEmail
        ApplicationID = $user.ApplicationID.ToString()
        ProfileID = $user.ProfileID
        Company = $user.Company
        LanguageID = $user.LanguageID
        PermissionSets = @($permSets)
    }} | ConvertTo-Json -Depth 5
}}
";

        var result = await ExecInBcPodAsync(client, podName, containerName, script);

        if (!string.IsNullOrWhiteSpace(result.Stderr))
        {
            throw new InvalidOperationException($"Failed to get user info from container '{appName}':\n{result.Stderr.TrimEnd()}");
        }

        var jsonStart = result.Stdout.IndexOf('{');
        if (jsonStart < 0)
        {
            return new
            {
                Container = appName,
                Tenant = tenant,
                Message = "No output returned."
            };
        }

        var jsonText = result.Stdout[jsonStart..].TrimEnd();
        using var doc = JsonDocument.Parse(jsonText);

        if (doc.RootElement.TryGetProperty("Error", out var errorProp))
        {
            throw new InvalidOperationException(errorProp.GetString());
        }

        return new
        {
            Container = appName,
            Tenant = tenant,
            User = JsonSerializer.Deserialize<object>(doc.RootElement.GetRawText())
        };
    }

    private async Task<ExecResult> ExecInBcPodAsync(Kubernetes client, string podName, string containerName, string psScript)
    {
        var command = new[] { "powershell", "-NoProfile", "-Command", psScript };
        var ws = await client.WebSocketNamespacedPodExecAsync(
            podName, Namespace, command, containerName,
            stderr: true, stdin: false, stdout: true, tty: false);

        using var demux = new k8s.StreamDemuxer(ws);
        demux.Start();

        var stdoutStream = demux.GetStream(1, null);
        var stderrStream = demux.GetStream(2, null);

        using var stdoutReader = new StreamReader(stdoutStream);
        using var stderrReader = new StreamReader(stderrStream);

        var stdoutTask = stdoutReader.ReadToEndAsync();
        var stderrTask = stderrReader.ReadToEndAsync();
        await Task.WhenAll(stdoutTask, stderrTask);

        var stderr = stderrTask.Result;
        if (!string.IsNullOrWhiteSpace(stderr))
        {
            Logger.LogWarning("BC pod exec stderr: {StdErr}", stderr);
        }

        return new ExecResult(stdoutTask.Result, stderr);
    }
}
