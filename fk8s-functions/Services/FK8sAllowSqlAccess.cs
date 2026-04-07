using k8s;
using k8s.Models;
using Microsoft.Extensions.Logging;

namespace FK8s.Services;

public class FK8sAllowSqlAccess : FK8sServiceBase
{
    public const string ServicePrefix = "mssql-ext-";
    public const string PolicyPrefix = "mssql-allow-ip-";
    public const string AutoRevokeAnnotation = "fk8s/sql-access-revoke-at";

    public FK8sAllowSqlAccess(ILogger<FK8sAllowSqlAccess> logger) : base(logger) { }

    public async Task<string> AllowSqlAccessAsync(Dictionary<string, string> parameters)
    {
        var githubUsername = parameters["_githubUsername"];
        var ip = parameters["ip"];
        var hours = parameters.TryGetValue("hours", out var h) && double.TryParse(h, out var parsed) && parsed > 0
            ? parsed
            : 2;

        var sanitizedUser = SanitizeAppName(githubUsername);
        var serviceName = $"{ServicePrefix}{sanitizedUser}";
        var policyName = $"{PolicyPrefix}{sanitizedUser}";
        var cidr = ip.Contains('/') ? ip : $"{ip}/32";
        var revokeAt = DateTimeOffset.UtcNow.AddHours(hours);

        Logger.LogInformation(
            "Allowing SQL access for user '{User}' from {Cidr} for {Hours}h (until {RevokeAt} UTC).",
            githubUsername, cidr, hours, revokeAt);

        var client = await GetKubernetesClientAsync();

        // ── Create or update LoadBalancer service ─────────────────────────────────
        var service = new V1Service
        {
            Metadata = new V1ObjectMeta
            {
                Name = serviceName,
                NamespaceProperty = Namespace,
                Labels = new Dictionary<string, string>
                {
                    ["app"] = "mssql",
                    ["fk8s/purpose"] = "sql-external-access",
                    ["fk8s/owner"] = sanitizedUser,
                },
                Annotations = new Dictionary<string, string>
                {
                    [AutoRevokeAnnotation] = revokeAt.UtcDateTime.ToString("o"),
                },
            },
            Spec = new V1ServiceSpec
            {
                Type = "LoadBalancer",
                ExternalTrafficPolicy = "Local",
                LoadBalancerSourceRanges = new List<string> { cidr },
                Selector = new Dictionary<string, string> { ["app"] = "mssql" },
                Ports = new List<V1ServicePort>
                {
                    new() { Protocol = "TCP", Port = 1433, TargetPort = 1433 },
                },
            },
        };

        try
        {
            await client.ReadNamespacedServiceAsync(serviceName, Namespace);
            await client.ReplaceNamespacedServiceAsync(service, serviceName, Namespace);
            Logger.LogInformation("Updated existing SQL access service '{Service}'.", serviceName);
        }
        catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            await client.CreateNamespacedServiceAsync(service, Namespace);
            Logger.LogInformation("Created SQL access service '{Service}'.", serviceName);
        }

        // ── Create or update NetworkPolicy ────────────────────────────────────────
        var policy = new V1NetworkPolicy
        {
            Metadata = new V1ObjectMeta
            {
                Name = policyName,
                NamespaceProperty = Namespace,
                Labels = new Dictionary<string, string>
                {
                    ["fk8s/purpose"] = "sql-external-access",
                    ["fk8s/owner"] = sanitizedUser,
                },
                Annotations = new Dictionary<string, string>
                {
                    [AutoRevokeAnnotation] = revokeAt.UtcDateTime.ToString("o"),
                },
            },
            Spec = new V1NetworkPolicySpec
            {
                PodSelector = new V1LabelSelector
                {
                    MatchLabels = new Dictionary<string, string> { ["app"] = "mssql" },
                },
                PolicyTypes = new List<string> { "Ingress" },
                Ingress = new List<V1NetworkPolicyIngressRule>
                {
                    new()
                    {
                        FromProperty = new List<V1NetworkPolicyPeer>
                        {
                            new() { IpBlock = new V1IPBlock { Cidr = cidr } },
                        },
                        Ports = new List<V1NetworkPolicyPort>
                        {
                            new() { Protocol = "TCP", Port = 1433 },
                        },
                    },
                },
            },
        };

        try
        {
            await client.ReadNamespacedNetworkPolicyAsync(policyName, Namespace);
            await client.ReplaceNamespacedNetworkPolicyAsync(policy, policyName, Namespace);
            Logger.LogInformation("Updated existing SQL access network policy '{Policy}'.", policyName);
        }
        catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            await client.CreateNamespacedNetworkPolicyAsync(policy, Namespace);
            Logger.LogInformation("Created SQL access network policy '{Policy}'.", policyName);
        }

        // ── Wait for external IP assignment ───────────────────────────────────────
        string? externalIp = null;
        for (var i = 0; i < 30; i++)
        {
            await Task.Delay(TimeSpan.FromSeconds(5));
            var svc = await client.ReadNamespacedServiceAsync(serviceName, Namespace);
            var ingress = svc.Status?.LoadBalancer?.Ingress?.FirstOrDefault();
            if (ingress is not null)
            {
                externalIp = ingress.Ip ?? ingress.Hostname;
                break;
            }
        }

        var endpoint = externalIp is not null ? $"{externalIp},1433" : "(pending — check service status)";

        return $"SQL access granted for user '{githubUsername}'.\n" +
               $"  Allowed IP: {cidr}\n" +
               $"  SQL Endpoint: {endpoint}\n" +
               $"  Auto-revoke: {revokeAt:yyyy-MM-dd HH:mm} UTC ({hours}h)";
    }

    public async Task<string> RevokeSqlAccessAsync(Dictionary<string, string> parameters)
    {
        var githubUsername = parameters["_githubUsername"];
        var sanitizedUser = SanitizeAppName(githubUsername);

        return await RevokeForUserAsync(sanitizedUser, githubUsername);
    }

    public async Task<string> RevokeForUserAsync(string sanitizedUser, string displayName)
    {
        var serviceName = $"{ServicePrefix}{sanitizedUser}";
        var policyName = $"{PolicyPrefix}{sanitizedUser}";

        Logger.LogInformation("Revoking SQL access for user '{User}'.", displayName);
        var client = await GetKubernetesClientAsync();

        var removed = new List<string>();

        try
        {
            await client.DeleteNamespacedServiceAsync(serviceName, Namespace);
            removed.Add($"Service '{serviceName}'");
        }
        catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Already gone
        }

        try
        {
            await client.DeleteNamespacedNetworkPolicyAsync(policyName, Namespace);
            removed.Add($"NetworkPolicy '{policyName}'");
        }
        catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Already gone
        }

        if (removed.Count == 0)
        {
            return $"No SQL access resources found for user '{displayName}'.";
        }

        Logger.LogInformation("Revoked SQL access for user '{User}': {Resources}", displayName, string.Join(", ", removed));
        return $"SQL access revoked for user '{displayName}'.\n  Removed: {string.Join(", ", removed)}";
    }

    public async Task CheckAndRevokeExpiredAccessAsync()
    {
        Logger.LogInformation("Checking for expired SQL access grants...");
        var client = await GetKubernetesClientAsync();

        var services = await client.ListNamespacedServiceAsync(Namespace, labelSelector: "fk8s/purpose=sql-external-access");
        var revoked = 0;

        foreach (var svc in services.Items)
        {
            if (svc.Metadata.Annotations == null ||
                !svc.Metadata.Annotations.TryGetValue(AutoRevokeAnnotation, out var revokeAtStr))
                continue;

            if (!DateTimeOffset.TryParse(revokeAtStr, out var revokeAt))
            {
                Logger.LogWarning("Invalid revoke annotation '{Value}' on service '{Service}'.", revokeAtStr, svc.Metadata.Name);
                continue;
            }

            if (DateTimeOffset.UtcNow >= revokeAt)
            {
                var owner = svc.Metadata.Labels != null && svc.Metadata.Labels.TryGetValue("fk8s/owner", out var o) ? o : "unknown";
                Logger.LogInformation("Auto-revoking expired SQL access for '{Owner}'.", owner);
                await RevokeForUserAsync(owner, owner);
                revoked++;
            }
        }

        Logger.LogInformation("SQL access revoke check complete. Revoked {Count} grant(s).", revoked);
    }
}
