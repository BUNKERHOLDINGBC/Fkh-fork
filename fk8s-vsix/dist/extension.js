"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode3 = __toESM(require("vscode"));

// src/readALGoSettings.ts
var vscode = __toESM(require("vscode"));
var ALGoFolderName = ".AL-Go";
var ALGoSettingsFileName = "settings.json";
var RepoSettingsFileName = "AL-Go-Settings.json";
var CustomTemplateRepoSettingsFileName = "AL-Go-TemplateRepoSettings.doNotEdit.json";
var CustomTemplateProjectSettingsFileName = "AL-Go-TemplateProjectSettings.doNotEdit.json";
var ALGoSettingsPath = [ALGoFolderName, ALGoSettingsFileName];
var RepoSettingsPath = [".github", RepoSettingsFileName];
var CustomTemplateRepoSettingsPath = [".github", CustomTemplateRepoSettingsFileName];
var CustomTemplateProjectSettingsPath = [".github", CustomTemplateProjectSettingsFileName];
function getGitAPI() {
  const gitExtension = vscode.extensions.getExtension("vscode.git");
  if (!gitExtension?.isActive) {
    return void 0;
  }
  return gitExtension.exports.getAPI(1);
}
function getGitRepository() {
  const git = getGitAPI();
  if (!git || git.repositories.length === 0) {
    return void 0;
  }
  return git.repositories[0];
}
function getGitRootUri() {
  const repo = getGitRepository();
  if (repo) {
    return repo.rootUri;
  }
  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.uri;
}
function getRepoName() {
  const repo = getGitRepository();
  if (!repo) {
    return "";
  }
  const remote = repo.state.remotes.find((r) => r.name === "origin");
  const url = remote?.fetchUrl ?? remote?.pushUrl ?? "";
  const match = url.match(/[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);
  return match?.[1] ?? "";
}
function getBranchName() {
  const repo = getGitRepository();
  return repo?.state.HEAD?.name ?? "";
}
function getGitUserName() {
  const repo = getGitRepository();
  if (!repo) {
    return "";
  }
  const remote = repo.state.remotes.find((r) => r.name === "origin");
  const url = remote?.fetchUrl ?? remote?.pushUrl ?? "";
  const match = url.match(/[/:]([^/]+)\/[^/.]+?(?:\.git)?$/);
  return match?.[1] ?? "";
}
async function getProjects() {
  const gitRoot = getGitRootUri();
  if (!gitRoot) {
    return [];
  }
  const entries = await vscode.workspace.fs.readDirectory(gitRoot);
  const projects = [];
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory) {
      continue;
    }
    if (await uriExists(vscode.Uri.joinPath(gitRoot, name, ...ALGoSettingsPath))) {
      projects.push(name);
    }
  }
  return projects;
}
async function getProject() {
  const projects = await getProjects();
  if (projects.length === 0) {
    return void 0;
  }
  if (projects.length === 1) {
    return projects[0];
  }
  const picked = await vscode.window.showQuickPick(
    projects.map((p) => ({ label: p })),
    { placeHolder: "Select an AL-Go project" }
  );
  return picked?.label;
}
async function getGitHubVariable(token, owner, repo, variableName) {
  try {
    const repoResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/variables/${variableName}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    if (repoResp.ok) {
      const data = await repoResp.json();
      return data.value;
    }
  } catch {
  }
  try {
    const orgResp = await fetch(
      `https://api.github.com/orgs/${owner}/actions/variables/${variableName}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    if (orgResp.ok) {
      const data = await orgResp.json();
      return data.value;
    }
  } catch {
  }
  return "";
}
async function createReadSettingsOptions(githubToken) {
  const repoFullName = getRepoName();
  const [owner, repo] = repoFullName.includes("/") ? repoFullName.split("/") : ["", repoFullName];
  const project = await getProject();
  if (project === void 0) {
    return void 0;
  }
  const [orgSettings, repoSettings] = await Promise.all([
    getGitHubVariable(githubToken, owner, repo, "ALGoOrgSettings"),
    getGitHubVariable(githubToken, owner, repo, "ALGoRepoSettings")
  ]);
  const baseFolder = getGitRootUri();
  if (!baseFolder) {
    return void 0;
  }
  return {
    baseFolder,
    repoName: repoFullName,
    project,
    buildMode: "Default",
    workflowName: "",
    userName: getGitUserName(),
    branchName: getBranchName(),
    orgSettingsVariableValue: orgSettings,
    repoSettingsVariableValue: repoSettings,
    environmentSettingsVariableValue: "",
    environmentName: "",
    customSettings: ""
  };
}
async function readSettings(options) {
  if (!options.baseFolder) {
    throw new Error("baseFolder is required");
  }
  const repoName = normalizeRepoName(options.repoName);
  const workflowName = sanitizeWorkflowName(options.workflowName);
  const settings = getDefaultSettings(repoName);
  const sources = await buildSettingsSources(options, workflowName);
  for (const [, sourceSettings] of sources) {
    if (!sourceSettings) {
      continue;
    }
    mergeInto(settings, sourceSettings);
    const conditionalSettings = getPropertyIgnoreCase(sourceSettings, "ConditionalSettings");
    if (Array.isArray(conditionalSettings)) {
      for (const entry of conditionalSettings) {
        if (typeof entry === "object" && entry !== null && isConditionalMatch(entry, options, repoName, workflowName)) {
          const condSettings = getPropertyIgnoreCase(entry, "settings");
          if (condSettings && typeof condSettings === "object" && !Array.isArray(condSettings)) {
            mergeInto(settings, condSettings);
          }
        }
      }
    }
  }
  postProcessSettings(settings, options.project);
  return settings;
}
function sanitizeWorkflowName(workflowName) {
  if (!workflowName.trim()) {
    return "";
  }
  return workflowName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
}
function normalizeRepoName(repoName) {
  if (!repoName) {
    return "";
  }
  const idx = repoName.lastIndexOf("/");
  return idx >= 0 ? repoName.substring(idx + 1) : repoName;
}
function getPropertyIgnoreCase(obj, key) {
  if (key in obj) {
    return obj[key];
  }
  const found = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
  return found ? obj[found] : void 0;
}
function getExistingKeyIgnoreCase(obj, key) {
  if (key in obj) {
    return key;
  }
  return Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
}
async function uriExists(uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
async function readSettingsFile(uri) {
  if (!await uriExists(uri)) {
    return void 0;
  }
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder("utf-8").decode(bytes);
    if (!text.trim()) {
      return void 0;
    }
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Error reading ${uri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function parseJsonObject(json, sourceName) {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${sourceName} does not contain a JSON object.`);
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse JSON from ${sourceName}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
async function buildSettingsSources(options, workflowName) {
  const result = [];
  const githubFolder = vscode.Uri.joinPath(options.baseFolder, ".github");
  if (options.orgSettingsVariableValue) {
    result.push(["ALGoOrgSettings", parseJsonObject(options.orgSettingsVariableValue, "ALGoOrgSettings")]);
  }
  result.push([CustomTemplateRepoSettingsPath.join("/"), await readSettingsFile(vscode.Uri.joinPath(options.baseFolder, ...CustomTemplateRepoSettingsPath))]);
  result.push([RepoSettingsPath.join("/"), await readSettingsFile(vscode.Uri.joinPath(options.baseFolder, ...RepoSettingsPath))]);
  if (options.repoSettingsVariableValue) {
    result.push(["ALGoRepoSettings", parseJsonObject(options.repoSettingsVariableValue, "ALGoRepoSettings")]);
  }
  let projectFolder;
  if (options.project) {
    projectFolder = vscode.Uri.joinPath(options.baseFolder, options.project);
    result.push([CustomTemplateProjectSettingsPath.join("/"), await readSettingsFile(vscode.Uri.joinPath(options.baseFolder, ...CustomTemplateProjectSettingsPath))]);
    result.push([`${options.project}/${ALGoSettingsPath.join("/")}`, await readSettingsFile(vscode.Uri.joinPath(projectFolder, ...ALGoSettingsPath))]);
  }
  if (workflowName) {
    result.push([`.github/${workflowName}.settings.json`, await readSettingsFile(vscode.Uri.joinPath(githubFolder, `${workflowName}.settings.json`))]);
    if (projectFolder) {
      result.push([
        `${options.project}/${ALGoFolderName}/${workflowName}.settings.json`,
        await readSettingsFile(vscode.Uri.joinPath(projectFolder, ALGoFolderName, `${workflowName}.settings.json`))
      ]);
      if (options.userName) {
        result.push([
          `${options.project}/${ALGoFolderName}/${options.userName}.settings.json`,
          await readSettingsFile(vscode.Uri.joinPath(projectFolder, ALGoFolderName, `${options.userName}.settings.json`))
        ]);
      }
    }
  }
  if (options.environmentSettingsVariableValue) {
    result.push([`ALGoEnvSettings for ${options.environmentName}`, parseJsonObject(options.environmentSettingsVariableValue, "ALGoEnvSettings")]);
  }
  if (options.customSettings) {
    result.push(["CustomSettings", parseJsonObject(options.customSettings, "customSettings")]);
  }
  return result;
}
function mergeInto(destination, source) {
  const overwriteSettings = getPropertyIgnoreCase(source, "overwriteSettings");
  if (Array.isArray(overwriteSettings)) {
    for (const item of overwriteSettings) {
      if (typeof item !== "string" || !item) {
        continue;
      }
      const destKey = getExistingKeyIgnoreCase(destination, item);
      const srcKey = getExistingKeyIgnoreCase(source, item);
      if (destKey && srcKey) {
        delete destination[destKey];
      }
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (key === "overwriteSettings") {
      continue;
    }
    const destKey = getExistingKeyIgnoreCase(destination, key) ?? key;
    const dstValue = destination[destKey];
    if (dstValue === void 0 || dstValue === null) {
      destination[destKey] = structuredClone(value);
      continue;
    }
    if (isPlainObject(dstValue) && isPlainObject(value)) {
      mergeInto(dstValue, value);
      continue;
    }
    if (Array.isArray(dstValue) && Array.isArray(value)) {
      mergeArrays(dstValue, value);
      continue;
    }
    destination[destKey] = structuredClone(value);
  }
}
function mergeArrays(destination, source) {
  for (const item of source) {
    if (isPlainObject(item)) {
      destination.push(structuredClone(item));
      continue;
    }
    const exists = destination.some((d) => JSON.stringify(d) === JSON.stringify(item));
    if (!exists) {
      destination.push(structuredClone(item));
    }
  }
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isConditionalMatch(entry, options, repoName, workflowName) {
  const checks = [
    ["buildModes", options.buildMode],
    ["branches", options.branchName],
    ["repositories", repoName],
    ["projects", options.project],
    ["workflows", workflowName],
    ["users", options.userName]
  ];
  for (const [key, value] of checks) {
    const patterns = getPropertyIgnoreCase(entry, key);
    if (!Array.isArray(patterns)) {
      continue;
    }
    const patternsToMatch = key === "workflows" ? patterns.map((p) => sanitizeWorkflowName(String(p ?? ""))) : patterns.map((p) => String(p ?? ""));
    if (!value) {
      return false;
    }
    const anyMatch = patternsToMatch.some((pattern) => wildcardLike(value, pattern));
    if (!anyMatch) {
      return false;
    }
  }
  return true;
}
function wildcardLike(value, pattern) {
  if (!pattern) {
    return false;
  }
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = "^" + escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".") + "$";
  return new RegExp(regex, "i").test(value ?? "");
}
function getString(obj, key, fallback = "") {
  const value = getPropertyIgnoreCase(obj, key);
  if (value === void 0 || value === null) {
    return fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}
function postProcessSettings(settings, project) {
  const runsOn = getString(settings, "runs-on");
  let shell = getString(settings, "shell");
  let githubRunner = getString(settings, "githubRunner");
  let githubRunnerShell = getString(settings, "githubRunnerShell");
  if (!shell) {
    shell = runsOn.toLowerCase().includes("ubuntu-") ? "pwsh" : "powershell";
  }
  if (!githubRunner) {
    githubRunner = runsOn.toLowerCase().includes("ubuntu-") ? "windows-latest" : runsOn;
  }
  if (!githubRunnerShell) {
    githubRunnerShell = shell;
  }
  if (githubRunnerShell.toLowerCase() !== "powershell" && githubRunnerShell.toLowerCase() !== "pwsh") {
    throw new Error(`Invalid value for setting: gitHubRunnerShell: ${githubRunnerShell}`);
  }
  if (shell.toLowerCase() !== "powershell" && shell.toLowerCase() !== "pwsh") {
    throw new Error(`Invalid value for setting: shell: ${shell}`);
  }
  if (githubRunner.toLowerCase().includes("ubuntu-") && githubRunnerShell.toLowerCase() === "powershell") {
    githubRunnerShell = "pwsh";
  }
  settings["shell"] = shell;
  settings["githubRunner"] = githubRunner;
  settings["githubRunnerShell"] = githubRunnerShell;
  if (!getString(settings, "projectName")) {
    settings["projectName"] = project;
  }
}
function getDefaultSettings(repoName) {
  return {
    type: "PTE",
    unusedALGoSystemFiles: [],
    projects: [],
    powerPlatformSolutionFolder: "",
    country: "us",
    artifact: "",
    companyName: "",
    repoVersion: "1.0",
    repoName,
    versioningStrategy: 0,
    runNumberOffset: 0,
    appBuild: 0,
    appRevision: 0,
    keyVaultName: "",
    licenseFileUrlSecretName: "licenseFileUrl",
    ghTokenWorkflowSecretName: "ghTokenWorkflow",
    adminCenterApiCredentialsSecretName: "adminCenterApiCredentials",
    applicationInsightsConnectionStringSecretName: "applicationInsightsConnectionString",
    keyVaultCertificateUrlSecretName: "keyVaultCertificateUrl",
    keyVaultCertificatePasswordSecretName: "keyVaultCertificatePassword",
    keyVaultClientIdSecretName: "keyVaultClientId",
    keyVaultCodesignCertificateName: "",
    codeSignCertificateUrlSecretName: "codeSignCertificateUrl",
    codeSignCertificatePasswordSecretName: "codeSignCertificatePassword",
    additionalCountries: [],
    appDependencies: [],
    projectName: "",
    appFolders: [],
    testDependencies: [],
    testFolders: [],
    bcptTestFolders: [],
    pageScriptingTests: [],
    restoreDatabases: [],
    installApps: [],
    installTestApps: [],
    installOnlyReferencedApps: true,
    runTestsInAllInstalledTestApps: false,
    generateDependencyArtifact: false,
    skipUpgrade: false,
    applicationDependency: "18.0.0.0",
    updateDependencies: false,
    installTestRunner: false,
    installTestFramework: false,
    installTestLibraries: false,
    installPerformanceToolkit: false,
    enableCodeCop: false,
    enableUICop: false,
    enableCodeAnalyzersOnTestApps: false,
    customCodeCops: [],
    trackALAlertsInGitHub: false,
    failOn: "error",
    treatTestFailuresAsWarnings: false,
    rulesetFile: "",
    enableExternalRulesets: false,
    vsixFile: "",
    assignPremiumPlan: false,
    enableTaskScheduler: false,
    doNotBuildTests: false,
    doNotRunTests: false,
    doNotRunBcptTests: false,
    doNotRunPageScriptingTests: false,
    doNotPublishApps: false,
    doNotSignApps: false,
    configPackages: [],
    appSourceCopMandatoryAffixes: [],
    deliverToAppSource: {
      mainAppFolder: "",
      productId: "",
      includeDependencies: [],
      continuousDelivery: false
    },
    obsoleteTagMinAllowedMajorMinor: "",
    memoryLimit: "",
    templateUrl: "",
    templateSha: "",
    templateBranch: "",
    appDependencyProbingPaths: [],
    useProjectDependencies: false,
    "runs-on": "windows-latest",
    shell: "",
    githubRunner: "",
    githubRunnerShell: "",
    cacheImageName: "my",
    cacheKeepDays: 3,
    alwaysBuildAllProjects: false,
    incrementalBuilds: {
      onPush: false,
      onPull_Request: true,
      onSchedule: false,
      retentionDays: 30,
      mode: "modifiedApps"
    },
    microsoftTelemetryConnectionString: "InstrumentationKey=cd2cc63e-0f37-4968-b99a-532411a314b8;IngestionEndpoint=https://northeurope-2.in.applicationinsights.azure.com/",
    partnerTelemetryConnectionString: "",
    sendExtendedTelemetryToMicrosoft: false,
    environments: [],
    buildModes: [],
    useCompilerFolder: false,
    pullRequestTrigger: "pull_request",
    bcptThresholds: {
      DurationWarning: 10,
      DurationError: 25,
      NumberOfSqlStmtsWarning: 5,
      NumberOfSqlStmtsError: 10
    },
    fullBuildPatterns: [],
    excludeEnvironments: [],
    alDoc: {
      continuousDeployment: false,
      deployToGitHubPages: true,
      maxReleases: 3,
      groupByProject: true,
      includeProjects: [],
      excludeProjects: [],
      header: "Documentation for {REPOSITORY} {VERSION}",
      footer: 'Documentation for <a href="https://github.com/{REPOSITORY}">{REPOSITORY}</a> made with <a href="https://aka.ms/AL-Go">AL-Go for GitHub</a>, <a href="https://go.microsoft.com/fwlink/?linkid=2247728">ALDoc</a> and <a href="https://dotnet.github.io/docfx">DocFx</a>',
      defaultIndexMD: "## Reference documentation\n\nThis is the generated reference documentation for [{REPOSITORY}](https://github.com/{REPOSITORY}).\n\nYou can use the navigation bar at the top and the table of contents to the left to navigate your documentation.\n\nYou can change this content by creating/editing the **{INDEXTEMPLATERELATIVEPATH}** file in your repository or use the alDoc:defaultIndexMD setting in your repository settings file (.github/AL-Go-Settings.json)\n\n{RELEASENOTES}",
      defaultReleaseMD: "## Release reference documentation\n\nThis is the generated reference documentation for [{REPOSITORY}](https://github.com/{REPOSITORY}).\n\nYou can use the navigation bar at the top and the table of contents to the left to navigate your documentation.\n\nYou can change this content by creating/editing the **{INDEXTEMPLATERELATIVEPATH}** file in your repository or use the alDoc:defaultReleaseMD setting in your repository settings file (.github/AL-Go-Settings.json)\n\n{RELEASENOTES}"
    },
    trustMicrosoftNuGetFeeds: true,
    nuGetFeedSelectMode: "LatestMatching",
    commitOptions: {
      messageSuffix: "",
      pullRequestAutoMerge: false,
      pullRequestMergeMethod: "squash",
      pullRequestLabels: [],
      createPullRequest: true
    },
    trustedSigning: {
      Endpoint: "",
      Account: "",
      CertificateProfile: ""
    },
    useGitSubmodules: "false",
    gitSubmodulesTokenSecretName: "gitSubmodulesToken",
    shortLivedArtifactsRetentionDays: 1,
    reportSuppressedDiagnostics: false,
    workflowDefaultInputs: [],
    customALGoFiles: {
      filesToInclude: [],
      filesToExclude: []
    },
    postponeProjectInBuildOrder: false
  };
}

// src/bcArtifactHelper.ts
var cdnMap = [
  { old: "bcartifacts.azureedge.net", new: "bcartifacts-exdbf9fwegejdqak.b02.azurefd.net", blob: "bcartifacts.blob.core.windows.net" },
  { old: "bcinsider.azureedge.net", new: "bcinsider-fvh2ekdjecfjd6gk.b02.azurefd.net", blob: "bcinsider.blob.core.windows.net" },
  { old: "bcpublicpreview.azureedge.net", new: "bcpublicpreview-f2ajahg0e2cudpgh.b02.azurefd.net", blob: "bcpublicpreview.blob.core.windows.net" },
  { old: "businesscentralapps.azureedge.net", new: "businesscentralapps-hkdrdkaeangzfydv.b02.azurefd.net", blob: "businesscentralapps.blob.core.windows.net" },
  { old: "bcprivate.azureedge.net", new: "bcprivate-fmdwbsb3ekbkc0bt.b02.azurefd.net", blob: "bcprivate.blob.core.windows.net" }
];
function replaceCDN(sourceUrl, useBlobUrl = false) {
  for (const entry of cdnMap) {
    const target = useBlobUrl ? entry.blob : entry.new;
    for (const candidate of [entry.blob, entry.new, entry.old]) {
      const prefix = `https://${candidate}/`;
      if (sourceUrl.toLowerCase().startsWith(prefix.toLowerCase())) {
        return `https://${target}/${sourceUrl.substring(prefix.length)}`;
      }
      if (sourceUrl.toLowerCase() === candidate.toLowerCase()) {
        return target;
      }
    }
  }
  return sourceUrl;
}
function resolveToCdnHostname(storageAccount) {
  if (!storageAccount.includes(".")) {
    storageAccount = `${storageAccount}.blob.core.windows.net`;
  }
  return replaceCDN(storageAccount, false);
}
function parseVersion(v) {
  return v.split(".").map((n) => parseInt(n, 10));
}
function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    if (va !== vb) {
      return va - vb;
    }
  }
  return 0;
}
function versionGte(a, b) {
  return compareVersions(parseVersion(a), parseVersion(b)) >= 0;
}
function getArtifactVersion(artifactUrl) {
  return artifactUrl.split("/")[4];
}
function getArtifactCountry(artifactUrl) {
  return artifactUrl.split("?")[0].split("/")[5];
}
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}
async function queryArtifactsFromIndex(cdnHost, type, versionPrefix = "", country = "", after, before, doNotCheckPlatform = false) {
  const typeStr = type.toLowerCase();
  const indexBase = `https://${cdnHost}/${typeStr}/indexes`;
  const artifacts = [];
  let sort = false;
  let countries;
  if (!country) {
    const json = await fetchJson(`${indexBase}/countries.json`);
    countries = JSON.parse(json).filter((c) => c !== "platform");
    sort = true;
  } else {
    countries = [country];
  }
  let platformVersions;
  if (!doNotCheckPlatform) {
    const json = await fetchJson(`${indexBase}/platform.json`);
    const entries = JSON.parse(json);
    platformVersions = new Set(entries.map((e) => e.Version));
  }
  for (const c of countries) {
    const json = await fetchJson(`${indexBase}/${c}.json`);
    const entries = JSON.parse(json);
    for (const entry of entries) {
      if (!entry.Version.startsWith(versionPrefix)) {
        continue;
      }
      if (doNotCheckPlatform && !after && !before) {
        artifacts.push(`${entry.Version}/${c}`);
        continue;
      }
      if (!doNotCheckPlatform && !platformVersions?.has(entry.Version)) {
        continue;
      }
      if (after || before) {
        if (!entry.CreationTime) {
          continue;
        }
        const creationTime = new Date(entry.CreationTime);
        if (after && creationTime <= after) {
          continue;
        }
        if (before && creationTime >= before) {
          continue;
        }
      }
      artifacts.push(`${entry.Version}/${c}`);
    }
  }
  if (sort) {
    artifacts.sort((a, b) => compareVersions(parseVersion(a.split("/")[0]), parseVersion(b.split("/")[0])));
  }
  return artifacts;
}
async function getBcArtifactUrl(opts = {}) {
  let {
    type = "sandbox",
    country = "",
    version = "",
    select = "latest",
    after,
    before,
    storageAccount = "",
    doNotCheckPlatform = false
  } = opts;
  if (type === "onprem") {
    if (version.startsWith("18.9")) {
      version = "18.10.35134.0";
    } else if (version.startsWith("17.14")) {
      version = "17.15.35135.0";
    } else if (version.startsWith("16.18")) {
      version = "16.19.35126.0";
    }
    if (select === "daily" || select === "weekly") {
      select = "latest";
    }
  }
  if (select === "daily" || select === "weekly") {
    if (version || after || before) {
      throw new Error("You cannot specify version, before or after when selecting Daily or Weekly build.");
    }
    const ignoreBuildsAfter = select === "daily" ? startOfDay(/* @__PURE__ */ new Date()) : startOfWeek(/* @__PURE__ */ new Date());
    const current = (await getBcArtifactUrl({ type, country, select: "latest", storageAccount, doNotCheckPlatform }))[0];
    if (!current) {
      return [];
    }
    const cv = parseVersion(current.split("/")[4]);
    const verPrefix = `${cv[0]}.${cv[1]}`;
    let periodic = (await getBcArtifactUrl({ type, country, version: verPrefix, select: "latest", before: ignoreBuildsAfter, storageAccount, doNotCheckPlatform }))[0];
    if (!periodic) {
      periodic = (await getBcArtifactUrl({ type, country, version: verPrefix, select: "first", after: ignoreBuildsAfter, storageAccount, doNotCheckPlatform }))[0];
    }
    return [periodic ?? current];
  }
  if (select === "current") {
    if (storageAccount || type === "onprem" || version) {
      throw new Error("You cannot specify storageAccount, type=onprem or version when selecting Current release.");
    }
    return getBcArtifactUrl({ type, country, select: "latest", doNotCheckPlatform });
  }
  if (select === "nextminor" || select === "nextmajor") {
    if (storageAccount || type === "onprem" || version) {
      throw new Error(`You cannot specify storageAccount, type=onprem or version when selecting ${select} release.`);
    }
    const currentUrl = (await getBcArtifactUrl({ type: "sandbox", country: "base", select: "latest", doNotCheckPlatform }))[0];
    if (!currentUrl) {
      return [];
    }
    const cv = parseVersion(currentUrl.split("/")[4]);
    const nextMajorPrefix = `${cv[0] + 1}.0.`;
    const nextMinorPrefix = cv[1] >= 5 ? nextMajorPrefix : `${cv[0]}.${cv[1] + 1}.`;
    const targetCountry = country || "w1";
    const insiders = await getBcArtifactUrl({ type: "sandbox", country: targetCountry, select: "all", after, before, storageAccount: "bcinsider", doNotCheckPlatform });
    const nextMajor = insiders.filter((u) => u.split("/")[4].startsWith(nextMajorPrefix)).pop();
    const nextMinor = insiders.filter((u) => u.split("/")[4].startsWith(nextMinorPrefix)).pop();
    const chosen = select === "nextminor" ? nextMinor : nextMajor;
    return chosen ? [chosen] : [];
  }
  if (!storageAccount) {
    storageAccount = "bcartifacts";
  }
  const cdnHost = resolveToCdnHostname(storageAccount);
  const baseUrl = `https://${cdnHost}/${type.toLowerCase()}/`;
  let versionPrefix;
  let closestToVersion;
  if (select === "closest") {
    if (!version) {
      throw new Error("You must specify a version number when you want to get the closest artifact URL.");
    }
    const dots = version.split(".").length - 1;
    if (dots !== 3) {
      throw new Error("Version number must be in the format 1.2.3.4 when you want to get the closest artifact URL.");
    }
    closestToVersion = parseVersion(version);
    versionPrefix = `${closestToVersion[0]}.${closestToVersion[1]}.`;
  } else {
    if (version && version.split(".").length - 1 < 3) {
      version = version.replace(/\.?$/, ".");
    }
    versionPrefix = version;
  }
  const artifactList = await queryArtifactsFromIndex(cdnHost, type, versionPrefix, country, after, before, doNotCheckPlatform);
  let selected;
  switch (select) {
    case "all":
      selected = artifactList;
      break;
    case "latest":
      selected = artifactList.length > 0 ? [artifactList[artifactList.length - 1]] : [];
      break;
    case "first":
      selected = artifactList.length > 0 ? [artifactList[0]] : [];
      break;
    case "closest":
      selected = selectClosest(artifactList, closestToVersion);
      break;
    default:
      selected = [];
      break;
  }
  return selected.map((a) => `${baseUrl}${a}`);
}
function selectClosest(artifacts, target) {
  const closest = artifacts.find((a) => compareVersions(parseVersion(a.split("/")[0]), target) >= 0) ?? artifacts[artifacts.length - 1];
  return closest ? [closest] : [];
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d) {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}
async function determineArtifactUrl(projectSettings) {
  let artifact = getString2(projectSettings, "artifact");
  const projectCountry = getString2(projectSettings, "country");
  const applicationDependencyText = getString2(projectSettings, "applicationDependency");
  const applicationDependency = applicationDependencyText ? parseVersion(applicationDependencyText) : void 0;
  if (!artifact && getBool(projectSettings, "updateDependencies")) {
    const all = await getBcArtifactUrl({ country: projectCountry, select: "all" });
    artifact = all.filter((url) => applicationDependency && versionGte(getArtifactVersion(url), applicationDependencyText)).shift() ?? "";
    if (!artifact) {
      const insiderAll = await getBcArtifactUrl({ storageAccount: "bcinsider", country: projectCountry, select: "all" });
      artifact = insiderAll.filter((url) => applicationDependency && versionGte(getArtifactVersion(url), applicationDependencyText)).shift() ?? "";
      if (!artifact) {
        throw new Error(`No artifacts found for application dependency ${applicationDependencyText}.`);
      }
    }
  }
  let artifactUrl;
  let storageAccount;
  let artifactType;
  let version;
  let country;
  if (artifact.startsWith("https://")) {
    artifactUrl = artifact;
    const parts = `${artifactUrl}////`.split("/");
    storageAccount = parts[2];
    artifactType = parts[3];
    version = parts[4];
    country = getArtifactCountry(artifactUrl);
  } else {
    const segments = `${artifact}/////`.split("/");
    storageAccount = segments[0];
    artifactType = segments[1] || "Sandbox";
    version = segments[2];
    country = segments[3] || projectCountry;
    const selectStr = segments[4] || "latest";
    const select = selectStr.toLowerCase();
    const type = artifactType.toLowerCase();
    if (version === "*") {
      if (!applicationDependency) {
        throw new Error("applicationDependency must be specified when artifact version is '*'.");
      }
      version = `${applicationDependency[0]}.${applicationDependency[1]}`;
      const allUrls = (await getBcArtifactUrl({ storageAccount, type, version, country, select: "all" })).filter((url) => versionGte(getArtifactVersion(url), applicationDependencyText));
      if (select === "latest") {
        artifactUrl = allUrls[allUrls.length - 1] ?? "";
      } else if (select === "first") {
        artifactUrl = allUrls[0] ?? "";
      } else {
        throw new Error(`Invalid artifact setting (${artifact}). Version can only be '*' if select is first or latest.`);
      }
      if (!artifactUrl) {
        throw new Error(`No artifacts found for the artifact setting (${artifact}), when application dependency is ${applicationDependencyText}`);
      }
    } else {
      artifactUrl = (await getBcArtifactUrl({ storageAccount, type, version, country, select }))[0] ?? "";
      if (!artifactUrl) {
        throw new Error(`No artifacts found for the artifact setting (${artifact}).`);
      }
    }
    version = artifactUrl.split("/")[4];
    storageAccount = artifactUrl.split("/")[2];
  }
  const additionalCountries = getStringList(projectSettings, "additionalCountries");
  if (additionalCountries.length > 0 || country.toLowerCase() !== projectCountry.toLowerCase()) {
    const artifactVersion = parseVersion(version);
    const atUrl = (await getBcArtifactUrl({
      storageAccount,
      type: artifactType.toLowerCase(),
      country: "at",
      version: `${artifactVersion[0]}.${artifactVersion[1]}`,
      select: "latest"
    }))[0] ?? "";
    if (!atUrl) {
      throw new Error("Latest AT artifact could not be determined.");
    }
    const latestAtVersion = atUrl.split("/")[4];
    const allCountryUrls = await getBcArtifactUrl({
      storageAccount,
      type: artifactType.toLowerCase(),
      version: latestAtVersion,
      select: "all"
    });
    const allowedCountries = [...new Set(allCountryUrls.map((u) => getArtifactCountry(u).toLowerCase()))];
    if (!allowedCountries.includes(projectCountry.toLowerCase())) {
      throw new Error(`Country (${projectCountry}) is not a valid country code.`);
    }
    const illegal = additionalCountries.filter((c) => !allowedCountries.includes(c.toLowerCase()));
    if (illegal.length > 0) {
      throw new Error(`additionalCountries contains one or more invalid country codes (${illegal.join(",")}).`);
    }
    artifactUrl = artifactUrl.replace(artifactUrl.split("/")[4], latestAtVersion);
  }
  return artifactUrl;
}
function getString2(obj, key, fallback = "") {
  const val = getPropertyIgnoreCase2(obj, key);
  if (val === void 0 || val === null) {
    return fallback;
  }
  return typeof val === "string" ? val : String(val);
}
function getBool(obj, key, fallback = false) {
  const val = getPropertyIgnoreCase2(obj, key);
  if (val === void 0 || val === null) {
    return fallback;
  }
  if (typeof val === "boolean") {
    return val;
  }
  if (typeof val === "string") {
    return val.toLowerCase() === "true";
  }
  return fallback;
}
function getStringList(obj, key) {
  const val = getPropertyIgnoreCase2(obj, key);
  if (!val) {
    return [];
  }
  if (Array.isArray(val)) {
    return val.filter((v) => typeof v === "string" && v);
  }
  if (typeof val === "string" && val) {
    return [val];
  }
  return [];
}
function getPropertyIgnoreCase2(obj, key) {
  if (key in obj) {
    return obj[key];
  }
  const found = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
  return found ? obj[found] : void 0;
}

// src/nodesTreeProvider.ts
var vscode2 = __toESM(require("vscode"));
var ProjectTreeItem = class extends vscode2.TreeItem {
  constructor(label, collapsibleState, projectName) {
    super(label, collapsibleState);
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.projectName = projectName;
  }
  label;
  collapsibleState;
  projectName;
};
var ProjectsTreeProvider = class {
  _onDidChangeTreeData = new vscode2.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  projects = [];
  async refresh() {
    this.projects = await getProjects();
    this._onDidChangeTreeData.fire(void 0);
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (element) {
      return [];
    }
    if (this.projects.length === 0) {
      const empty = new ProjectTreeItem("No AL-Go projects found", vscode2.TreeItemCollapsibleState.None);
      empty.iconPath = new vscode2.ThemeIcon("info");
      return [empty];
    }
    return this.projects.map((name) => {
      const item = new ProjectTreeItem(name, vscode2.TreeItemCollapsibleState.None, name);
      item.iconPath = new vscode2.ThemeIcon("symbol-folder");
      item.contextValue = "algoProject";
      return item;
    });
  }
};
var ContainerTreeItem = class extends vscode2.TreeItem {
  constructor(label, collapsibleState, nodeInfo) {
    super(label, collapsibleState);
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.nodeInfo = nodeInfo;
  }
  label;
  collapsibleState;
  nodeInfo;
};
var ContainersTreeProvider = class {
  _onDidChangeTreeData = new vscode2.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  nodes = [];
  _getBaseUrl;
  _getGitHubSession;
  constructor(getBaseUrl2, getGitHubSession2) {
    this._getBaseUrl = getBaseUrl2;
    this._getGitHubSession = getGitHubSession2;
  }
  async refresh() {
    this.nodes = await this.fetchNodes();
    this._onDidChangeTreeData.fire(void 0);
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!element) {
      if (this.nodes.length === 0) {
        const empty = new ContainerTreeItem("No containers", vscode2.TreeItemCollapsibleState.None);
        empty.iconPath = new vscode2.ThemeIcon("info");
        return [empty];
      }
      return this.nodes.map((node) => {
        const statusLower = node.status.toLowerCase();
        const icon = statusLower.startsWith("running") ? new vscode2.ThemeIcon("vm-running", new vscode2.ThemeColor("testing.iconPassed")) : statusLower.startsWith("starting") ? new vscode2.ThemeIcon("sync~spin", new vscode2.ThemeColor("testing.iconQueued")) : new vscode2.ThemeIcon("vm", new vscode2.ThemeColor("testing.iconSkipped"));
        const item = new ContainerTreeItem(
          `${node.name} (${node.status})`,
          vscode2.TreeItemCollapsibleState.Collapsed,
          node
        );
        item.iconPath = icon;
        item.tooltip = `${node.appLabel}
Status: ${node.status}`;
        item.contextValue = `node-${node.status.toLowerCase()}`;
        return item;
      });
    }
    if (element.nodeInfo) {
      return element.nodeInfo.properties.map((prop) => {
        const child = new ContainerTreeItem(
          `${prop.label}: ${prop.value}`,
          vscode2.TreeItemCollapsibleState.None
        );
        child.tooltip = `${prop.label}: ${prop.value}`;
        if (prop.label === "WebClient") {
          child.command = {
            command: "vscode.open",
            title: "Open WebClient",
            arguments: [vscode2.Uri.parse(prop.value)]
          };
          child.iconPath = new vscode2.ThemeIcon("link-external");
        } else if (prop.label === "Image") {
          child.iconPath = new vscode2.ThemeIcon("package");
        } else if (prop.label === "CPU") {
          child.iconPath = new vscode2.ThemeIcon("dashboard");
        } else if (prop.label === "Memory") {
          child.iconPath = new vscode2.ThemeIcon("server-process");
        } else if (prop.label === "AutoStop") {
          child.iconPath = new vscode2.ThemeIcon("watch");
        } else if (prop.label === "Status") {
          child.iconPath = new vscode2.ThemeIcon("info");
        }
        return child;
      });
    }
    return [];
  }
  async fetchNodes() {
    const baseUrl = this._getBaseUrl();
    if (!baseUrl) {
      return [];
    }
    const session = await this._getGitHubSession();
    if (!session) {
      return [];
    }
    try {
      const response = await fetch(`${baseUrl}/ListNodes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({ parameters: {} })
      });
      if (!response.ok) {
        return [];
      }
      const result = await response.json();
      return this.parseNodesMessage(result.message);
    } catch {
      return [];
    }
  }
  parseNodesMessage(message) {
    const nodes = [];
    const lines = message.split("\n");
    let current;
    for (const line of lines) {
      const headerMatch = line.match(/^  (\S+)\s*$/);
      if (headerMatch) {
        if (current) {
          nodes.push(current);
        }
        current = {
          appLabel: headerMatch[1],
          name: headerMatch[1],
          status: "Unknown",
          properties: []
        };
        continue;
      }
      if (!current) {
        continue;
      }
      const propMatch = line.match(/^    (\S+?)\s*:\s*(.+)$/);
      if (propMatch) {
        const key = propMatch[1];
        const value = propMatch[2].trim();
        if (key === "Name") {
          current.name = value;
        } else if (key === "Status") {
          const statusWord = value.split(" ")[0];
          current.status = statusWord;
          current.properties.push({ label: "Status", value });
        } else {
          current.properties.push({ label: key, value });
        }
      }
    }
    if (current) {
      nodes.push(current);
    }
    return nodes;
  }
};

// src/extension.ts
var functionCatalog;
var outputChannel;
var projectsProvider;
var containersProvider;
function getBaseUrl() {
  const url = vscode3.workspace.getConfiguration("fk8s").get("baseUrl", "").trim();
  if (!url) {
    vscode3.window.showErrorMessage(
      'FK8s: Base URL is not configured. Set "fk8s.baseUrl" in your settings.',
      "Open Settings"
    ).then((action) => {
      if (action === "Open Settings") {
        vscode3.commands.executeCommand("workbench.action.openSettings", "fk8s.baseUrl");
      }
    });
    return void 0;
  }
  return url;
}
function activate(context) {
  outputChannel = vscode3.window.createOutputChannel("FK8s");
  projectsProvider = new ProjectsTreeProvider();
  const projectsView = vscode3.window.createTreeView("fk8sProjects", {
    treeDataProvider: projectsProvider
  });
  containersProvider = new ContainersTreeProvider(getBaseUrl, getGitHubSession);
  const containersView = vscode3.window.createTreeView("fk8sContainers", {
    treeDataProvider: containersProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(
    outputChannel,
    projectsView,
    containersView,
    vscode3.commands.registerCommand("fk8s.refreshProjects", () => projectsProvider.refresh()),
    vscode3.commands.registerCommand("fk8s.refreshContainers", () => containersProvider.refresh()),
    vscode3.commands.registerCommand("fk8s.startNode", async (item) => {
      if (!item.nodeInfo) {
        return;
      }
      await invokeNodeAction("StartNode", item.nodeInfo.name);
    }),
    vscode3.commands.registerCommand("fk8s.stopNode", async (item) => {
      if (!item.nodeInfo) {
        return;
      }
      await invokeNodeAction("StopNode", item.nodeInfo.name);
    }),
    vscode3.commands.registerCommand("fk8s.removeNode", async (item) => {
      if (!item.nodeInfo) {
        return;
      }
      const confirm = await vscode3.window.showWarningMessage(
        `Are you sure you want to remove '${item.nodeInfo.name}'? This will delete the node and its database.`,
        { modal: true },
        "Remove"
      );
      if (confirm !== "Remove") {
        return;
      }
      await invokeNodeAction("RemoveNode", item.nodeInfo.name);
    }),
    vscode3.commands.registerCommand("fk8s.run", async () => {
      const catalog = await getFunctionCatalog();
      if (!catalog) {
        return;
      }
      const items = catalog.functions.map((f) => ({
        label: `FK8s: ${f.name}`,
        description: f.description,
        functionName: f.name
      }));
      const picked = await vscode3.window.showQuickPick(items, {
        placeHolder: "Select a command to run"
      });
      if (!picked) {
        return;
      }
      await invokeFunctionByName(picked.functionName);
    }),
    vscode3.commands.registerCommand("fk8s.createContainer", async () => {
      const session = await getGitHubSession();
      if (!session) {
        return;
      }
      const options = await createReadSettingsOptions(session.accessToken);
      if (!options) {
        return;
      }
      if (!options.baseFolder) {
        vscode3.window.showErrorMessage("FK8s: No Git repository found in the current workspace.");
        return;
      }
      let settings;
      try {
        settings = await readSettings(options);
      } catch (err) {
        vscode3.window.showErrorMessage(`FK8s: Failed to read AL-Go settings: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      const artifact = String(settings["artifact"] ?? "");
      const country = String(settings["country"] ?? "us");
      outputChannel.appendLine("--- ReadSettings Options ---");
      outputChannel.appendLine(`  baseFolder: ${options.baseFolder.toString()}`);
      outputChannel.appendLine(`  repoName: ${options.repoName}`);
      outputChannel.appendLine(`  project: ${options.project || "(empty)"}`);
      outputChannel.appendLine(`  buildMode: ${options.buildMode}`);
      outputChannel.appendLine(`  workflowName: ${options.workflowName || "(empty)"}`);
      outputChannel.appendLine(`  userName: ${options.userName}`);
      outputChannel.appendLine(`  branchName: ${options.branchName}`);
      outputChannel.appendLine(`  orgSettingsVariableValue: ${options.orgSettingsVariableValue || "(empty)"}`);
      outputChannel.appendLine(`  repoSettingsVariableValue: ${options.repoSettingsVariableValue || "(empty)"}`);
      outputChannel.appendLine(`  environmentSettingsVariableValue: ${options.environmentSettingsVariableValue || "(empty)"}`);
      outputChannel.appendLine(`  environmentName: ${options.environmentName || "(empty)"}`);
      outputChannel.appendLine(`  customSettings: ${options.customSettings || "(empty)"}`);
      outputChannel.appendLine("--- Resolved Settings ---");
      outputChannel.appendLine(`  Country: ${country}`);
      outputChannel.appendLine(`  Artifact: ${artifact || "(not set)"}`);
      outputChannel.show(true);
      if (!artifact) {
        vscode3.window.showWarningMessage("FK8s: No artifact setting found in AL-Go settings.");
        return;
      }
      let artifactUrl;
      try {
        artifactUrl = await determineArtifactUrl(settings);
        outputChannel.appendLine(`  ArtifactUrl: ${artifactUrl}`);
        outputChannel.show(true);
      } catch (err) {
        vscode3.window.showErrorMessage(`FK8s: Failed to resolve artifact URL: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      await invokeFunctionByName("CreateNode", { artifactUrl });
    })
  );
}
async function getPublicIp() {
  try {
    const response = await fetch("https://api.ipify.org?format=text");
    if (response.ok) {
      return (await response.text()).trim();
    }
  } catch {
  }
  return void 0;
}
async function getGitHubSession() {
  try {
    return await vscode3.authentication.getSession(
      "github",
      ["read:user", "read:org"],
      { createIfNone: true }
    );
  } catch {
    vscode3.window.showErrorMessage("GitHub sign-in was cancelled or failed.");
    return void 0;
  }
}
async function getFunctionCatalog() {
  if (functionCatalog) {
    return functionCatalog;
  }
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return void 0;
  }
  try {
    const response = await fetch(`${baseUrl}/functions`, { method: "GET" });
    if (!response.ok) {
      const error = await response.text();
      vscode3.window.showErrorMessage(`Failed to fetch function metadata: ${error}`);
      return void 0;
    }
    functionCatalog = await response.json();
    return functionCatalog;
  } catch (err) {
    vscode3.window.showErrorMessage(
      `Could not fetch function metadata: ${err instanceof Error ? err.message : String(err)}`
    );
    return void 0;
  }
}
async function promptForParameters(definition, prefilled = {}) {
  const parameters = { ...prefilled };
  const config = vscode3.workspace.getConfiguration("fk8s");
  for (const param of definition.parameters) {
    const prefilledKey = Object.keys(prefilled).find(
      (k) => k.toLowerCase() === param.name.toLowerCase()
    );
    if (prefilledKey) {
      continue;
    }
    const settingKey = `${definition.name}.${param.name}`;
    const settingValue = config.get(settingKey, "").trim();
    if (settingValue) {
      parameters[param.name] = settingValue;
      continue;
    }
    let value = void 0;
    let defaultVal = param.defaultValue ?? "";
    if (param.name.toLowerCase() === "ip") {
      const detectedIp = await getPublicIp();
      if (detectedIp) {
        defaultVal = detectedIp;
      }
    }
    while (true) {
      value = await vscode3.window.showInputBox({
        prompt: `${param.name}: ${param.description} (Tip: set "fk8s.${settingKey}" in settings to skip this prompt)`,
        placeHolder: defaultVal,
        value: defaultVal,
        password: param.name.toLowerCase().includes("password"),
        ignoreFocusOut: true
      });
      if (value === void 0) {
        return void 0;
      }
      if (value.trim().length > 0) {
        parameters[param.name] = value.trim();
        break;
      }
      if (!param.required) {
        break;
      }
      vscode3.window.showWarningMessage(`${param.name} is required.`);
    }
  }
  return parameters;
}
function logOutput(message, isError = false) {
  outputChannel.appendLine(message);
  outputChannel.show(true);
  if (isError) {
    vscode3.window.showErrorMessage(message);
  }
}
async function invokeFunctionByName(functionName, prefilled = {}) {
  const catalog = await getFunctionCatalog();
  if (!catalog) {
    return;
  }
  const definition = catalog.functions.find((f) => f.name.toLowerCase() === functionName.toLowerCase());
  if (!definition) {
    vscode3.window.showErrorMessage(`Function '${functionName}' is not available.`);
    return;
  }
  const parameters = await promptForParameters(definition, prefilled);
  if (!parameters) {
    return;
  }
  const session = await getGitHubSession();
  if (!session) {
    return;
  }
  await vscode3.window.withProgress(
    {
      location: vscode3.ProgressLocation.Notification,
      title: `${definition.name}: ${definition.description}`,
      cancellable: false
    },
    async () => {
      try {
        const body = { parameters };
        const response = await fetch(`${getBaseUrl()}/${definition.route}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`
          },
          body: JSON.stringify(body)
        });
        if (response.ok) {
          const result = await response.json();
          logOutput(`[${definition.name}] ${result.message}`);
        } else {
          const error = response.status === 401 || response.status === 403 ? `Access denied (${response.status}). Make sure your GitHub account is a member of an authorized team.` : `Failed (${response.status}): ${await response.text()}`;
          logOutput(`[${definition.name}] ${error}`, true);
        }
      } catch (err) {
        logOutput(`[${definition.name}] Could not reach the provisioning service: ${err instanceof Error ? err.message : String(err)}`, true);
      }
      await containersProvider.refresh();
    }
  );
}
async function invokeNodeAction(functionName, nodeName) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return;
  }
  const session = await getGitHubSession();
  if (!session) {
    return;
  }
  await vscode3.window.withProgress(
    {
      location: vscode3.ProgressLocation.Notification,
      title: `${functionName}: ${nodeName}`,
      cancellable: false
    },
    async () => {
      try {
        const body = { parameters: { name: nodeName } };
        const response = await fetch(`${baseUrl}/${functionName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`
          },
          body: JSON.stringify(body)
        });
        if (response.ok) {
          const result = await response.json();
          logOutput(`[${functionName}] ${result.message}`);
        } else {
          const error = response.status === 401 || response.status === 403 ? `Access denied (${response.status}).` : `Failed (${response.status}): ${await response.text()}`;
          logOutput(`[${functionName}] ${error}`, true);
        }
      } catch (err) {
        logOutput(`[${functionName}] Could not reach the provisioning service: ${err instanceof Error ? err.message : String(err)}`, true);
      }
      await containersProvider.refresh();
    }
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
