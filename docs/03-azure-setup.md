# Step 3: Azure Setup

## Required Permissions

The person deploying needs these Azure permissions:

| Permission | Scope | Why |
|-----------|-------|-----|
| **Contributor** | Subscription | Create resource groups, AKS, Function App, storage, ACR |
| **User Access Administrator** | Subscription | Assign roles to the managed identity |

> If your org uses custom roles, you need: create/manage resource groups, AKS clusters, Function Apps, storage accounts, container registries, managed identities, role assignments, and Log Analytics workspaces.

## Login

```powershell
az login
az account list --output table
az account set --subscription "<your-subscription-id>"
```

## Terraform State Storage

Terraform needs a backend storage account for its state file. Create one (once per org, not per customer):

```powershell
$rgName     = "terraform-state"
$saName     = "tfstatefkh"          # must be globally unique
$container  = "tfstate"
$location   = "westeurope"

az group create --name $rgName --location $location
az storage account create --name $saName --resource-group $rgName --location $location --sku Standard_LRS
az storage container create --name $container --account-name $saName
```

You'll reference this in `terraform init` (see [Step 6](06-deploy.md)).

## Collect These Values

You'll need these for the tfvars file:

| Value | Where to find it |
|-------|-----------------|
| **Subscription ID** | `az account show --query id -o tsv` |
| **Tenant ID** | `az account show --query tenantId -o tsv` |
| **Region** | Pick one: `westeurope`, `eastus`, `northeurope`, etc. |
