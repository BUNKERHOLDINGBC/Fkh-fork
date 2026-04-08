// bcArtifactHelper.ts
// TypeScript port of BcArtifactHelper.cs — resolves BC artifact URLs from Azure CDN indexes.
// ---------------------------------------------------------------------------
// CDN / blob-URL mapping
// ---------------------------------------------------------------------------
const cdnMap = [
    { old: 'bcartifacts.azureedge.net', new: 'bcartifacts-exdbf9fwegejdqak.b02.azurefd.net', blob: 'bcartifacts.blob.core.windows.net' },
    { old: 'bcinsider.azureedge.net', new: 'bcinsider-fvh2ekdjecfjd6gk.b02.azurefd.net', blob: 'bcinsider.blob.core.windows.net' },
    { old: 'bcpublicpreview.azureedge.net', new: 'bcpublicpreview-f2ajahg0e2cudpgh.b02.azurefd.net', blob: 'bcpublicpreview.blob.core.windows.net' },
    { old: 'businesscentralapps.azureedge.net', new: 'businesscentralapps-hkdrdkaeangzfydv.b02.azurefd.net', blob: 'businesscentralapps.blob.core.windows.net' },
    { old: 'bcprivate.azureedge.net', new: 'bcprivate-fmdwbsb3ekbkc0bt.b02.azurefd.net', blob: 'bcprivate.blob.core.windows.net' },
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
    if (!storageAccount.includes('.')) {
        storageAccount = `${storageAccount}.blob.core.windows.net`;
    }
    return replaceCDN(storageAccount, false);
}
// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------
function parseVersion(v) {
    return v.split('.').map(n => parseInt(n, 10));
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
    return artifactUrl.split('/')[4];
}
function getArtifactCountry(artifactUrl) {
    return artifactUrl.split('?')[0].split('/')[5];
}
// ---------------------------------------------------------------------------
// Index querying
// ---------------------------------------------------------------------------
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    return response.text();
}
async function queryArtifactsFromIndex(cdnHost, type, versionPrefix = '', country = '', after, before, doNotCheckPlatform = false) {
    const typeStr = type.toLowerCase();
    const indexBase = `https://${cdnHost}/${typeStr}/indexes`;
    const artifacts = [];
    let sort = false;
    let countries;
    if (!country) {
        const json = await fetchJson(`${indexBase}/countries.json`);
        countries = JSON.parse(json).filter(c => c !== 'platform');
        sort = true;
    }
    else {
        countries = [country];
    }
    let platformVersions;
    if (!doNotCheckPlatform) {
        const json = await fetchJson(`${indexBase}/platform.json`);
        const entries = JSON.parse(json);
        platformVersions = new Set(entries.map(e => e.Version));
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
        artifacts.sort((a, b) => compareVersions(parseVersion(a.split('/')[0]), parseVersion(b.split('/')[0])));
    }
    return artifacts;
}
async function getBcArtifactUrl(opts = {}) {
    let { type = 'sandbox', country = '', version = '', select = 'latest', after, before, storageAccount = '', doNotCheckPlatform = false, } = opts;
    // OnPrem: fix known mis-versioned builds, and treat daily/weekly as latest
    if (type === 'onprem') {
        if (version.startsWith('18.9')) {
            version = '18.10.35134.0';
        }
        else if (version.startsWith('17.14')) {
            version = '17.15.35135.0';
        }
        else if (version.startsWith('16.18')) {
            version = '16.19.35126.0';
        }
        if (select === 'daily' || select === 'weekly') {
            select = 'latest';
        }
    }
    // --- Daily / Weekly ---
    if (select === 'daily' || select === 'weekly') {
        if (version || after || before) {
            throw new Error('You cannot specify version, before or after when selecting Daily or Weekly build.');
        }
        const ignoreBuildsAfter = select === 'daily'
            ? startOfDay(new Date())
            : startOfWeek(new Date());
        const current = (await getBcArtifactUrl({ type, country, select: 'latest', storageAccount, doNotCheckPlatform }))[0];
        if (!current) {
            return [];
        }
        const cv = parseVersion(current.split('/')[4]);
        const verPrefix = `${cv[0]}.${cv[1]}`;
        let periodic = (await getBcArtifactUrl({ type, country, version: verPrefix, select: 'latest', before: ignoreBuildsAfter, storageAccount, doNotCheckPlatform }))[0];
        if (!periodic) {
            periodic = (await getBcArtifactUrl({ type, country, version: verPrefix, select: 'first', after: ignoreBuildsAfter, storageAccount, doNotCheckPlatform }))[0];
        }
        return [periodic ?? current];
    }
    // --- Current ---
    if (select === 'current') {
        if (storageAccount || type === 'onprem' || version) {
            throw new Error('You cannot specify storageAccount, type=onprem or version when selecting Current release.');
        }
        return getBcArtifactUrl({ type, country, select: 'latest', doNotCheckPlatform });
    }
    // --- NextMinor / NextMajor ---
    if (select === 'nextminor' || select === 'nextmajor') {
        if (storageAccount || type === 'onprem' || version) {
            throw new Error(`You cannot specify storageAccount, type=onprem or version when selecting ${select} release.`);
        }
        const currentUrl = (await getBcArtifactUrl({ type: 'sandbox', country: 'base', select: 'latest', doNotCheckPlatform }))[0];
        if (!currentUrl) {
            return [];
        }
        const cv = parseVersion(currentUrl.split('/')[4]);
        const nextMajorPrefix = `${cv[0] + 1}.0.`;
        const nextMinorPrefix = cv[1] >= 5 ? nextMajorPrefix : `${cv[0]}.${cv[1] + 1}.`;
        const targetCountry = country || 'w1';
        const insiders = await getBcArtifactUrl({ type: 'sandbox', country: targetCountry, select: 'all', after, before, storageAccount: 'bcinsider', doNotCheckPlatform });
        const nextMajor = insiders.filter(u => u.split('/')[4].startsWith(nextMajorPrefix)).pop();
        const nextMinor = insiders.filter(u => u.split('/')[4].startsWith(nextMinorPrefix)).pop();
        const chosen = select === 'nextminor' ? nextMinor : nextMajor;
        return chosen ? [chosen] : [];
    }
    // --- Main path ---
    if (!storageAccount) {
        storageAccount = 'bcartifacts';
    }
    const cdnHost = resolveToCdnHostname(storageAccount);
    const baseUrl = `https://${cdnHost}/${type.toLowerCase()}/`;
    let versionPrefix;
    let closestToVersion;
    if (select === 'closest') {
        if (!version) {
            throw new Error('You must specify a version number when you want to get the closest artifact URL.');
        }
        const dots = version.split('.').length - 1;
        if (dots !== 3) {
            throw new Error('Version number must be in the format 1.2.3.4 when you want to get the closest artifact URL.');
        }
        closestToVersion = parseVersion(version);
        versionPrefix = `${closestToVersion[0]}.${closestToVersion[1]}.`;
    }
    else {
        if (version && version.split('.').length - 1 < 3) {
            version = version.replace(/\.?$/, '.');
        }
        versionPrefix = version;
    }
    const artifactList = await queryArtifactsFromIndex(cdnHost, type, versionPrefix, country, after, before, doNotCheckPlatform);
    let selected;
    switch (select) {
        case 'all':
            selected = artifactList;
            break;
        case 'latest':
            selected = artifactList.length > 0 ? [artifactList[artifactList.length - 1]] : [];
            break;
        case 'first':
            selected = artifactList.length > 0 ? [artifactList[0]] : [];
            break;
        case 'closest':
            selected = selectClosest(artifactList, closestToVersion);
            break;
        default:
            selected = [];
            break;
    }
    return selected.map(a => `${baseUrl}${a}`);
}
function selectClosest(artifacts, target) {
    const closest = artifacts.find(a => compareVersions(parseVersion(a.split('/')[0]), target) >= 0)
        ?? artifacts[artifacts.length - 1];
    return closest ? [closest] : [];
}
function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d) {
    const day = d.getDay();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}
// ---------------------------------------------------------------------------
// Public API: determineArtifactUrl
// ---------------------------------------------------------------------------
export async function determineArtifactUrl(projectSettings) {
    let artifact = getString(projectSettings, 'artifact');
    const projectCountry = getString(projectSettings, 'country');
    const applicationDependencyText = getString(projectSettings, 'applicationDependency');
    const applicationDependency = applicationDependencyText ? parseVersion(applicationDependencyText) : undefined;
    if (!artifact && getBool(projectSettings, 'updateDependencies')) {
        const all = await getBcArtifactUrl({ country: projectCountry, select: 'all' });
        artifact = all.filter(url => applicationDependency && versionGte(getArtifactVersion(url), applicationDependencyText)).shift() ?? '';
        if (!artifact) {
            const insiderAll = await getBcArtifactUrl({ storageAccount: 'bcinsider', country: projectCountry, select: 'all' });
            artifact = insiderAll.filter(url => applicationDependency && versionGte(getArtifactVersion(url), applicationDependencyText)).shift() ?? '';
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
    if (artifact.startsWith('https://')) {
        artifactUrl = artifact;
        const parts = `${artifactUrl}////`.split('/');
        storageAccount = parts[2];
        artifactType = parts[3];
        version = parts[4];
        country = getArtifactCountry(artifactUrl);
    }
    else {
        const segments = `${artifact}/////`.split('/');
        storageAccount = segments[0];
        artifactType = segments[1] || 'Sandbox';
        version = segments[2];
        country = segments[3] || projectCountry;
        const selectStr = segments[4] || 'latest';
        const select = selectStr.toLowerCase();
        const type = artifactType.toLowerCase();
        if (version === '*') {
            if (!applicationDependency) {
                throw new Error("applicationDependency must be specified when artifact version is '*'.");
            }
            version = `${applicationDependency[0]}.${applicationDependency[1]}`;
            const allUrls = (await getBcArtifactUrl({ storageAccount, type, version, country, select: 'all' }))
                .filter(url => versionGte(getArtifactVersion(url), applicationDependencyText));
            if (select === 'latest') {
                artifactUrl = allUrls[allUrls.length - 1] ?? '';
            }
            else if (select === 'first') {
                artifactUrl = allUrls[0] ?? '';
            }
            else {
                throw new Error(`Invalid artifact setting (${artifact}). Version can only be '*' if select is first or latest.`);
            }
            if (!artifactUrl) {
                throw new Error(`No artifacts found for the artifact setting (${artifact}), when application dependency is ${applicationDependencyText}`);
            }
        }
        else {
            artifactUrl = (await getBcArtifactUrl({ storageAccount, type, version, country, select }))[0] ?? '';
            if (!artifactUrl) {
                throw new Error(`No artifacts found for the artifact setting (${artifact}).`);
            }
        }
        version = artifactUrl.split('/')[4];
        storageAccount = artifactUrl.split('/')[2];
    }
    // Check additional countries
    const additionalCountries = getStringList(projectSettings, 'additionalCountries');
    if (additionalCountries.length > 0 || country.toLowerCase() !== projectCountry.toLowerCase()) {
        const artifactVersion = parseVersion(version);
        const atUrl = (await getBcArtifactUrl({
            storageAccount,
            type: artifactType.toLowerCase(),
            country: 'at',
            version: `${artifactVersion[0]}.${artifactVersion[1]}`,
            select: 'latest',
        }))[0] ?? '';
        if (!atUrl) {
            throw new Error('Latest AT artifact could not be determined.');
        }
        const latestAtVersion = atUrl.split('/')[4];
        const allCountryUrls = await getBcArtifactUrl({
            storageAccount,
            type: artifactType.toLowerCase(),
            version: latestAtVersion,
            select: 'all',
        });
        const allowedCountries = [...new Set(allCountryUrls.map(u => getArtifactCountry(u).toLowerCase()))];
        if (!allowedCountries.includes(projectCountry.toLowerCase())) {
            throw new Error(`Country (${projectCountry}) is not a valid country code.`);
        }
        const illegal = additionalCountries.filter(c => !allowedCountries.includes(c.toLowerCase()));
        if (illegal.length > 0) {
            throw new Error(`additionalCountries contains one or more invalid country codes (${illegal.join(',')}).`);
        }
        artifactUrl = artifactUrl.replace(artifactUrl.split('/')[4], latestAtVersion);
    }
    return artifactUrl;
}
// ---------------------------------------------------------------------------
// Property helpers
// ---------------------------------------------------------------------------
function getString(obj, key, fallback = '') {
    const val = getPropertyIgnoreCase(obj, key);
    if (val === undefined || val === null) {
        return fallback;
    }
    return typeof val === 'string' ? val : String(val);
}
function getBool(obj, key, fallback = false) {
    const val = getPropertyIgnoreCase(obj, key);
    if (val === undefined || val === null) {
        return fallback;
    }
    if (typeof val === 'boolean') {
        return val;
    }
    if (typeof val === 'string') {
        return val.toLowerCase() === 'true';
    }
    return fallback;
}
function getStringList(obj, key) {
    const val = getPropertyIgnoreCase(obj, key);
    if (!val) {
        return [];
    }
    if (Array.isArray(val)) {
        return val.filter(v => typeof v === 'string' && v);
    }
    if (typeof val === 'string' && val) {
        return [val];
    }
    return [];
}
function getPropertyIgnoreCase(obj, key) {
    if (key in obj) {
        return obj[key];
    }
    const found = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return found ? obj[found] : undefined;
}
