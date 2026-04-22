# ── Managed Identity for the Azure Function ───────────────────────────────────
#
# This identity is what the Function uses to talk to AKS.
# No credentials, no secrets — Azure handles authentication at the infrastructure level.

resource "azurerm_user_assigned_identity" "function" {
  name                = local.function_identity_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
}

# Grant the Function's identity the "Azure Kubernetes Service Contributor" role
# on the AKS cluster.
resource "azurerm_role_assignment" "function_aks" {
  scope                = azurerm_kubernetes_cluster.this.id
  role_definition_name = "Azure Kubernetes Service Contributor Role"
  principal_id         = azurerm_user_assigned_identity.function.principal_id
}

# Grant the Function's identity "Storage Blob Data Contributor" on the dbs
# storage account so the createImages workflow can upload database backups.
resource "azurerm_role_assignment" "function_dbs_storage" {
  scope                = azurerm_storage_account.dbs.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.function.principal_id
}

# Grant the Function's identity "Log Analytics Reader" so it can query
# ContainerRegistryRepositoryEvents for image pull timestamps.
resource "azurerm_role_assignment" "function_log_analytics_reader" {
  scope                = azurerm_log_analytics_workspace.this.id
  role_definition_name = "Log Analytics Reader"
  principal_id         = azurerm_user_assigned_identity.function.principal_id
}

# ── Microsoft Graph permissions for AAD App management ─────────────────────────
# When aad_app_client_id is set, the function needs to query and update
# the AAD App Registration to add redirect URIs for containers.

data "azuread_service_principal" "msgraph" {
  count     = var.aad_app_client_id != "" ? 1 : 0
  client_id = "00000003-0000-0000-c000-000000000000"
}

data "azuread_application" "aad_app" {
  count     = var.aad_app_client_id != "" ? 1 : 0
  client_id = var.aad_app_client_id
}

# Grant Application.Read.All so the managed identity can query the app registration
resource "azuread_app_role_assignment" "function_graph_app_read" {
  count               = var.aad_app_client_id != "" ? 1 : 0
  app_role_id         = data.azuread_service_principal.msgraph[0].app_role_ids["Application.Read.All"]
  principal_object_id = azurerm_user_assigned_identity.function.principal_id
  resource_object_id  = data.azuread_service_principal.msgraph[0].object_id
}

# Add the managed identity as an owner of the AAD App Registration
# so it can update redirect URIs
resource "azuread_application_owner" "function_identity" {
  count           = var.aad_app_client_id != "" ? 1 : 0
  application_id  = data.azuread_application.aad_app[0].id
  owner_object_id = azurerm_user_assigned_identity.function.principal_id
}

# ── Federated credential for GitHub Actions OIDC ──────────────────────────────
# Allows the createImages workflow in the configured repo to authenticate
# as the managed identity and push images to ACR.

resource "azurerm_federated_identity_credential" "github_actions" {
  name                = "github-actions-createimages"
  user_assigned_identity_id = azurerm_user_assigned_identity.function.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main"
}
