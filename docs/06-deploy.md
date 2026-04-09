# Step 6: Deploy with Terraform

## Initialize Terraform

First-time only. Point to your state backend storage (created in [Step 3](03-azure-setup.md)):

```powershell
cd terraform

terraform init `
  -backend-config="resource_group_name=terraform-state" `
  -backend-config="storage_account_name=tfstatefkh" `
  -backend-config="container_name=tfstate" `
  -backend-config="key=<org-name>.tfstate"
```

## Plan

Preview what Terraform will create:

```powershell
terraform plan -var-file=organizations/<your-name>.tfvars
```

Review the output. First deployment creates ~30 resources.

## Deploy

Use the deploy script (it checks GitHub team state first):

```powershell
.\deploy.ps1 -VarFile organizations/<your-name>.tfvars
```

Or run Terraform directly:

```powershell
terraform apply -var-file=organizations/<your-name>.tfvars
```

Deployment takes ~15–20 minutes (AKS cluster creation is the slowest part).

## What Gets Created

| Resource | Name Pattern | Purpose |
|----------|-------------|---------|
| Resource Group | `fkh-<org>` | Contains everything |
| AKS Cluster | `fkh-<org>-aks` | Linux + Windows node pools |
| Function App | `fkh-<org>-backend` | Auth gate + provisioning API |
| Container Registry | `fkh<org>acr` | BC container images |
| Storage (DBS) | `fkh<org>dbs` | Database backups |
| Storage (Func) | `fkh<org>func` | Function runtime state |
| Managed Identity | `fkh-<org>-identity` | Azure auth for the Function |
| Log Analytics | `fkh-<org>-logs` | Monitoring |
| App Insights | `fkh-<org>-insights` | Function telemetry |
| GitHub Teams | `Fkh-members`, `Fkh-admins` | Access control |

## Verify

After deploy, check the outputs:

```powershell
terraform output
```

Key outputs:
- `function_app_name` — you'll need this for [Step 7](07-publish-function.md)
- `function_app_url` — the base URL for the VSIX / CLI configuration

## Subsequent Deployments

After the first deploy, just run:

```powershell
.\deploy.ps1 -VarFile organizations/<your-name>.tfvars
```

Only changed resources are updated. Adding team members, changing VM sizes, etc. are all incremental.
