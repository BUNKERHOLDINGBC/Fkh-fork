using k8s;
using Microsoft.Extensions.Logging;

namespace Fkh.Services;

public class FkhCopyFileFromContainer : FkhServiceBase
{
    public FkhCopyFileFromContainer(ILogger<FkhCopyFileFromContainer> logger) : base(logger) { }

    public async Task<object> CopyFileFromContainerAsync(Dictionary<string, string> parameters)
    {
        var githubUsername = parameters["_githubUsername"];
        var appName = ResolveAppName(parameters);

        if (!parameters.TryGetValue("containerFilename", out var filename) || string.IsNullOrWhiteSpace(filename))
            throw new InvalidOperationException("Missing required parameter 'containerFilename'.");

        Logger.LogInformation(
            "User '{User}' downloading file '{File}' from container '{Container}'.",
            githubUsername, filename, appName);

        var client = await GetKubernetesClientAsync();

        var pods = await client.ListNamespacedPodAsync(Namespace, labelSelector: $"app={appName}");
        var pod = pods.Items.FirstOrDefault(p => p.Status?.Phase == "Running")
            ?? throw new InvalidOperationException($"No running container found for '{appName}'. Make sure the container is started and ready.");

        var podName = pod.Metadata.Name;
        var containerName = pod.Spec.Containers[0].Name;

        // Resolve wildcards if present
        if (filename.Contains('*'))
        {
            var resolveScript = $"(Resolve-Path '{filename}' -ErrorAction Stop).Path";
            var resolveResult = await ExecInPodPwshAsync(client, podName, containerName, resolveScript);
            var resolved = resolveResult.Stdout.Trim().Split('\n')[0].Trim();
            if (string.IsNullOrWhiteSpace(resolved))
                throw new InvalidOperationException($"No file matched wildcard: {filename}");
            filename = resolved;
        }

        // Read the file as base64 using chunked streaming through pwsh
        var script = @"
$f = [IO.File]::OpenRead('" + filename + @"')
try {
    $buf = New-Object byte[] 3145728
    while (($n = $f.Read($buf, 0, $buf.Length)) -gt 0) {
        if ($n -lt $buf.Length) {
            $chunk = New-Object byte[] $n
            [Array]::Copy($buf, $chunk, $n)
            [Console]::WriteLine([Convert]::ToBase64String($chunk))
        } else {
            [Console]::WriteLine([Convert]::ToBase64String($buf))
        }
    }
} finally {
    $f.Close()
}
";

        var result = await ExecInPodPwshAsync(client, podName, containerName, script);

        if (!string.IsNullOrWhiteSpace(result.Stderr))
        {
            throw new InvalidOperationException($"Failed to read file '{filename}' from container '{appName}':\n{result.Stderr.TrimEnd()}");
        }

        // Reassemble base64 chunks into a single base64 string
        var lines = result.Stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        using var ms = new MemoryStream();
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0) continue;
            var bytes = Convert.FromBase64String(trimmed);
            ms.Write(bytes, 0, bytes.Length);
        }

        var fileBase64 = Convert.ToBase64String(ms.ToArray());

        return new
        {
            Container = appName,
            FileName = Path.GetFileName(filename),
            FileContent = fileBase64,
        };
    }

    private async Task<ExecResult> ExecInPodPwshAsync(Kubernetes client, string podName, string containerName, string psScript)
    {
        var command = new[] { "pwsh", "-NoProfile", "-Command", psScript };
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
            Logger.LogWarning("BC pod pwsh exec stderr: {StdErr}", stderr);
        }

        return new ExecResult(stdoutTask.Result, stderr);
    }
}
