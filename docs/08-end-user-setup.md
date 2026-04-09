# Step 8: End User Setup

End users only need VS Code. No Azure CLI, no Terraform, no Kubernetes knowledge.

## Install the FKH Extension

1. Get the `.vsix` file from your ops team (or build it: `cd fkh-vsix && npm install && npm run build`)
2. In VS Code: **Ctrl+Shift+P** → **Extensions: Install from VSIX...** → select the file

## Configure the Base URL

1. **Ctrl+Shift+P** → **Preferences: Open Settings (JSON)**
2. Add:

```json
{
  "fkh.baseUrl": "https://fkh-<customer>-functions.azurewebsites.net/api"
}
```

Your ops team will provide the exact URL.

## Sign In

The first time you run a command, VS Code prompts you to sign in with GitHub. Grant the `read:user` and `read:org` scopes.

You must be a member of the authorized GitHub team (configured in the tfvars file).

## Create a Pod

1. Open your AL-Go repository in VS Code
2. In the **FKH** sidebar, find your project under **AL-Go Projects**
3. Click the **Create Pod** icon next to the project

Or: **Ctrl+Shift+P** → **FKH: Create Pod**

The extension reads your AL-Go settings, resolves the artifact URL, and provisions a BC environment.

## Manage Pods

In the **FKH** sidebar:
- **Pods** — lists all your pods with status, WebClient link, and resource usage
- **Start/Stop** — click the icons to scale pods up/down (database is preserved)
- **Remove** — deletes the pod and its database

## CLI Alternative

```powershell
cd fkh-cli
dotnet run -- createpod --name mybc --artifactUrl "https://..." --adminUsername admin --adminPassword "P@ssword1"
dotnet run -- listpods
dotnet run -- stoppod --name mybc
dotnet run -- startpod --name mybc
dotnet run -- removepod --name mybc
```

The CLI uses `gh auth token` for authentication. Sign in with `gh auth login` first.

## Access Permissions

| Role | What you can do |
|------|----------------|
| **Member** (Fkh-members team) | Create, start, stop, remove your own pods. View your pods and images. |
| **Admin** (Fkh-admins team) | All of the above + view all pods + view nodes + list all users' pods |
