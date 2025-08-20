import ResourceType = chrome.declarativeNetRequest.ResourceType;

// 添加占位符类型声明
declare const __RESOURCE_TYPES__: ResourceType[];
declare const __RULE_ACTION_TYPE_MODIFY_HEADERS__: any;
declare const __HEADER_OPERATION_SET__: any;

interface Profile {
    id: number;
    name: string;
    headers: string[];
    value: string;
    domains: string[];
    includeDomains: boolean;
    enabled: boolean;
    randomIp?: boolean;
}

interface LegacyV0Settings {
    spoofIp: string,
    previous: string[],
    headers: string[],
}

const generateRandomIP = (): string => {
    const octet = () => Math.floor(Math.random() * 256);
    return `${octet()}.${octet()}.${octet()}.${octet()}`;
};

const convertProfileToRule = (profile: Profile): chrome.declarativeNetRequest.Rule => {
    const ipValue = profile.randomIp ? generateRandomIP() : profile.value;
    const rule: chrome.declarativeNetRequest.Rule = {
        id: profile.id,
        priority: profile.id,
        action: {
            type: __RULE_ACTION_TYPE_MODIFY_HEADERS__ as any,
            requestHeaders: profile.headers.map((header) => {
                return {
                    header: header.toLowerCase(),
                    operation: __HEADER_OPERATION_SET__ as any,
                    value: ipValue,
                }
            }),
        },
        condition: {
            resourceTypes: __RESOURCE_TYPES__ as any,
        },
    };

    if (profile.domains.length) {
        if (profile.includeDomains) {
            rule.condition.requestDomains = profile.domains;
        } else {
            rule.condition.excludedRequestDomains = profile.domains;
        }
    }
    return rule;
}

let globalRandomIpTimer: NodeJS.Timeout | null = null;

const startGlobalRandomIpTimer = () => {
    if (globalRandomIpTimer) {
        clearInterval(globalRandomIpTimer);
    }

    globalRandomIpTimer = setInterval(async () => {
        // Check if there is a configuration file that enables random IP
        const storedSettings = await chrome.storage.sync.get(["enabled", "profiles"]) as { enabled?: boolean, profiles?: Profile[] };
        if (storedSettings?.enabled && storedSettings?.profiles) {
            const hasRandomIpProfiles = storedSettings.profiles.some(p => p.enabled && p.randomIp);
            if (hasRandomIpProfiles) {
                await updateFromSettings();
            }
        }
    }, 30000);
};

const stopGlobalRandomIpTimer = () => {
    if (globalRandomIpTimer) {
        clearInterval(globalRandomIpTimer);
        globalRandomIpTimer = null;
    }
};

const updateDeclarativeRules = ({ addRules = [], removeRules = [] }: { addRules?: chrome.declarativeNetRequest.Rule[], removeRules?: chrome.declarativeNetRequest.Rule[] }) => {
    const removeRuleIds = removeRules.map(rule => rule.id);
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules,
    }).then(() => {
        console.log("updateDynamicRules successful", {
            removeRuleIds,
            addRules,
        });
    }).catch((e) => {
        console.error("updateDynamicRules failed", e);
    });
}

const updateFromSettings = async () => {
    const storedSettings = await chrome.storage.sync.get(["enabled", "profiles"]) as { enabled?: boolean, profiles?: Profile[] };
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    let enabled: boolean;

    stopGlobalRandomIpTimer();

    if(!storedSettings || !storedSettings.enabled || !storedSettings.profiles) {
        if(oldRules.length) {
            updateDeclarativeRules({ removeRules: oldRules });
        }
        enabled = false;
    } else {
        // Rebuild the dynamic rule set
        const rules: chrome.declarativeNetRequest.Rule[] = storedSettings.profiles
            .filter((profile) => profile.enabled)
            .map(convertProfileToRule);

        updateDeclarativeRules({addRules: rules, removeRules: oldRules});
        enabled = true;

        // Check if a random IP timer needs to be started 
        const hasRandomIpProfiles = storedSettings.profiles.some(p => p.enabled && p.randomIp);
        if (hasRandomIpProfiles) {
            startGlobalRandomIpTimer();
        }
    }
    await updateIcon(enabled);
};

const updateIcon = async (enabled?: boolean)=>  {
    if(typeof enabled !== "boolean") {
        const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
        enabled = oldRules.length > 0;
    }

    const icon = enabled ? "" : "-bw";
    await chrome.action.setIcon({
        path: {
            16: `assets/logo-16${icon}.png`,
            32: `assets/logo-32${icon}.png`,
            38: `assets/logo-38${icon}.png`,
        }});
}

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
    if(reason === chrome.runtime.OnInstalledReason.INSTALL) {
        await chrome.storage.sync.set({
            "profiles": [],
            "enabled": true,
        });
    }

    if(reason === chrome.runtime.OnInstalledReason.UPDATE) {
        // Migrate from < v1 (manifest v2 -> v3)
        if(previousVersion?.startsWith("0.")) {
            const previousSettings = await chrome.storage.sync.get() as LegacyV0Settings;
            const newProfiles: Profile[] = [];

            if(previousSettings.spoofIp) {
                newProfiles.push({
                    id: 1,
                    name: "Default (Migrated)",
                    headers: previousSettings.headers,
                    value: previousSettings.spoofIp,
                    domains: [],
                    includeDomains: true,
                    enabled: true,
                });
            }

            if(Array.isArray(previousSettings.previous)) {
                previousSettings.previous.forEach((previousIp, index) => {
                    newProfiles.push({
                        id: index+2,
                        name: `${previousIp} (Migrated)`,
                        headers: previousSettings.headers,
                        value: previousIp,
                        domains: [],
                        includeDomains: true,
                        enabled: false,
                    });
                });
            }

            await chrome.storage.sync.set({
                "profiles": newProfiles,
                "enabled": true,
            });
            await chrome.storage.sync.remove(["spoofIp", "previous", "headers"]);
        }
    }

    await updateFromSettings();
});

// Update the icon status based on what DNR rules are enabled on browser startup
chrome.runtime.onStartup.addListener(updateIcon);

chrome.runtime.onSuspend.addListener(() => {
    stopGlobalRandomIpTimer();
});

// Update the icon & DNR rules when storage has changed
chrome.storage.sync.onChanged.addListener(updateFromSettings);
