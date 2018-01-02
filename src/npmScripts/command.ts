import { commandHandlerFrom, OnCommand } from "@atomist/automation-client/onCommand";
import { HandleCommand, HandlerContext, logger } from "@atomist/automation-client";
import { BaseEditorOrReviewerParameters, } from "@atomist/automation-client/operations/common/params/BaseEditorOrReviewerParameters";
import { CommandHandlerMetadata, } from "@atomist/automation-client/metadata/automationMetadata";
import { UpdateJsonFunction, updatePackageJson, updateScript } from "./editor";
import { chainEditors } from "@atomist/automation-client/operations/edit/projectEditorOps";
import { guid } from "@atomist/automation-client/internal/util/string";
import {
    cloneTargetProject,
    commitIfEdited,
    dmTheAdmin,
    MappedRepositoryTargetParameters,
    respondToActionResult,
} from "./repositoryOperationsInfra";
import { Project } from "@atomist/automation-client/project/Project";

export const commandName = "UpdateNpmScripts";

const handleUpdateNpmScripts: OnCommand<MappedRepositoryTargetParameters> = (context: HandlerContext,
                                                                             params: MappedRepositoryTargetParameters) => {

    const useDoubleQuotesForWindows = chainEditors(
        updateScript("gql:gen",
// tslint:disable-next-line:max-line-length
            "gql-gen --file node_modules/@atomist/automation-client/graph/schema.cortex.json --template typescript -m --out ./src/typings/ './graphql/**/*.graphql'",
// tslint:disable-next-line:max-line-length
            "gql-gen --file node_modules/@atomist/automation-client/graph/schema.cortex.json --template typescript -m --out ./src/typings/ \"./graphql/**/*.graphql\""),
        updateScript("test",
            "mocha --require espower-typescript/guess 'test/**/*.ts'",
            "mocha --require espower-typescript/guess \"test/**/*.ts\""),);

    const branchName = "update-npm-scripts-" + guid();

    return cloneTargetProject(params)
        .then(project => project.createBranch(branchName))
        .then(respondToActionResult)
        .then(project => project.checkout(branchName))
        .then(respondToActionResult)

        .then(project => useDoubleQuotesForWindows(project, context))
        .then(editResult => commitIfEdited(editResult, "Work on Windows: use double quotes around some fileglobs"))
        .then(respondToActionResult)
        .then(useAtomistStartInManifest)
        .then(project => useAtomistStart(project, context))
        .then(editResult => commitIfEdited(editResult, "Use 'atomist start'; 'atomist-client' is deprecated"))
        .then(respondToActionResult)
        .then(project => useAtomistGit(project, context))
        .then(editResult => commitIfEdited(editResult, "Use 'atomist git'; 'git-info' is deprecated"))
        .then(respondToActionResult)

        .then(project => project.push())
        .then(respondToActionResult)
        .then(project => project.raisePullRequest("Update NPM Scripts", "match the latest in atomist/automation-seed-ts"))
        .then(respondToActionResult)
        .then(() => reportSuccess(context, params, branchName), error => reportFailure(context, params, error))
};

const useAtomistStart = updatePackageJson((json) => {
    if (json.scripts["start"].includes("atomist start")) {
        return false;
    }
    // if we were previously compiling with start, keep doing it
    if (json.scripts["start"].includes("compile")) {
        json.scripts["start"] = "atomist start";
    } else {
        // otherwise, make it work in a container
        json.scripts["start"] = "atomist start --no-install --no-compile";
    }
    return true;
});

function useAtomistStartInManifest(project: Project): Promise<Project> {
    return project.findFile("manifest.yml")
        .then(manifestFile => manifestFile.getContent()
            .then(yaml => {
                const command = yaml.match(/command:(.*)$/m);
                if (command && command[1].includes("atomist-client")) {
                    return manifestFile.replace(/command:(.*)$/m, "command: npm start")
                        .then(() => project);
                } else {
                    logger.info("No atomist-client command found in manifest.yml");
                    return Promise.resolve(project)
                }
            }), error => {
            logger.info("No manifest.yaml to change");
            return Promise.resolve(project);
        })
}

const useAtomistGit = updatePackageJson(replaceInAllScripts("git-info", "atomist git"));

function replaceInAllScripts(before: string, after: string): UpdateJsonFunction {
    return (json) => {
        let changed = false;
        Object.keys(json.scripts).forEach(k => {
            if (json.scripts[k].includes(before)) {
                changed = true;
                json.scripts[k] = json.scripts[k].replace(before, after);
            }
        });
        return changed;
    };
}

function reportSuccess(context: HandlerContext, params: MappedRepositoryTargetParameters, branchName: string) {
    return dmTheAdmin(context, params, { commandName, success: true, message: "branch is " + branchName }).then(() =>
        context.messageClient.respond("Submitted a pull request on branch " + branchName))
}

function reportFailure(context: HandlerContext, params: MappedRepositoryTargetParameters, error: Error) {
    return dmTheAdmin(context, params, { commandName, success: false, error })
        .then(() => context.messageClient.respond("Failed to update NPM scripts: " + error.message));
}

export function updateNpmScripts(): HandleCommand<BaseEditorOrReviewerParameters> & CommandHandlerMetadata {
    return commandHandlerFrom(handleUpdateNpmScripts,
        MappedRepositoryTargetParameters,
        "UpdateNpmScripts",
        "Bring the scripts in package.json up to date", "update npm scripts",
        ["node", "automation"])
}