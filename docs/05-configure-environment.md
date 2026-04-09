# Step 5: Configure Your Environment

## GitHub Token

Create a GitHub **Personal Access Token (classic)** with these scopes:

| Scope | Why |
|-------|-----|
| `admin:org` | Terraform creates and manages GitHub teams |
| `read:user` | Validate user identity |

Go to: **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**

> Fine-grained tokens won't work — Terraform's GitHub provider requires a classic PAT with `admin:org`.

## Create Your Customer tfvars File

```powershell
Copy-Item terraform/customers/example.tfvars terraform/customers/<your-name>.tfvars
```

Edit the file and fill in all values:

```hcl
# Azure
subscription_id = "<from az account show>"
tenant_id       = "<from az account show>"
location        = "westeurope"
customer_name   = "mycompany"         # lowercase, no spaces

# AKS
linux_vm_size   = "Standard_D2s_v3"   # system pool, always on
windows_vm_size = "Standard_D8s_v3"   # BC pods run here
aks_sku_tier    = "Free"              # Free | Standard ($73/mo SLA)
windows_min_node_count = 0            # 0 = scale to zero, 1 = warm node
windows_overprovision  = false
windows_prepull_images = []

# SQL Server
namespace        = "app"
sql_storage_size = "128Gi"

# GitHub
github_org        = "your-org"        # case sensitive
github_repo       = "Fkh"            # your fork name
github_team_name  = "Fkh-members"
github_team_members = [
  "user1",
  "user2"
]
allowed_org_teams = [
  { org = "your-org", team = "Fkh-members" }
]

# Admin team
github_admin_team_name = "Fkh-admins"
github_admin_team_members = [
  "admin-user"
]
admin_org_teams = [
  { org = "your-org", team = "Fkh-admins" }
]

# OIDC (repos allowed to call via GitHub Actions)
allowed_oidc_repos = [
  # "your-org/your-bc-app"
]

# Let's Encrypt
contact_email_for_letsencrypt = "admin@example.com"

# GitHub App (from Step 4)
github_app_id              = "<app-id>"
github_app_installation_id = "<installation-id>"
```

## Set Secrets as Environment Variables

**Never put these in tfvars files.**

```powershell
# GitHub token
$env:TF_VAR_github_token = "<your-github-pat>"

# SQL Server SA password (8+ chars, mix of upper/lower/numbers/symbols)
$env:TF_VAR_sql_sa_password = "<strong-password>"

# GitHub App private key
$env:TF_VAR_github_app_private_key = Get-Content "<path-to>.pem" -Raw
```

> For persistent storage, add these to your PowerShell profile or use a secrets manager.

## Values Checklist

| Value | Source | In tfvars? |
|-------|--------|-----------|
| Subscription ID | `az account show` | ✅ |
| Tenant ID | `az account show` | ✅ |
| Customer name | You choose | ✅ |
| GitHub org | Your GitHub org | ✅ |
| GitHub team members | Usernames | ✅ |
| GitHub App ID | Step 4 | ✅ |
| GitHub App Installation ID | Step 4 | ✅ |
| GitHub PAT | GitHub settings | ❌ env var |
| SQL SA password | You choose | ❌ env var |
| GitHub App private key | Step 4 (.pem) | ❌ env var |
