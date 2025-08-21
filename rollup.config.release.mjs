import typescript from "@rollup/plugin-typescript";
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import url from '@rollup/plugin-url';
import archiver from 'archiver';

import { rollupPluginHTML as html } from '@web/rollup-plugin-html';
import copy from "rollup-plugin-copy";
import { readFileSync } from "fs";
import del from "rollup-plugin-delete";

const packageFile = readFileSync("./package.json");
const packageJson = JSON.parse(packageFile.toString());

const platforms = ["chromium", "firefox"];

const extensionEnv = `"production"`;
const extensionName = "X-Forwarded-For Header";

const configs = [];

function createZipPlugin(options) {
    return {
        name: 'create-zip',
        writeBundle() {
            return new Promise((resolve, reject) => {
                const output = fs.createWriteStream(options.out);
                const archive = archiver('zip', { zlib: { level: 9 } });

                output.on('close', resolve);
                archive.on('error', reject);

                archive.pipe(output);
                archive.directory(options.in, false);
                archive.finalize();
            });
        }
    };
}

platforms.forEach((platformName) => {
    const dest = `releases/${platformName}`;

    // 根据平台设置不同的 API 值
    const chromeResourceTypes = `[
        ResourceType.MAIN_FRAME,
        ResourceType.SUB_FRAME,
        ResourceType.STYLESHEET,
        ResourceType.SCRIPT,
        ResourceType.IMAGE,
        ResourceType.FONT,
        ResourceType.OBJECT,
        ResourceType.XMLHTTPREQUEST,
        ResourceType.PING,
        ResourceType.CSP_REPORT,
        ResourceType.MEDIA,
        ResourceType.WEBSOCKET,
        ResourceType.OTHER,
        "webtransport",
        "webbundle"
    ]`;

    const firefoxResourceTypes = `[
        ResourceType.MAIN_FRAME,
        ResourceType.SUB_FRAME,
        ResourceType.STYLESHEET,
        ResourceType.SCRIPT,
        ResourceType.IMAGE,
        ResourceType.FONT,
        ResourceType.OBJECT,
        ResourceType.XMLHTTPREQUEST,
        ResourceType.PING,
        ResourceType.CSP_REPORT,
        ResourceType.MEDIA,
        ResourceType.WEBSOCKET,
        ResourceType.OTHER
    ]`;

    const apiValues = platformName === 'firefox' ? {
        '__RULE_ACTION_TYPE_MODIFY_HEADERS__': '"modifyHeaders"',
        '__HEADER_OPERATION_SET__': '"set"',
        '__RESOURCE_TYPES__': firefoxResourceTypes
    } : {
        '__RULE_ACTION_TYPE_MODIFY_HEADERS__': 'chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS',
        '__HEADER_OPERATION_SET__': 'chrome.declarativeNetRequest.HeaderOperation.SET',
        '__RESOURCE_TYPES__': chromeResourceTypes
    };

    configs.push(
        {
            input: './src/*.html',
            plugins: [
                del({
                    targets: [
                        `${dest}/*`,
                        `releases/${platformName}-${packageJson.version}.zip`
                    ]
                }),
                replace({
                    values: {
                        '__buildVersion__': packageJson.version,
                        'process.env.NODE_ENV': extensionEnv,
                        ...apiValues
                    },
                    preventAssignment: true,
                }),
                typescript({
                    compilerOptions: {
                        outDir: dest,
                    }
                }),
                url(),
                html(),
                resolve({ browser: true }),
            ],
            output: {
                dir: dest,
            },
            preserveEntrySignatures: 'strict',
        },
        {
            input: "./src/serviceWorker.ts",
            plugins: [
                replace({
                    values: {
                        '__buildVersion__': packageJson.version,
                        '__buildName__': extensionName,
                        'process.env.NODE_ENV': extensionEnv,
                        ...apiValues
                    },
                    preventAssignment: true,
                }),
                typescript({
                    compilerOptions: {
                        outDir: dest,
                    }
                }),
                resolve({ browser: true }),
                copy({
                    targets: [
                        {
                            src: `./src/platforms/${platformName}/manifest.json`,
                            dest,
                            transform: (contents) => {
                                return contents.toString()
                                    .replace(/__buildVersion__/g, packageJson.version)
                                    .replace(/__homePage__/g, packageJson.homepage)
                                    .replace(/__buildName__/g, extensionName)
                            }
                        },
                        {
                            src: `./src/assets/*`,
                            dest: `${dest}/assets`,
                        },
                        {
                            src: `./src/_locales/*`,
                            dest: `${dest}/_locales`,
                        }
                    ]
                }),
                createZipPlugin({
                    in: dest,
                    out: `releases/${platformName}-${packageJson.version}.zip`,
                }),
            ],
            output: {
                dir: dest,
                inlineDynamicImports: true,
            },
            preserveEntrySignatures: 'strict',
        }
    );
});

export default configs;