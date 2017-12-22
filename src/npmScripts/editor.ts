import { ProjectEditor, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";

export function updateScript(scriptName: string, from: string, to: string): ProjectEditor {
    return (p: Project) => {
        return p.findFile("package.json")
            .then(f => f.getContent()
                .then(content => JSON.parse(content))
                .then(json => {
                    if (json.scripts[scriptName] === from) {
                        json.scripts[scriptName] = to;
                        return f.setContent(JSON.stringify(json, null, 2))
                            .then(() => successfulEdit(p, true));
                    } else {
                        return Promise.resolve(successfulEdit(p, false));
                    }
                }));
    }
}
