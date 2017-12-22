import { HandlerContext, logger, MappedParameter, MappedParameters } from "@atomist/automation-client";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { RemoteRepoRef } from "@atomist/automation-client/operations/common/RepoId";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import {
    BaseEditorOrReviewerParameters,
    EditorOrReviewerParameters,
} from "@atomist/automation-client/operations/common/params/BaseEditorOrReviewerParameters";
import { ActionResult } from "@atomist/automation-client/action/ActionResult";
import { MappedRepoParameters } from "@atomist/automation-client/operations/common/params/MappedRepoParameters";
import { Parameters } from "@atomist/automation-client/decorators";
import * as slack from "@atomist/slack-messages";
import { configuration } from "../atomist.config";
import { EditResult } from "@atomist/automation-client/operations/edit/projectEditor";

@Parameters()
export class CommandInvocationProvenance {
    @MappedParameter(MappedParameters.SlackUser)
    public slackUserId: string;

    @MappedParameter(MappedParameters.SlackChannel)
    public slackChannelId: string;
}

export class MappedRepositoryTargetParameters extends BaseEditorOrReviewerParameters {
    public provenance: CommandInvocationProvenance;

    constructor() {
        super(new MappedRepoParameters());
        this.provenance = new CommandInvocationProvenance();
    }
}


export function commitIfEdited(editResult: EditResult, message: string): Promise<ActionResult<GitProject>> {
    if (editResult.success && editResult.edited) {
        return (editResult.target as GitProject).commit(message);
    } else {
        return Promise.resolve(editResult as EditResult<GitProject>);
    }
}

export function respondToActionResult(result: ActionResult<GitProject>): Promise<GitProject> {
    if (result.success) {
        return Promise.resolve(result.target);
    } else {
        logger.warn(`Failure in ${result.errorStep}: ${result.error.message}`);
        return Promise.reject(result.error);
    }
}

export function cloneTargetProject(params: EditorOrReviewerParameters): Promise<GitProject> {
    const creds = { token: params.targets.githubToken };
    const repoId: RemoteRepoRef = params.targets.repoRef;
    return GitCommandGitProject.cloned(creds, repoId)
}


const happyColor = "#330088";
const sadColor = "#882f00";

export function dmTheAdmin(context: HandlerContext, params: MappedRepositoryTargetParameters, result: {
    commandName: string,
    success: boolean,
    message?: string
    error?: Error
}): Promise<void> {
    const creds = { token: params.targets.githubToken };
    const theAdmin = ["jessitron", "jessica"];
    const repoRef = params.targets.repoRef;
    const repoLink = repoRef.cloneUrl(creds);
    const repoDescription = `${repoRef.owner}/${repoRef.repo}` + (repoRef.sha ? "#" + repoRef.sha : "");

    const whatHappened = slack.user(params.provenance.slackUserId) +
        " invoked " + result.commandName +
        " in " + slack.channel(params.provenance.slackChannelId);
    const messageText = result.success ? "Successful invocation of " + result.commandName :
        "Failure: " + result.error.message;

    const nameAndVersion = configuration.name + "@" + configuration.version;

    const message: slack.SlackMessage = {
        attachments: [{
            fallback: "report of command invocation",
            author_name: nameAndVersion,
            title: repoDescription,
            title_link: repoLink,
            pretext: whatHappened,
            text: messageText,
            color: result.success ? happyColor : sadColor,
            footer: context.correlationId,
        }],
    };
    return context.messageClient.addressUsers(message, theAdmin);
}