# Azure Setup

## Required Permissions

The person deploying needs these Azure permissions:

| Permission | Scope | Why |
|-----------|-------|-----|
| **Contributor** | Subscription | Create resource groups, AKS, Function App, storage, ACR |
| **User Access Administrator** | Subscription | Assign roles to the managed identity |

> If your org uses custom roles, you need: create/manage resource groups, AKS clusters, Function Apps, storage accounts, container registries, managed identities, role assignments, and Log Analytics workspaces.

## Collect These Values

You'll need these for the tfvars file regardless of deployment method:

| Value | Where to find it |
|-------|-----------------|
| **Subscription ID** | Azure Portal → Subscriptions, or `az account show --query id -o tsv` |
| **Tenant ID** | Azure Portal → Microsoft Entra ID → Overview, or `az account show --query tenantId -o tsv` |
| **Region** | Pick one: `westeurope`, `eastus`, `swedencentral`, etc. |

## Login (Path B only)

> Skip this if you're using **Path A** (GitHub Actions). OIDC handles authentication automatically.

```powershell
az login
az account list --output table
az account set --subscription "<your-subscription-id>"
```

## Set Up OIDC for GitHub Actions (Path A only)

> Skip this if you're using **Path B** (local deployment). `az login` handles authentication.

1. Create an **App Registration** in Azure AD (Azure Portal → Microsoft Entra ID → App registrations → New registration).
2. Add a **federated credential** for GitHub Actions OIDC:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:<your-org>/<your-repo>:ref:refs/heads/main`
   - Audience: `api://AzureADTokenExchange`
3. Assign roles to the App Registration on the target Azure subscription:
   - **Contributor** — create and manage all resources
   - **User Access Administrator** — create role assignments for managed identities
4. Save the **Application (client) ID** — you'll need it as a GitHub secret (`AZURE_CLIENT_ID`).
