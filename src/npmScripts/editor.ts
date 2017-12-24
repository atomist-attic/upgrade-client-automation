import { ProjectEditor, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import { logger } from "@atomist/automation-client";

export function updateScript(scriptName: string, from: string, to: string): ProjectEditor {
    return (p: Project) => {
        return p.findFile("package.json")
            .then(f => f.getContent()
                .then(content => JSON.parse(content))
                .then(json => {
                    if (json.scripts[scriptName] === from) {
                        json.scripts[scriptName] = to;
                        return f.setContent(formatJson(json))
                            .then(() => successfulEdit(p, true));
                    } else if (json.scripts[scriptName] === to) {
                        logger.info("script %s is already up-to-date", scriptName)
                        return Promise.resolve(successfulEdit(p, false))
                    } else {
                        logger.warn(`Unfamiliar value in package.json scripts[${scriptName}]: ` + json.scripts[scriptName]);
                        return Promise.resolve(successfulEdit(p, false));
                    }
                }));
    }
}

function formatJson(json: {}): string {
    return JSON.stringify(json, null, 2) + "\n";
}

// fill this out as we need it, or better, does npm publish a full one?
export type PackageJson = {
    name: string,
    version: string,
    dependencies?: {
        [key: string]: string;
    }
    scripts?: {
        [key: string]: string;
    }
}

// a side-effecting function: return true if you changed it
export type UpdateJsonFunction = (json: PackageJson) => boolean

export function updatePackageJson(fn: UpdateJsonFunction): ProjectEditor {
    return (p: Project) => {
        return p.findFile("package.json")
            .then(f => f.getContent()
                .then(content => JSON.parse(content))
                .then(json => {
                    try {
                        if (fn(json)) {
                            return f.setContent(formatJson(json))
                                .then(() => successfulEdit(p, true));
                        } else {
                            logger.info(`no change`);
                            return Promise.resolve(successfulEdit(p, false));
                        }
                    }
                    catch (e) {
                        return Promise.reject(e);
                    }
                }));
    }
}