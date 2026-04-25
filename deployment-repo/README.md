# Fkh Deployment Repository

This is a private deployment repository for your [Fkh](https://github.com/Freddy-DK/Fkh) infrastructure. It contains your Terraform configuration and thin caller workflows that delegate to reusable workflows in your Fkh fork.

## Two-Repo Model

| Repository | Visibility | Purpose |
|---|---|---|
| **Your Fkh fork** | Public | Contains the reusable workflows, Terraform modules, backend code, and CLI |
| **This repo** (deployment) | Private | Contains your `deployment.tfvars` and caller workflows that pass secrets |

## Setup

Follow the [Fkh Installation Guide](https://github.com/Freddy-DK/Fkh/blob/main/Installation/README.md) to complete the setup. Here is a summary of the remaining steps:

### 1. Create the Azure Deployment Identity

Create a Managed Identity or App Registration for GitHub Actions to authenticate with Azure using OIDC. See [Step 2 — Azure Identity](https://github.com/Freddy-DK/Fkh/blob/main/Installation/Step2-AzureIdentity.md).

### 2. Create the GitHub App

Create a GitHub App in your organization and install it on this deployment repository. The app is used to dispatch image-build workflows and sync secrets. See [Step 3 — GitHub App](https://github.com/Freddy-DK/Fkh/blob/main/Installation/Step3-GitHubApp.md).

### 3. Set up GitHub Teams

Create member and admin teams in your GitHub organization to control access. See [Step 4 — GitHub Teams](https://github.com/Freddy-DK/Fkh/blob/main/Installation/Step4-GitHubTeams.md).

### 4. Configure `config/deployment.tfvars`

Edit `config/deployment.tfvars` with your Azure subscription, GitHub org, team names, and other settings. See [Step 5 — Configure Environment](https://github.com/Freddy-DK/Fkh/blob/main/Installation/Step5-ConfigureEnvironment.md).

**Never commit secrets** to this file. Use GitHub Secrets instead (see below).

### 5. Set up GitHub Secrets

Go to **Settings > Secrets and variables > Actions** and add:

| Secret | Description |
|---|---|
| `AZURE_DEPLOY_CLIENT_ID` | Client ID of your deployment identity (App Registration or Managed Identity) |
| `SQL_SA_PASSWORD` | SA password for the SQL Server deployed in AKS |
| `GH_APP_PRIVATE_KEY` | PEM-encoded private key of the GitHub App |

### 6. Deploy

Run the **Deploy Full Stack** workflow from the Actions tab to create all Azure infrastructure and publish the backend. See [Step 6 — Deploy](https://github.com/Freddy-DK/Fkh/blob/main/Installation/Step6-Deploy.md).

After the initial deployment, use **Update Backend** to publish code changes without re-running Terraform.

### 4. Create Images

The **Create Images** workflow can run either:
- **In your public Fkh fork** (free, but publicly visible which images you build)
- **In this private repo** (paid runners, but private)

Set `create_images_repo` in your `deployment.tfvars` to control which repo the backend dispatches image builds to.

## Keeping Up to Date

The **Check for Deployment Repo Updates** workflow runs weekly and creates a GitHub Issue if your workflow files differ from the templates in your Fkh fork. You can also run it manually from the Actions tab.
