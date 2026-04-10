# Step 1: Fork the Repository

## Why Fork?

Each organization gets their own fork. This keeps:
- Organization-specific tfvars files private
- GitHub Actions workflows running under the organization's org
- GitHub App installations scoped to the fork

## Steps

1. Go to the Fkh repository on GitHub
2. Click **Fork** → Create fork under your organization
3. Clone your fork locally:

```powershell
git clone https://github.com/<your-org>/Fkh.git
cd Fkh
```

4. Open the workspace in VS Code:

```powershell
code fkh.code-workspace
```

## Repository Structure

```
Fkh/
├── fkh-backend/    # Fkh backend (Azure Function, .NET 8)
├── fkh-vsix/        # VS Code extension
├── fkh-cli/         # CLI tool (.NET 8)
├── terraform/       # All infrastructure
│   ├── organizations/   # Per-organization .tfvars files
│   ├── deploy.ps1   # Deployment script
│   └── *.tf         # Terraform modules
└── docs/            # This guide
```
