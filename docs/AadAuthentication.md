# AAD Authentication for Containers

By default, containers use **NavUserPassword** authentication (username + password). You can optionally enable **Azure AD (AAD) authentication** so users sign in with their Microsoft 365 / Entra ID accounts.

## Overview

| Step | Who | When |
|------|-----|------|
| **Pre-step**: Create an AAD App Registration and configure `.tfvars` | Admin (once) | Before deploying |
| **Deploy**: Run `DeployFkhFullStack` workflow or `deploy.ps1` | Admin (once) | Initial deploy or redeploy |
| **Post-step**: Add the managed identity as an owner of the App Registration | Admin (once) | After first deploy |
| **Use**: Pass `auth=AAD` when creating a container | Any user | Ongoing |

---

## Pre-step — Create AAD App Registration

1. Go to **Azure Portal** → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Set a display name, e.g. `fkh-bc-auth`.
3. Under **Supported account types**, choose the option matching your tenant setup (single-tenant is typical).
4. Leave **Redirect URI** blank — redirect URIs are added automatically when containers are created.
5. Click **Register**.
6. On the overview page, copy the **Application (client) ID**.
7. Add it to your `.tfvars` file:

   ```hcl
   aad_app_client_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```

8. Deploy (or redeploy) using `DeployFkhFullStack` or `deploy.ps1`.

### Required permissions

The person creating the App Registration needs one of:
- **Application Administrator** role in Microsoft Entra ID
- **Cloud Application Administrator** role in Microsoft Entra ID
- Or the legacy **Global Administrator** role (broader than needed)

These are the same permissions already required for creating the deployment identity (Path A, Option 1).

---

## Post-step — Add Managed Identity as Owner

After the first deploy, the Function App's **managed identity** needs to be an owner of the App Registration so it can add redirect URIs when creating containers.

### Azure Portal

1. Go to **Azure Portal** → **Microsoft Entra ID** → **App registrations** → select the app you created above.
2. Go to **Owners** → **Add owners**.
3. Search for the managed identity name. It follows the pattern `fkh-<org_name>-identity` (e.g. `fkh-myorg-identity`).
4. Select it and click **Add**.

The `identity_client_id` is available as a Terraform output (`terraform output identity_client_id`) or in the `DeployFkhFullStack` workflow log.

---

## Using AAD Authentication

Once configured, pass `authenticationEmail` when creating a container:

- **VS Code extension**: Set the `authenticationEmail` parameter to your email address
- **CLI**: `fkh create --authenticationEmail user@contoso.com ...`
- **API**: Include `"authenticationEmail": "user@contoso.com"` in the request body

The container's web client URL will use the `/BC/SignIn` path for AAD login instead of the default username/password login.

If `aad_app_client_id` is not configured, requesting AAD authentication returns a clear error message.

---

## How It Works

1. When `auth=AAD` is requested, the Function App uses the Microsoft Graph API to add a redirect URI (`https://<container-fqdn>/BC/SignIn`) to the AAD App Registration.
2. The container is created with the `authenticationEMail` environment variable set to `AAD AUTHENTICATION`, which tells the BC runtime to use AAD auth.
3. Users sign in via the standard Microsoft login flow in the browser.

The managed identity authenticates to the Graph API using its Azure-managed credentials — no secrets or tokens are stored.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "AAD authentication is not configured" | `aad_app_client_id` is empty or not set | Add it to `.tfvars` and redeploy |
| "AAD App Registration with client ID '...' not found" | Wrong client ID in `.tfvars` | Verify the Application (client) ID in the App Registration overview |
| "The managed identity does not have permission to update AAD App Registration" | Managed identity is not an owner of the App Registration | Complete the **Post-step** above |
