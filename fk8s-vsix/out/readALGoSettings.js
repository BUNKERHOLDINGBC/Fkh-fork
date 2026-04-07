"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProject = getProject;
exports.createReadSettingsOptions = createReadSettingsOptions;
exports.readSettings = readSettings;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const ALGoFolderName = '.AL-Go';
const ALGoSettingsFileName = 'settings.json';
const RepoSettingsFileName = 'AL-Go-Settings.json';
const CustomTemplateRepoSettingsFileName = 'AL-Go-TemplateRepoSettings.doNotEdit.json';
const CustomTemplateProjectSettingsFileName = 'AL-Go-TemplateProjectSettings.doNotEdit.json';
const ALGoSettingsFile = path.join(ALGoFolderName, ALGoSettingsFileName);
const RepoSettingsFile = path.join('.github', RepoSettingsFileName);
const CustomTemplateRepoSettingsFile = path.join('.github', CustomTemplateRepoSettingsFileName);
const CustomTemplateProjectSettingsFile = path.join('.github', CustomTemplateProjectSettingsFileName);
function getGitAPI() {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension?.isActive) {
        return undefined;
    }
    return gitExtension.exports.getAPI(1);
}
function getGitRepository() {
    const git = getGitAPI();
    if (!git || git.repositories.length === 0) {
        return undefined;
    }
    return git.repositories[0];
}
function getGitRootPath() {
    const repo = getGitRepository();
    return repo?.rootUri.fsPath ?? '';
}
function getRepoName() {
    const repo = getGitRepository();
    if (!repo) {
        return '';
    }
    const remote = repo.state.remotes.find(r => r.name === 'origin');
    const url = remote?.fetchUrl ?? remote?.pushUrl ?? '';
    // Extract owner/repo from https or ssh URL
    const match = url.match(/[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);
    return match?.[1] ?? '';
}
function getBranchName() {
    const repo = getGitRepository();
    return repo?.state.HEAD?.name ?? '';
}
function getGitUserName() {
    const repo = getGitRepository();
    if (!repo) {
        return '';
    }
    const remote = repo.state.remotes.find(r => r.name === 'origin');
    const url = remote?.fetchUrl ?? remote?.pushUrl ?? '';
    const match = url.match(/[/:]([^/]+)\/[^/.]+?(?:\.git)?$/);
    return match?.[1] ?? '';
}
async function getProject() {
    const gitRoot = getGitRootPath();
    if (!gitRoot) {
        return undefined;
    }
    // Find all subdirectories that contain .AL-Go/settings.json (i.e., AL-Go projects)
    const entries = fs.readdirSync(gitRoot, { withFileTypes: true });
    const projects = entries
        .filter(e => e.isDirectory() && fs.existsSync(path.join(gitRoot, e.name, ALGoFolderName, ALGoSettingsFileName)))
        .map(e => e.name);
    if (projects.length === 0) {
        return undefined;
    }
    if (projects.length === 1) {
        return projects[0];
    }
    const picked = await vscode.window.showQuickPick(projects.map(p => ({ label: p })), { placeHolder: 'Select an AL-Go project' });
    return picked?.label;
}
async function getGitHubVariable(token, owner, repo, variableName) {
    // Try repo-level variable first
    try {
        const repoResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/variables/${variableName}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
        if (repoResp.ok) {
            const data = await repoResp.json();
            return data.value;
        }
    }
    catch { /* fall through to org */ }
    // Try org-level variable
    try {
        const orgResp = await fetch(`https://api.github.com/orgs/${owner}/actions/variables/${variableName}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
        if (orgResp.ok) {
            const data = await orgResp.json();
            return data.value;
        }
    }
    catch { /* not available */ }
    return '';
}
async function createReadSettingsOptions(githubToken) {
    const repoFullName = getRepoName();
    const [owner, repo] = repoFullName.includes('/') ? repoFullName.split('/') : ['', repoFullName];
    const project = await getProject();
    if (project === undefined) {
        return undefined;
    }
    const [orgSettings, repoSettings] = await Promise.all([
        getGitHubVariable(githubToken, owner, repo, 'ALGoOrgSettings'),
        getGitHubVariable(githubToken, owner, repo, 'ALGoRepoSettings'),
    ]);
    return {
        baseFolder: getGitRootPath(),
        repoName: repoFullName,
        project: project,
        buildMode: 'Default',
        workflowName: '',
        userName: getGitUserName(),
        branchName: getBranchName(),
        orgSettingsVariableValue: orgSettings,
        repoSettingsVariableValue: repoSettings,
        environmentSettingsVariableValue: '',
        environmentName: '',
        customSettings: '',
    };
}
// ── Settings reading logic (port of C# ReadALGoSettings) ──────────────────────
function readSettings(options) {
    if (!options.baseFolder) {
        throw new Error('baseFolder is required');
    }
    const repoName = normalizeRepoName(options.repoName);
    const workflowName = sanitizeWorkflowName(options.workflowName);
    const settings = getDefaultSettings(repoName);
    const sources = buildSettingsSources(options, workflowName);
    for (const [, sourceSettings] of sources) {
        if (!sourceSettings) {
            continue;
        }
        mergeInto(settings, sourceSettings);
        const conditionalSettings = getPropertyIgnoreCase(sourceSettings, 'ConditionalSettings');
        if (Array.isArray(conditionalSettings)) {
            for (const entry of conditionalSettings) {
                if (typeof entry === 'object' && entry !== null
                    && isConditionalMatch(entry, options, repoName, workflowName)) {
                    const condSettings = getPropertyIgnoreCase(entry, 'settings');
                    if (condSettings && typeof condSettings === 'object' && !Array.isArray(condSettings)) {
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
        return '';
    }
    // Remove characters invalid in file names
    return workflowName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
}
function normalizeRepoName(repoName) {
    if (!repoName) {
        return '';
    }
    const idx = repoName.lastIndexOf('/');
    return idx >= 0 ? repoName.substring(idx + 1) : repoName;
}
function getPropertyIgnoreCase(obj, key) {
    if (key in obj) {
        return obj[key];
    }
    const found = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return found ? obj[found] : undefined;
}
function getExistingKeyIgnoreCase(obj, key) {
    if (key in obj) {
        return key;
    }
    return Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
}
function readSettingsFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        const text = fs.readFileSync(filePath, 'utf-8');
        if (!text.trim()) {
            return undefined;
        }
        return JSON.parse(text);
    }
    catch (err) {
        throw new Error(`Error reading ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
}
function parseJsonObject(json, sourceName) {
    try {
        const parsed = JSON.parse(json);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error(`${sourceName} does not contain a JSON object.`);
        }
        return parsed;
    }
    catch (err) {
        throw new Error(`Failed to parse JSON from ${sourceName}: ${err instanceof Error ? err.message : String(err)}`);
    }
}
function buildSettingsSources(options, workflowName) {
    const result = [];
    const githubFolder = path.join(options.baseFolder, '.github');
    if (options.orgSettingsVariableValue) {
        result.push(['ALGoOrgSettings', parseJsonObject(options.orgSettingsVariableValue, 'ALGoOrgSettings')]);
    }
    result.push([CustomTemplateRepoSettingsFile, readSettingsFile(path.join(options.baseFolder, CustomTemplateRepoSettingsFile))]);
    result.push([RepoSettingsFile, readSettingsFile(path.join(options.baseFolder, RepoSettingsFile))]);
    if (options.repoSettingsVariableValue) {
        result.push(['ALGoRepoSettings', parseJsonObject(options.repoSettingsVariableValue, 'ALGoRepoSettings')]);
    }
    let projectFolder;
    if (options.project) {
        projectFolder = path.resolve(options.baseFolder, options.project);
        result.push([CustomTemplateProjectSettingsFile, readSettingsFile(path.join(options.baseFolder, CustomTemplateProjectSettingsFile))]);
        result.push([`${options.project}/${ALGoSettingsFile}`.replace(/\\/g, '/'), readSettingsFile(path.join(projectFolder, ALGoSettingsFile))]);
    }
    if (workflowName) {
        result.push([`.github/${workflowName}.settings.json`, readSettingsFile(path.join(githubFolder, `${workflowName}.settings.json`))]);
        if (projectFolder) {
            result.push([`${options.project}/${ALGoFolderName}/${workflowName}.settings.json`.replace(/\\/g, '/'),
                readSettingsFile(path.join(projectFolder, ALGoFolderName, `${workflowName}.settings.json`))]);
            if (options.userName) {
                result.push([`${options.project}/${ALGoFolderName}/${options.userName}.settings.json`.replace(/\\/g, '/'),
                    readSettingsFile(path.join(projectFolder, ALGoFolderName, `${options.userName}.settings.json`))]);
            }
        }
    }
    if (options.environmentSettingsVariableValue) {
        result.push([`ALGoEnvSettings for ${options.environmentName}`, parseJsonObject(options.environmentSettingsVariableValue, 'ALGoEnvSettings')]);
    }
    if (options.customSettings) {
        result.push(['CustomSettings', parseJsonObject(options.customSettings, 'customSettings')]);
    }
    return result;
}
function mergeInto(destination, source) {
    const overwriteSettings = getPropertyIgnoreCase(source, 'overwriteSettings');
    if (Array.isArray(overwriteSettings)) {
        for (const item of overwriteSettings) {
            if (typeof item !== 'string' || !item) {
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
        if (key === 'overwriteSettings') {
            continue;
        }
        const destKey = getExistingKeyIgnoreCase(destination, key) ?? key;
        const dstValue = destination[destKey];
        if (dstValue === undefined || dstValue === null) {
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
        const exists = destination.some(d => JSON.stringify(d) === JSON.stringify(item));
        if (!exists) {
            destination.push(structuredClone(item));
        }
    }
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isConditionalMatch(entry, options, repoName, workflowName) {
    const checks = [
        ['buildModes', options.buildMode],
        ['branches', options.branchName],
        ['repositories', repoName],
        ['projects', options.project],
        ['workflows', workflowName],
        ['users', options.userName],
    ];
    for (const [key, value] of checks) {
        const patterns = getPropertyIgnoreCase(entry, key);
        if (!Array.isArray(patterns)) {
            continue;
        }
        const patternsToMatch = key === 'workflows'
            ? patterns.map(p => sanitizeWorkflowName(String(p ?? '')))
            : patterns.map(p => String(p ?? ''));
        if (!value) {
            return false;
        }
        const anyMatch = patternsToMatch.some(pattern => wildcardLike(value, pattern));
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
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = '^' + escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.') + '$';
    return new RegExp(regex, 'i').test(value ?? '');
}
function getString(obj, key, fallback = '') {
    const value = getPropertyIgnoreCase(obj, key);
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value === 'string') {
        return value;
    }
    return String(value);
}
function postProcessSettings(settings, project) {
    const runsOn = getString(settings, 'runs-on');
    let shell = getString(settings, 'shell');
    let githubRunner = getString(settings, 'githubRunner');
    let githubRunnerShell = getString(settings, 'githubRunnerShell');
    if (!shell) {
        shell = runsOn.toLowerCase().includes('ubuntu-') ? 'pwsh' : 'powershell';
    }
    if (!githubRunner) {
        githubRunner = runsOn.toLowerCase().includes('ubuntu-') ? 'windows-latest' : runsOn;
    }
    if (!githubRunnerShell) {
        githubRunnerShell = shell;
    }
    if (githubRunnerShell.toLowerCase() !== 'powershell' && githubRunnerShell.toLowerCase() !== 'pwsh') {
        throw new Error(`Invalid value for setting: gitHubRunnerShell: ${githubRunnerShell}`);
    }
    if (shell.toLowerCase() !== 'powershell' && shell.toLowerCase() !== 'pwsh') {
        throw new Error(`Invalid value for setting: shell: ${shell}`);
    }
    if (githubRunner.toLowerCase().includes('ubuntu-') && githubRunnerShell.toLowerCase() === 'powershell') {
        githubRunnerShell = 'pwsh';
    }
    settings['shell'] = shell;
    settings['githubRunner'] = githubRunner;
    settings['githubRunnerShell'] = githubRunnerShell;
    if (!getString(settings, 'projectName')) {
        settings['projectName'] = project;
    }
}
function getDefaultSettings(repoName) {
    return {
        type: 'PTE',
        unusedALGoSystemFiles: [],
        projects: [],
        powerPlatformSolutionFolder: '',
        country: 'us',
        artifact: '',
        companyName: '',
        repoVersion: '1.0',
        repoName: repoName,
        versioningStrategy: 0,
        runNumberOffset: 0,
        appBuild: 0,
        appRevision: 0,
        keyVaultName: '',
        licenseFileUrlSecretName: 'licenseFileUrl',
        ghTokenWorkflowSecretName: 'ghTokenWorkflow',
        adminCenterApiCredentialsSecretName: 'adminCenterApiCredentials',
        applicationInsightsConnectionStringSecretName: 'applicationInsightsConnectionString',
        keyVaultCertificateUrlSecretName: 'keyVaultCertificateUrl',
        keyVaultCertificatePasswordSecretName: 'keyVaultCertificatePassword',
        keyVaultClientIdSecretName: 'keyVaultClientId',
        keyVaultCodesignCertificateName: '',
        codeSignCertificateUrlSecretName: 'codeSignCertificateUrl',
        codeSignCertificatePasswordSecretName: 'codeSignCertificatePassword',
        additionalCountries: [],
        appDependencies: [],
        projectName: '',
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
        applicationDependency: '18.0.0.0',
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
        failOn: 'error',
        treatTestFailuresAsWarnings: false,
        rulesetFile: '',
        enableExternalRulesets: false,
        vsixFile: '',
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
            mainAppFolder: '',
            productId: '',
            includeDependencies: [],
            continuousDelivery: false,
        },
        obsoleteTagMinAllowedMajorMinor: '',
        memoryLimit: '',
        templateUrl: '',
        templateSha: '',
        templateBranch: '',
        appDependencyProbingPaths: [],
        useProjectDependencies: false,
        'runs-on': 'windows-latest',
        shell: '',
        githubRunner: '',
        githubRunnerShell: '',
        cacheImageName: 'my',
        cacheKeepDays: 3,
        alwaysBuildAllProjects: false,
        incrementalBuilds: {
            onPush: false,
            onPull_Request: true,
            onSchedule: false,
            retentionDays: 30,
            mode: 'modifiedApps',
        },
        microsoftTelemetryConnectionString: 'InstrumentationKey=cd2cc63e-0f37-4968-b99a-532411a314b8;IngestionEndpoint=https://northeurope-2.in.applicationinsights.azure.com/',
        partnerTelemetryConnectionString: '',
        sendExtendedTelemetryToMicrosoft: false,
        environments: [],
        buildModes: [],
        useCompilerFolder: false,
        pullRequestTrigger: 'pull_request',
        bcptThresholds: {
            DurationWarning: 10,
            DurationError: 25,
            NumberOfSqlStmtsWarning: 5,
            NumberOfSqlStmtsError: 10,
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
            header: 'Documentation for {REPOSITORY} {VERSION}',
            footer: 'Documentation for <a href="https://github.com/{REPOSITORY}">{REPOSITORY}</a> made with <a href="https://aka.ms/AL-Go">AL-Go for GitHub</a>, <a href="https://go.microsoft.com/fwlink/?linkid=2247728">ALDoc</a> and <a href="https://dotnet.github.io/docfx">DocFx</a>',
            defaultIndexMD: '## Reference documentation\n\nThis is the generated reference documentation for [{REPOSITORY}](https://github.com/{REPOSITORY}).\n\nYou can use the navigation bar at the top and the table of contents to the left to navigate your documentation.\n\nYou can change this content by creating/editing the **{INDEXTEMPLATERELATIVEPATH}** file in your repository or use the alDoc:defaultIndexMD setting in your repository settings file (.github/AL-Go-Settings.json)\n\n{RELEASENOTES}',
            defaultReleaseMD: '## Release reference documentation\n\nThis is the generated reference documentation for [{REPOSITORY}](https://github.com/{REPOSITORY}).\n\nYou can use the navigation bar at the top and the table of contents to the left to navigate your documentation.\n\nYou can change this content by creating/editing the **{INDEXTEMPLATERELATIVEPATH}** file in your repository or use the alDoc:defaultReleaseMD setting in your repository settings file (.github/AL-Go-Settings.json)\n\n{RELEASENOTES}',
        },
        trustMicrosoftNuGetFeeds: true,
        nuGetFeedSelectMode: 'LatestMatching',
        commitOptions: {
            messageSuffix: '',
            pullRequestAutoMerge: false,
            pullRequestMergeMethod: 'squash',
            pullRequestLabels: [],
            createPullRequest: true,
        },
        trustedSigning: {
            Endpoint: '',
            Account: '',
            CertificateProfile: '',
        },
        useGitSubmodules: 'false',
        gitSubmodulesTokenSecretName: 'gitSubmodulesToken',
        shortLivedArtifactsRetentionDays: 1,
        reportSuppressedDiagnostics: false,
        workflowDefaultInputs: [],
        customALGoFiles: {
            filesToInclude: [],
            filesToExclude: [],
        },
        postponeProjectInBuildOrder: false,
    };
}
