# ── GitHub Team ───────────────────────────────────────────────────────────────
#
# Creates the team if it does not already exist.
# If the team already exists in GitHub, run checkGitHubTeam.ps1 before applying —
# it imports the existing team into Terraform state so apply manages it without conflict.

resource "github_team" "provisioners" {
  name        = var.github_team_name
  description = "Members can provision AKS nodes via the VS Code extension."
  privacy     = "closed"

  lifecycle {
    prevent_destroy = true
  }
}

resource "github_team_membership" "members" {
  for_each = toset(var.github_team_members)

  team_id  = github_team.provisioners.id
  username = each.value
  role     = "member"
}

# ── GitHub Admin Team ────────────────────────────────────────────────────────

resource "github_team" "admins" {
  name        = var.github_admin_team_name
  description = "Admins can manage AKS nodes and access admin-only features."
  privacy     = "closed"

  lifecycle {
    prevent_destroy = true
  }
}

resource "github_team_membership" "admin_members" {
  for_each = toset(var.github_admin_team_members)

  team_id  = github_team.admins.id
  username = each.value
  role     = "member"
}
