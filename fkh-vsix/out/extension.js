import * as vscode from 'vscode';
import { createReadSettingsOptions, readSettings } from './readALGoSettings';
import { determineArtifactUrl } from './bcArtifactHelper';
import { ProjectsTreeProvider, ContainersTreeProvider } from './nodesTreeProvider';
let functionCatalog;
let outputChannel;
let projectsProvider;
let containersProvider;
function getBaseUrl() {
    const url = vscode.workspace.getConfiguration('fk8s').get('baseUrl', '').trim();
    if (!url) {
        vscode.window.showErrorMessage('FK8s: Base URL is not configured. Set "fk8s.baseUrl" in your settings.', 'Open Settings').then((action) => {
            if (action === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'fk8s.baseUrl');
            }
        });
        return undefined;
    }
    return url;
}
export function activate(context) {
    outputChannel = vscode.window.createOutputChannel('FK8s');
    projectsProvider = new ProjectsTreeProvider();
    const projectsView = vscode.window.createTreeView('fk8sProjects', {
        treeDataProvider: projectsProvider,
    });
    containersProvider = new ContainersTreeProvider(getBaseUrl, getGitHubSession);
    const containersView = vscode.window.createTreeView('fk8sContainers', {
        treeDataProvider: containersProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(outputChannel, projectsView, containersView, vscode.commands.registerCommand('fk8s.refreshProjects', () => projectsProvider.refresh()), vscode.commands.registerCommand('fk8s.refreshContainers', () => containersProvider.refresh()), vscode.commands.registerCommand('fk8s.startNode', async (item) => {
        if (!item.nodeInfo) {
            return;
        }
        await invokeNodeAction('StartNode', item.nodeInfo.name);
    }), vscode.commands.registerCommand('fk8s.stopNode', async (item) => {
        if (!item.nodeInfo) {
            return;
        }
        await invokeNodeAction('StopNode', item.nodeInfo.name);
    }), vscode.commands.registerCommand('fk8s.removeNode', async (item) => {
        if (!item.nodeInfo) {
            return;
        }
        const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove '${item.nodeInfo.name}'? This will delete the node and its database.`, { modal: true }, 'Remove');
        if (confirm !== 'Remove') {
            return;
        }
        await invokeNodeAction('RemoveNode', item.nodeInfo.name);
    }), vscode.commands.registerCommand('fk8s.run', async () => {
        const catalog = await getFunctionCatalog();
        if (!catalog) {
            return;
        }
        const items = catalog.functions.map(f => ({
            label: `FK8s: ${f.name}`,
            description: f.description,
            functionName: f.name,
        }));
        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a command to run',
        });
        if (!picked) {
            return;
        }
        await invokeFunctionByName(picked.functionName);
    }), vscode.commands.registerCommand('fk8s.createContainer', async () => {
        const session = await getGitHubSession();
        if (!session) {
            return;
        }
        const options = await createReadSettingsOptions(session.accessToken);
        if (!options) {
            return;
        }
        if (!options.baseFolder) {
            vscode.window.showErrorMessage('FK8s: No Git repository found in the current workspace.');
            return;
        }
        let settings;
        try {
            settings = await readSettings(options);
        }
        catch (err) {
            vscode.window.showErrorMessage(`FK8s: Failed to read AL-Go settings: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        const artifact = String(settings['artifact'] ?? '');
        const country = String(settings['country'] ?? 'us');
        outputChannel.appendLine('--- ReadSettings Options ---');
        outputChannel.appendLine(`  baseFolder: ${options.baseFolder.toString()}`);
        outputChannel.appendLine(`  repoName: ${options.repoName}`);
        outputChannel.appendLine(`  project: ${options.project || '(empty)'}`);
        outputChannel.appendLine(`  buildMode: ${options.buildMode}`);
        outputChannel.appendLine(`  workflowName: ${options.workflowName || '(empty)'}`);
        outputChannel.appendLine(`  userName: ${options.userName}`);
        outputChannel.appendLine(`  branchName: ${options.branchName}`);
        outputChannel.appendLine(`  orgSettingsVariableValue: ${options.orgSettingsVariableValue || '(empty)'}`);
        outputChannel.appendLine(`  repoSettingsVariableValue: ${options.repoSettingsVariableValue || '(empty)'}`);
        outputChannel.appendLine(`  environmentSettingsVariableValue: ${options.environmentSettingsVariableValue || '(empty)'}`);
        outputChannel.appendLine(`  environmentName: ${options.environmentName || '(empty)'}`);
        outputChannel.appendLine(`  customSettings: ${options.customSettings || '(empty)'}`);
        outputChannel.appendLine('--- Resolved Settings ---');
        outputChannel.appendLine(`  Country: ${country}`);
        outputChannel.appendLine(`  Artifact: ${artifact || '(not set)'}`);
        outputChannel.show(true);
        if (!artifact) {
            vscode.window.showWarningMessage('FK8s: No artifact setting found in AL-Go settings.');
            return;
        }
        let artifactUrl;
        try {
            artifactUrl = await determineArtifactUrl(settings);
            outputChannel.appendLine(`  ArtifactUrl: ${artifactUrl}`);
            outputChannel.show(true);
        }
        catch (err) {
            vscode.window.showErrorMessage(`FK8s: Failed to resolve artifact URL: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        await invokeFunctionByName('CreateNode', { artifactUrl });
    }));
}
async function getPublicIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=text');
        if (response.ok) {
            return (await response.text()).trim();
        }
    }
    catch { /* ignore */ }
    return undefined;
}
async function getGitHubSession() {
    try {
        return await vscode.authentication.getSession('github', ['read:user', 'read:org'], { createIfNone: true });
    }
    catch {
        vscode.window.showErrorMessage('GitHub sign-in was cancelled or failed.');
        return undefined;
    }
}
async function getFunctionCatalog() {
    if (functionCatalog) {
        return functionCatalog;
    }
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
        return undefined;
    }
    try {
        const response = await fetch(`${baseUrl}/functions`, { method: 'GET' });
        if (!response.ok) {
            const error = await response.text();
            vscode.window.showErrorMessage(`Failed to fetch function metadata: ${error}`);
            return undefined;
        }
        functionCatalog = await response.json();
        return functionCatalog;
    }
    catch (err) {
        vscode.window.showErrorMessage(`Could not fetch function metadata: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
    }
}
async function promptForParameters(definition, prefilled = {}) {
    const parameters = { ...prefilled };
    const config = vscode.workspace.getConfiguration('fk8s');
    for (const param of definition.parameters) {
        const prefilledKey = Object.keys(prefilled).find(k => k.toLowerCase() === param.name.toLowerCase());
        if (prefilledKey) {
            continue;
        }
        const settingKey = `${definition.name}.${param.name}`;
        const settingValue = config.get(settingKey, '').trim();
        if (settingValue) {
            parameters[param.name] = settingValue;
            continue;
        }
        let value = undefined;
        let defaultVal = param.defaultValue ?? '';
        // Auto-detect public IP for parameters named 'ip'
        if (param.name.toLowerCase() === 'ip') {
            const detectedIp = await getPublicIp();
            if (detectedIp) {
                defaultVal = detectedIp;
            }
        }
        while (true) {
            value = await vscode.window.showInputBox({
                prompt: `${param.name}: ${param.description} (Tip: set "fk8s.${settingKey}" in settings to skip this prompt)`,
                placeHolder: defaultVal,
                value: defaultVal,
                password: param.name.toLowerCase().includes('password'),
                ignoreFocusOut: true,
            });
            // User cancelled input dialog.
            if (value === undefined) {
                return undefined;
            }
            if (value.trim().length > 0) {
                parameters[param.name] = value.trim();
                break;
            }
            if (!param.required) {
                break;
            }
            vscode.window.showWarningMessage(`${param.name} is required.`);
        }
    }
    return parameters;
}
function logOutput(message, isError = false) {
    outputChannel.appendLine(message);
    outputChannel.show(true);
    if (isError) {
        vscode.window.showErrorMessage(message);
    }
}
async function invokeFunctionByName(functionName, prefilled = {}) {
    const catalog = await getFunctionCatalog();
    if (!catalog) {
        return;
    }
    const definition = catalog.functions.find(f => f.name.toLowerCase() === functionName.toLowerCase());
    if (!definition) {
        vscode.window.showErrorMessage(`Function '${functionName}' is not available.`);
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
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${definition.name}: ${definition.description}`,
        cancellable: false,
    }, async () => {
        try {
            const body = { parameters };
            const response = await fetch(`${getBaseUrl()}/${definition.route}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify(body),
            });
            if (response.ok) {
                const result = await response.json();
                logOutput(`[${definition.name}] ${result.message}`);
            }
            else {
                const error = response.status === 401 || response.status === 403
                    ? `Access denied (${response.status}). Make sure your GitHub account is a member of an authorized team.`
                    : `Failed (${response.status}): ${await response.text()}`;
                logOutput(`[${definition.name}] ${error}`, true);
            }
        }
        catch (err) {
            logOutput(`[${definition.name}] Could not reach the provisioning service: ${err instanceof Error ? err.message : String(err)}`, true);
        }
        await containersProvider.refresh();
    });
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
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${functionName}: ${nodeName}`,
        cancellable: false,
    }, async () => {
        try {
            const body = { parameters: { name: nodeName } };
            const response = await fetch(`${baseUrl}/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify(body),
            });
            if (response.ok) {
                const result = await response.json();
                logOutput(`[${functionName}] ${result.message}`);
            }
            else {
                const error = response.status === 401 || response.status === 403
                    ? `Access denied (${response.status}).`
                    : `Failed (${response.status}): ${await response.text()}`;
                logOutput(`[${functionName}] ${error}`, true);
            }
        }
        catch (err) {
            logOutput(`[${functionName}] Could not reach the provisioning service: ${err instanceof Error ? err.message : String(err)}`, true);
        }
        await containersProvider.refresh();
    });
}
export function deactivate() { }
