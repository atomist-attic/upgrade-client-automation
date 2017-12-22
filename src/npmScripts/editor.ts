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