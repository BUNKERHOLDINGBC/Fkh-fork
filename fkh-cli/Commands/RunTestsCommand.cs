using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

sealed class RunTestsCommand : ClientCommand
{
    private static readonly HashSet<string> ParameterNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "name", "tenant", "extensionId", "appName", "output"
    };
    private static readonly Regex TenantPattern = new("^[A-Za-z0-9][A-Za-z0-9-]{0,127}$", RegexOptions.CultureInvariant);

    public override string Name => "RunTests";
    public override string Description => "Runs tests from a published test app inside a Business Central container.";
    public override bool SupportsNowait => false;
    public override List<ClientCommandParameter> Parameters =>
    [
        new() { Name = "name", Type = "string", Description = "Name of the container.", Required = true },
        new() { Name = "tenant", Type = "string", Description = "Business Central tenant. Default: default", Required = false },
        new() { Name = "extensionId", Type = "string", Description = "ID of the published test app.", Required = true },
        new() { Name = "appName", Type = "string", Description = "Optional test app name used for validation and reporting.", Required = false },
        new() { Name = "output", Type = "string", Description = "Local destination for JUnit XML.", Required = true }
    ];

    public override async Task<int> ExecuteAsync(string[] args, CliSettings settings, bool asJson)
    {
        RunTestsRequest request;
        try
        {
            request = ValidateParameters(args);
        }
        catch (InvalidOperationException ex)
        {
            Console.Error.WriteLine($"{Ansi.Red}{ex.Message}{Ansi.Reset}");
            return 2;
        }

        if (File.Exists(request.Output))
            File.Delete(request.Output);

        var backendUrl = ValidateBackendUrl(settings.BackendUrl);
        if (backendUrl is null)
            return 2;

        var parameters = ParseClientArgs(args);
        var tokenProvider = CreateTokenProvider(parameters, settings);
        using var httpClient = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };

        try
        {
            while (true)
            {
                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{backendUrl}/RunTests");
                httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await tokenProvider.GetTokenAsync());
                AddProtocolHeaders(httpRequest);
                httpRequest.Content = new StringContent(
                    JsonSerializer.Serialize(new FunctionInvokeRequest
                    {
                        Parameters = request.ToParameters()
                    }),
                    Encoding.UTF8,
                    "application/json");

                using var response = await httpClient.SendAsync(httpRequest);
                var body = await response.Content.ReadAsStringAsync();

                if (response.StatusCode == HttpStatusCode.Accepted)
                {
                    var retrySeconds = GetRetrySeconds(response);
                    if (!asJson)
                        Console.Write(".");
                    await Task.Delay(TimeSpan.FromSeconds(retrySeconds));
                    continue;
                }

                if (!response.IsSuccessStatusCode)
                {
                    Console.Error.WriteLine($"{Ansi.Red}Test infrastructure failed ({(int)response.StatusCode}): {GetErrorMessage(body)}{Ansi.Reset}");
                    return 2;
                }

                var result = JsonSerializer.Deserialize<RunTestsResponse>(body, JsonOptions);
                if (result is null)
                {
                    Console.Error.WriteLine($"{Ansi.Red}Backend returned an empty test result.{Ansi.Reset}");
                    return 2;
                }

                var exitCode = MaterializeResult(result, request.Output);
                WriteSummary(result, asJson);
                return exitCode;
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            Console.Error.WriteLine($"{Ansi.Red}Test infrastructure failed: {ex.Message}{Ansi.Reset}");
            return 2;
        }
    }

    internal static RunTestsRequest ValidateParameters(string[] args)
    {
        if (args.Any(argument => string.Equals(argument, "--nowait", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("--nowait is not supported by runtests because JUnit must be materialized before the command returns.");

        var parameters = ParseClientArgs(args);
        var unknownParameters = parameters.Keys.Where(key => !ParameterNames.Contains(key)).ToList();
        if (unknownParameters.Count > 0)
            throw new InvalidOperationException($"Unknown parameters for runtests: {string.Join(", ", unknownParameters)}.");

        var name = GetRequired(parameters, "name");
        var extensionId = GetRequired(parameters, "extensionId");
        var output = GetRequired(parameters, "output");

        if (!name.All(character => char.IsLetterOrDigit(character) || character == '-'))
            throw new InvalidOperationException("--name may only contain letters, digits, and hyphens.");

        if (!Guid.TryParse(extensionId, out var parsedExtensionId) || parsedExtensionId == Guid.Empty)
            throw new InvalidOperationException("--extensionId must be a non-empty GUID.");

        var tenant = parameters.TryGetValue("tenant", out var tenantValue)
            ? tenantValue
            : "default";
        if (!TenantPattern.IsMatch(tenant))
            throw new InvalidOperationException("--tenant may only contain letters, digits, and hyphens.");

        parameters.TryGetValue("appName", out var appName);
        if (appName?.IndexOfAny(['\r', '\n']) >= 0 || appName?.Length > 250)
            throw new InvalidOperationException("--appName is invalid.");

        return new RunTestsRequest(name, tenant, parsedExtensionId.ToString(), appName, output);
    }

    internal static int MaterializeResult(RunTestsResponse result, string outputPath)
    {
        if (string.Equals(result.Outcome, "infrastructureFailure", StringComparison.OrdinalIgnoreCase))
            return 2;

        if (string.IsNullOrWhiteSpace(result.JunitBase64))
            return 2;

        byte[] junitBytes;
        bool junitFailed;
        try
        {
            junitBytes = Convert.FromBase64String(result.JunitBase64);
            junitFailed = ValidateJUnit(junitBytes);
        }
        catch (Exception ex) when (ex is FormatException or XmlException or InvalidOperationException)
        {
            return 2;
        }

        var expectedFailure = result.Outcome.ToLowerInvariant() switch
        {
            "passed" => false,
            "failed" => true,
            _ => (bool?)null
        };
        if (expectedFailure is null || expectedFailure.Value != junitFailed)
            return 2;

        var directory = Path.GetDirectoryName(Path.GetFullPath(outputPath));
        if (!string.IsNullOrWhiteSpace(directory))
            Directory.CreateDirectory(directory);

        var tempPath = $"{outputPath}.{Guid.NewGuid():N}.tmp";
        try
        {
            File.WriteAllBytes(tempPath, junitBytes);
            File.Move(tempPath, outputPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(tempPath))
                File.Delete(tempPath);
        }

        return result.Outcome.ToLowerInvariant() switch
        {
            "passed" => 0,
            "failed" => 1,
            _ => 2
        };
    }

    private static bool ValidateJUnit(byte[] junitBytes)
    {
        if (junitBytes.Length == 0)
            throw new InvalidOperationException("JUnit is empty.");

        using var stream = new MemoryStream(junitBytes, writable: false);
        using var reader = XmlReader.Create(stream, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit });
        var document = XDocument.Load(reader);
        var root = document.Root;
        if (root is null || root.Name.LocalName is not ("testsuite" or "testsuites"))
            throw new InvalidOperationException("JUnit root element is invalid.");

        var testCases = root.DescendantsAndSelf()
            .Where(element => element.Name.LocalName == "testcase")
            .ToList();
        if (testCases.Count == 0)
            throw new InvalidOperationException("JUnit contains no tests.");

        return testCases.Any(testCase => testCase.Elements().Any(
            element => element.Name.LocalName is "failure" or "error"));
    }

    private static string GetRequired(Dictionary<string, string> parameters, string name)
    {
        if (!parameters.TryGetValue(name, out var value) || string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException($"Missing required parameter --{name}");
        return value;
    }

    private static int GetRetrySeconds(HttpResponseMessage response)
    {
        if (response.Headers.TryGetValues("Retry-After", out var values)
            && int.TryParse(values.FirstOrDefault(), out var retrySeconds)
            && retrySeconds > 0)
            return retrySeconds;
        return 5;
    }

    private static string GetErrorMessage(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("message", out var message)
                && message.ValueKind == JsonValueKind.String)
                return message.GetString() ?? "Unknown backend error.";
        }
        catch (JsonException)
        {
        }
        return "The backend rejected the test request.";
    }

    private static void WriteSummary(RunTestsResponse result, bool asJson)
    {
        if (asJson)
        {
            Console.WriteLine(JsonSerializer.Serialize(new
            {
                result.Outcome,
                result.Tests,
                result.Failures,
                result.Errors,
                result.Skipped,
                result.DurationSeconds,
                result.Log
            }));
            return;
        }

        foreach (var line in result.Log ?? [])
            Console.WriteLine(line);
        Console.WriteLine($"Tests: {result.Tests}, Failures: {result.Failures}, Errors: {result.Errors}, Skipped: {result.Skipped}, Duration: {result.DurationSeconds:N3}s");
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    internal sealed record RunTestsRequest(string Name, string Tenant, string ExtensionId, string? AppName, string Output)
    {
        public Dictionary<string, string> ToParameters()
        {
            var parameters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["name"] = Name,
                ["tenant"] = Tenant,
                ["extensionId"] = ExtensionId
            };
            if (!string.IsNullOrWhiteSpace(AppName))
                parameters["appName"] = AppName;
            return parameters;
        }
    }

    internal sealed class RunTestsResponse
    {
        public string Outcome { get; init; } = "infrastructureFailure";
        public int Tests { get; init; }
        public int Failures { get; init; }
        public int Errors { get; init; }
        public int Skipped { get; init; }
        public double DurationSeconds { get; init; }
        public string? JunitBase64 { get; init; }
        public string[]? Log { get; init; }
    }
}