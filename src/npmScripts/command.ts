import { commandHandlerFrom, OnCommand } from "@atomist/automation-client/onCommand";
import { HandleCommand, HandlerContext } from "@atomist/automation-client";
import { BaseEditorOrReviewerParameters, } from "@atomist/automation-client/operations/common/params/BaseEditorOrReviewerParameters";
import { CommandHandlerMetadata, } from "@atomist/automation-client/metadata/automationMetadata";
import { updateScript } from "./editor";
import { chainEditors } from "@atomist/automation-client/operations/edit/projectEditorOps";
import { guid } from "@atomist/automation-client/internal/util/string";
import {
    cloneTargetProject, dmTheAdmin, MappedRepositoryTargetParameters,
    respondToActionResult,
} from "./repositoryOperationsInfra";

const commandName = "UpdateNpmScripts";

const handleUpdateNpmScripts: OnCommand<MappedRepositoryTargetParameters> = (context: HandlerContext,
                                                                             params: MappedRepositoryTargetParameters) => {

    const useDoubleQuotesForWindows = chainEditors(
        updateScript("test",
            "mocha --require espower-typescript/guess 'test/**/*.ts'",
            "mocha --require espower-typescript/guess \"test/**/*.ts\""),
        updateScript("gql:gen",
            "mocha --require espower-typescript/guess 'test/**/*.ts'",
            "mocha --require espower-typescript/guess \"test/**/*.ts\""));

    const branchName = "update-npm-scripts-" + guid();

    return cloneTargetProject(params)
        .then(project => project.createBranch(branchName))
        .then(respondToActionResult)
        .then(project => project.checkout(branchName))
        .then(respondToActionResult)
        .then(project => useDoubleQuotesForWindows(project, context))
        .then(respondToActionResult)
        .then(project => project.commit("Work on Windows: use double quotes around some fileglobs"))
        .then(respondToActionResult)
        .then(project => project.push())
        .then(respondToActionResult)
        .then(project => project.raisePullRequest("Update NPM Scripts", "match the latest in atomist/automation-seed-ts"))
        .then(respondToActionResult)
        .then(() => reportSuccess(context, params, branchName), error => reportFailure(context, params, error))
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