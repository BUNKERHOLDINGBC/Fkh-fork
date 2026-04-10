# Step 2: Install Prerequisites

## For Ops (deploying infrastructure)

Choose one of the two methods below. Both achieve the same result.

### Method 1: Deploy from your own machine

Install all of these:

```powershell
winget install Hashicorp.Terraform
winget install Microsoft.AzureCLI
winget install Microsoft.PowerShell
winget install Microsoft.DotNet.SDK.8
winget install GitHub.cli
winget install Kubernetes.kubectl
npm install -g azure-functions-core-tools@4
```

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Terraform | 1.7.0 | Provisions all Azure + GitHub infrastructure |
| Azure CLI | 2.59.0 | Authentication to Azure for Terraform |
| PowerShell | 7.4 | Deployment scripts |
| .NET SDK | 8.0 | Building the Fkh backend |
| GitHub CLI | latest | GitHub token management |
| kubectl | latest | Cluster diagnostics and troubleshooting (optional but recommended) |
| Azure Functions Core Tools | 4.x | Publishing the Function App |

Verify installations:

```powershell
terraform --version
az --version
pwsh --version
dotnet --version
gh --version
kubectl version --client
func --version
```

Then follow the rest of the setup guide and run `deploy.ps1` from [Step 6](Deploy.md).

### Method 2: Deploy from GitHub Actions (recommended)

No local tools required. The GitHub workflows handle everything.

**One-time Azure setup:**

1. Create an **App Registration** in Azure AD (Azure Portal → Microsoft Entra ID → App registrations → New registration).
2. Add a **federated credential** for GitHub Actions OIDC:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:<your-org>/<your-repo>:ref:refs/heads/main`
   - Audience: `api://AzureADTokenExchange`
3. Assign roles to the App Registration on the target Azure subscription:
   - **Contributor** — create and manage all resources
   - **User Access Administrator** — create role assignments for managed identities

**GitHub secrets to configure** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `AZURE_CLIENT_ID` | App Registration's Application (client) ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Target Azure subscription ID |
| `SQL_SA_PASSWORD` | SA password for the SQL Server in AKS (min 8 chars) |
| `GITHUB_APP_PRIVATE_KEY` | PEM-encoded private key of the GitHub App (from [Step 4](GitHubApp.md)) |
| `GH_PAT` | GitHub PAT with scopes: `admin:org`, `repo`, `read:org` |

**GitHub variable to configure** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|----------|-------|
| `TFVARS_FILE` | Path to your `.tfvars` file, e.g. `organizations/my-org.tfvars` |

**Deploy:**

- **Full deploy** — run the **Deploy** workflow from Actions → Deploy → Run workflow
- **Code-only update** — run the **Deploy Function Update** workflow (faster, skips infrastructure)

## For End Users (VS Code only)

Just VS Code with the Fkh extension. Nothing else needed.

```powershell
winget install Microsoft.VisualStudioCode
```

## For End Users (CLI)

```powershell
winget install Microsoft.DotNet.SDK.8
winget install GitHub.cli
gh auth login
```

## For Extension Developers

```powershell
winget install OpenJS.NodeJS.LTS
winget install Microsoft.VisualStudioCode
```
