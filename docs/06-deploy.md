# Step 6: Deploy with Terraform

## Initialize Terraform

First-time only. Point to your state backend storage (created in [Step 3](03-azure-setup.md)):

```powershell
cd terraform

terraform init `
  -backend-config="resource_group_name=terraform-state" `
  -backend-config="storage_account_name=tfstatefkh" `
  -backend-config="container_name=tfstate" `
  -backend-config="key=<customer-name>.tfstate"
```

## Plan

Preview what Terraform will create:

```powershell
terraform plan -var-file=customers/<your-name>.tfvars
```

Review the output. First deployment creates ~30 resources.

## Deploy

Use the deploy script (it checks GitHub team state first):

```powershell
.\deploy.ps1 -VarFile customers/<your-name>.tfvars
```

Or run Terraform directly:

```powershell
terraform apply -var-file=customers/<your-name>.tfvars
```

Deployment takes ~15–20 minutes (AKS cluster creation is the slowest part).

## What Gets Created

| Resource | Name Pattern | Purpose |
|----------|-------------|---------|
| Resource Group | `fkh-<customer>` | Contains everything |
| AKS Cluster | `fkh-<customer>-aks` | Linux + Windows node pools |
| Function App | `fkh-<customer>-functions` | Auth gate + provisioning API |
| Container Registry | `fkh<customer>acr` | BC container images |
| Storage (DBS) | `fkh<customer>dbs` | Database backups |
| Storage (Func) | `fkh<customer>func` | Function runtime state |
| Managed Identity | `fkh-<customer>-identity` | Azure auth for the Function |
| Log Analytics | `fkh-<customer>-logs` | Monitoring |
| App Insights | `fkh-<customer>-insights` | Function telemetry |
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
.\deploy.ps1 -VarFile customers/<your-name>.tfvars
```

Only changed resources are updated. Adding team members, changing VM sizes, etc. are all incremental.
