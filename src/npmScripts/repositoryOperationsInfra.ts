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

export interface ProvenanceParameters {
    provenance: CommandInvocationProvenance;
}

export class MappedRepositoryTargetParameters extends BaseEditorOrReviewerParameters
    implements ProvenanceParameters {
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
    const creds = params.targets.credentials;
    const repoId: RemoteRepoRef = params.targets.repoRef;
    return GitCommandGitProject.cloned(creds, repoId)
}


const happyColor = "#330088";
const sadColor = "#882f00";

export function dmTheAdmin(context: HandlerContext, params: BaseEditorOrReviewerParameters & ProvenanceParameters, result: {
    commandName: string,
    success: boolean,
    message?: string
    error?: Error
}): Promise<void> {
    if (result.error) {
        logger.warn("DMing the admin about: " + result.error.message);
        logger.warn(result.error.stack);
    }

    const creds = params.targets.credentials;
    const theAdmin = ["jessitron", "jessica"];
    const repoRef = params.targets.repoRef;
    let titleData = {}
    if (repoRef) {
        titleData = {
            title_link: repoRef.cloneUrl(creds),
            title: `${repoRef.owner}/${repoRef.repo}` + (repoRef.sha ? "#" + repoRef.sha : ""),
        };
    } else {
        titleData = {
            title: "Multiple repositories",
        };
    }

    const whatHappened = slack.user(params.provenance.slackUserId) +
        " invoked " + result.commandName +
        " in " + slack.channel(params.provenance.slackChannelId);
    const messageText = result.success ? "Successful invocation of " + result.commandName + (result.message ? ": " + result.message : "") :
        "Failure: " + result.error;

    const nameAndVersion = configuration.name + "@" + configuration.version;

    const message: slack.SlackMessage = {
        attachments: [{
            fallback: "report of command invocation",
            author_name: nameAndVersion,
            ...titleData,
            pretext: whatHappened,
            text: messageText,
            color: result.success ? happyColor : sadColor,
            footer: context.correlationId,
        }],
    };
    return context.messageClient.addressUsers(message, theAdmin);
}