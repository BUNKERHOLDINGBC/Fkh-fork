import * as vscode from 'vscode';
import { getProjects } from './readALGoSettings';
// ── AL-Go Projects tree ──────────────────────────────────────────────────────
export class ProjectTreeItem extends vscode.TreeItem {
    label;
    collapsibleState;
    projectName;
    constructor(label, collapsibleState, projectName) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.projectName = projectName;
    }
}
export class ProjectsTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    projects = [];
    async refresh() {
        this.projects = await getProjects();
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return [];
        }
        if (this.projects.length === 0) {
            const empty = new ProjectTreeItem('No AL-Go projects found', vscode.TreeItemCollapsibleState.None);
            empty.iconPath = new vscode.ThemeIcon('info');
            return [empty];
        }
        return this.projects.map(name => {
            const item = new ProjectTreeItem(name, vscode.TreeItemCollapsibleState.None, name);
            item.iconPath = new vscode.ThemeIcon('symbol-folder');
            item.contextValue = 'algoProject';
            return item;
        });
    }
}
export class ContainerTreeItem extends vscode.TreeItem {
    label;
    collapsibleState;
    nodeInfo;
    constructor(label, collapsibleState, nodeInfo) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.nodeInfo = nodeInfo;
    }
}
export class ContainersTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    nodes = [];
    _getBaseUrl;
    _getGitHubSession;
    constructor(getBaseUrl, getGitHubSession) {
        this._getBaseUrl = getBaseUrl;
        this._getGitHubSession = getGitHubSession;
    }
    async refresh() {
        this.nodes = await this.fetchNodes();
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            if (this.nodes.length === 0) {
                const empty = new ContainerTreeItem('No containers', vscode.TreeItemCollapsibleState.None);
                empty.iconPath = new vscode.ThemeIcon('info');
                return [empty];
            }
            return this.nodes.map(node => {
                const statusLower = node.status.toLowerCase();
                const icon = statusLower.startsWith('running')
                    ? new vscode.ThemeIcon('vm-running', new vscode.ThemeColor('testing.iconPassed'))
                    : statusLower.startsWith('starting')
                        ? new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('testing.iconQueued'))
                        : new vscode.ThemeIcon('vm', new vscode.ThemeColor('testing.iconSkipped'));
                const item = new ContainerTreeItem(`${node.name} (${node.status})`, vscode.TreeItemCollapsibleState.Collapsed, node);
                item.iconPath = icon;
                item.tooltip = `${node.appLabel}\nStatus: ${node.status}`;
                item.contextValue = `node-${node.status.toLowerCase()}`;
                return item;
            });
        }
        if (element.nodeInfo) {
            return element.nodeInfo.properties.map(prop => {
                const child = new ContainerTreeItem(`${prop.label}: ${prop.value}`, vscode.TreeItemCollapsibleState.None);
                child.tooltip = `${prop.label}: ${prop.value}`;
                if (prop.label === 'WebClient') {
                    child.command = {
                        command: 'vscode.open',
                        title: 'Open WebClient',
                        arguments: [vscode.Uri.parse(prop.value)],
                    };
                    child.iconPath = new vscode.ThemeIcon('link-external');
                }
                else if (prop.label === 'Image') {
                    child.iconPath = new vscode.ThemeIcon('package');
                }
                else if (prop.label === 'CPU') {
                    child.iconPath = new vscode.ThemeIcon('dashboard');
                }
                else if (prop.label === 'Memory') {
                    child.iconPath = new vscode.ThemeIcon('server-process');
                }
                else if (prop.label === 'AutoStop') {
                    child.iconPath = new vscode.ThemeIcon('watch');
                }
                else if (prop.label === 'Status') {
                    child.iconPath = new vscode.ThemeIcon('info');
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
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify({ parameters: {} }),
            });
            if (!response.ok) {
                return [];
            }
            const result = await response.json();
            return this.parseNodesMessage(result.message);
        }
        catch {
            return [];
        }
    }
    parseNodesMessage(message) {
        const nodes = [];
        const lines = message.split('\n');
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
                    status: 'Unknown',
                    properties: [],
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
                if (key === 'Name') {
                    current.name = value;
                }
                else if (key === 'Status') {
                    const statusWord = value.split(' ')[0];
                    current.status = statusWord;
                    current.properties.push({ label: 'Status', value });
                }
                else {
                    current.properties.push({ label: key, value });
                }
            }
        }
        if (current) {
            nodes.push(current);
        }
        return nodes;
    }
}
