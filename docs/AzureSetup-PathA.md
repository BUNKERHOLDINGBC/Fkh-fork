# Azure Setup (Path A — GitHub Actions)

## Required Permissions

The person deploying needs these Azure permissions:

| Permission | Scope | Why |
|-----------|-------|-----|
| **Contributor** | Subscription | Create resource groups, AKS, Function App, storage, ACR |
| **User Access Administrator** | Subscription | Assign roles to the managed identity |

> If your org uses custom roles, you need: create/manage resource groups, AKS clusters, Function Apps, storage accounts, container registries, managed identities, role assignments, and Log Analytics workspaces.

## Collect These Values

You'll need these for the tfvars file and GitHub secrets:

| Value | Where to find it |
|-------|-----------------|
| **Subscription ID** | Azure Portal → Subscriptions, or `az account show --query id -o tsv` |
| **Tenant ID** | Azure Portal → Microsoft Entra ID → Overview, or `az account show --query tenantId -o tsv` |
| **Region** | Pick one: `westeurope`, `eastus`, `swedencentral`, etc. |

## Set Up OIDC for GitHub Actions

GitHub Actions uses OIDC to authenticate with Azure — no secrets stored, no `az login` needed.

1. Create an **App Registration** in Azure AD (Azure Portal → Microsoft Entra ID → App registrations → New registration).
2. Add a **federated credential** for GitHub Actions OIDC:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:<your-org>/<your-repo>:ref:refs/heads/main`
   - Audience: `api://AzureADTokenExchange`
3. Assign roles to the App Registration on the target Azure subscription:
   - Go to **Subscriptions** → your subscription → **Access control (IAM)** → **Add** → **Add role assignment**
   - Select the **Privileged administrator roles** tab (not the search box — there are many "…Contributor" roles, you need the one called exactly **Contributor**)
   - Select **Contributor** → **Next** → **Select members** → search for your App Registration → **Review + assign**
   - Repeat for **User Access Administrator** (also on the **Privileged administrator roles** tab)
   - On the **Conditions** tab, select **Allow user to assign all roles except privileged administrator roles** (the recommended default). Fkh only assigns non-privileged roles (AcrPull, Storage Blob Data Contributor, etc.).
4. Save the **Application (client) ID** — you'll need it as a GitHub secret (`AZURE_DEPLOY_CLIENT_ID`).

## Next Step

→ [Create the GitHub App](GitHubApp.md)
