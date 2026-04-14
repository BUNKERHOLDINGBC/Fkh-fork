# Azure Setup (Path A — GitHub Actions)To Create the App Registration

THe App Registration allows the Fkh workflows to deploy and manage the entire Fkh Kubernetes cluster and backend.

## Required Permissions

The person performing this step needs these permissions on two different levels:

To Create the App Registration:
- **Application Administrator** or **Cloud Application Administrator** role in Microsoft Entra ID (Azure AD)
- Or the legacy **Global Administrator** role (broader than needed)

To Assign Roles on the Subscription, you need one of these on the target subscription:
- **Owner** — can assign roles to others
- **User Access Administrator** — specifically grants the ability to assign roles

Regular Contributor alone is not enough, since it can't manage role assignments.

## Set Up OIDC for GitHub Actions

GitHub Actions uses OIDC to authenticate with Azure — no secrets stored, no `az login` needed.

1. Create an **App Registration** in Azure AD (Azure Portal → Microsoft Entra ID → App registrations → New registration).
2. Add a **federated credential** for GitHub Actions OIDC:
   - Issuer: `https://token.actions.githubusercontent.com` (default)
   - Organization: `<your-github-org>`
   - Repository: `Fkh`
   - Entity type: `Branch`
   - Based on selection: `main`
   - Subject identifier: `repo:<your-org>/Fkh:ref:refs/heads/main`
   - Name: `fkh-main-branch`
   - Audience: `api://AzureADTokenExchange`
3. Assign roles to the App Registration on the target Azure subscription:
   - Go to **Subscriptions** → your subscription → **Access control (IAM)** → **Add** → **Add role assignment**
   - Select the **Privileged administrator roles** tab (not the search box — there are many "…Contributor" roles, you need the one called exactly **Contributor**)
   - Select **Contributor** → **Next** → **Select members** → search for your App Registration → **Review + assign**
   - Repeat for **User Access Administrator** (also on the **Privileged administrator roles** tab)
   - On the **Conditions** tab, select **Allow user to assign all roles except privileged administrator roles** (the recommended default). Fkh only assigns non-privileged roles (AcrPull, Storage Blob Data Contributor, etc.).
4. Save the **Application (client) ID** — you'll need it as a GitHub secret (`AZURE_DEPLOY_CLIENT_ID`).

> If your org uses custom roles, you need: create/manage resource groups, AKS clusters, Function Apps, storage accounts, container registries, managed identities, role assignments, and Log Analytics workspaces.

## Values to Save

You'll need these three values for [Configure Your Environment](ConfigureEnvironment.md):

| Value | Where to find it |
|-------|-----------------|
| **Subscription ID** | Azure Portal → Subscriptions, or `az account show --query id -o tsv` |
| **Tenant ID** | Azure Portal → Microsoft Entra ID → Overview, or `az account show --query tenantId -o tsv` |
| **Region** | Pick one: `westeurope`, `eastus`, `swedencentral`, etc. |
| **Application (client) ID** | The overview page on the App Registration |

## Next Step

→ [Create the GitHub App](GitHubApp.md)
