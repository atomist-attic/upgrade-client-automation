import { CommandHandler, HandleCommand, HandlerContext, HandlerResult, Success } from "@atomist/automation-client";
import { MappedRepositoryTargetParameters } from "../npmScripts/repositoryOperationsInfra";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { adminChannel } from "../credentials";
import * as stringify from "json-stringify-safe";
import * as slack from "@atomist/slack-messages/SlackMessages";
import { updatePackageJson } from "../npmScripts/editor";
import { EditResult } from "@atomist/automation-client/operations/edit/projectEditor";
import * as _ from "lodash";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import * as child_process from "child_process";

const CommitMessageNotice = "upgrade-automation-client-library";
export const UpgradeAutomationClientLibraryCommandName = "UpgradeAutomationClientLibraryEditor";

interface Analysis {
    pushed: boolean;
    editResult?: EditResult;
    sha?: string;
    error?: Error;
    message?: string;
}

@CommandHandler("upgrade to the latest @atomist/automation-client", "upgrade automation-client library")
export class UpgradeAutomationClientLibraryEditor implements HandleCommand<MappedRepositoryTargetParameters> {

    public async handle(context: HandlerContext, parameters: MappedRepositoryTargetParameters): Promise<HandlerResult> {
        const me = { commandName: UpgradeAutomationClientLibraryCommandName };
        const reportError = reportErrorFunction(context, parameters, me);
        // someday, parse reporef from package json
        await initialReport(context, parameters, me);
        await context.messageClient.respond("OK. I'll make a PR.");
        const branchName = "jessitron/update-automation-client-library";

        const newVersion = "0.6.5";
          //  "https://atomist.jfrog.io/atomist/npm-dev/@atomist/automation-client/-/@atomist/automation-client-0.6.6-nortissej.add-context-to-clone.20180129195815.tgz";
        const project = await GitCommandGitProject.cloned(parameters.targets.credentials,
            parameters.targets.repoRef)
            .catch(reportError("Failed to clone"));
        const editResult = await writeVersion(newVersion)(project, context)
            .catch(reportError("editor threw an exception"));
        if (editResult.success && editResult.edited) {
        await npmInstall(project).catch(reportError("npm install failed"));
            await project.createBranch(branchName).catch(reportError("push failed"));
            await project.commit(`upgrade @atomist/automation-client to ${newVersion}

[atomist:${CommitMessageNotice}]`).catch(reportError("commit failed"));
            await project.push().catch(reportError("push failed"));
            await project.raisePullRequest("Upgrade automation-client",
                `[atomist:${CommitMessageNotice}]`).catch(reportError("pull request failed"));
            const gs = await project.gitStatus().catch(
                reportError("git status failed"));
            await finalReport(context, parameters, me,
                { pushed: true, editResult, sha: gs.sha, });
        } else {
            await finalReport(context, parameters, me, { pushed: false, editResult });
        }
        return Success;
    }

    public freshParametersInstance() {
        return new MappedRepositoryTargetParameters();
    }

}

async function npmInstall(project: GitProject) {
    const cmd = "npm install";
    await new Promise((resolve, reject) => {
        child_process.exec(cmd,
            {cwd: project.baseDir}, (error, stdout: string, stderr: string) => {
            if (error) {
                console.log(`stderr from ${cmd}: ${stderr}`);
                reject("NPM install failed: " + error.message);
            } else {
                resolve(stdout);
            }
        });
    });
    const packageLock = await project.findFile("package-lock.json");
    return project.add(packageLock)
}

function writeVersion(newVersion: string) {
    return updatePackageJson(pj => {
        pj.dependencies["@atomist/automation-client"] = newVersion;
        return true;
    });
}


function linkToCommit(parameters: MappedRepositoryTargetParameters, details: { sha?: string }): string {
    if (details.sha) {
        return slack.url(
            `https://github.com/${parameters.targets.owner}/${parameters.targets.repo}/commit/${details.sha}`,
            "Code change");
    } else {
        return "(no commit sha)";
    }
}

function finalReport(context: HandlerContext,
                     parameters: MappedRepositoryTargetParameters,
                     opts: { commandName: string },
                     analysis: Analysis) {
    const attachment: slack.Attachment = {
        fallback: "report",
        color: "#20aa00",
        fields: fields(["user", "channel", "owner", "repository", "edited"], ["commit"],
            {
                user: slack.user(parameters.provenance.slackUserId),
                channel: slack.channel(parameters.provenance.slackChannelId),
                owner: parameters.targets.owner,
                repository: parameters.targets.repo,
                ...analysis, commit: linkToCommit(parameters, analysis),
                edited: analysis.editResult.edited,
            }),
    };
    const message: slack.SlackMessage = {
        text: `${slack.user(parameters.provenance.slackUserId)} invoked ${opts.commandName}.`,
        attachments: [attachment],
    };
    return context.messageClient.addressChannels(message, adminChannel, { id: context.correlationId });
}

function initialReport(context: HandlerContext, parameters: MappedRepositoryTargetParameters,
                       opts: { commandName: string }) {
    const attachment: slack.Attachment = {
        fallback: "report",
        color: "#bb2510",
        fields: fields(["user", "channel", "owner", "repository"], [],
            {
                user: slack.user(parameters.provenance.slackUserId),
                channel: slack.channel(parameters.provenance.slackChannelId),
                owner: parameters.targets.owner,
                repository: parameters.targets.repo,
            }),
    };
    const slackMessage: slack.SlackMessage = {
        text: `${opts.commandName} invoked!`,
        attachments: [attachment],
    };
    return context.messageClient.addressChannels(slackMessage, adminChannel, { id: context.correlationId });

}


function reportErrorFunction(context: HandlerContext, parameters: MappedRepositoryTargetParameters, opts: { commandName: string }) {
    return (message: string) => (error: Error) => {
        const attachment: slack.Attachment = {
            fallback: "report",
            color: "#bb2510",
            fields: fields(["user", "channel", "owner", "repository"], [],
                {
                    user: slack.user(parameters.provenance.slackUserId),
                    channel: slack.channel(parameters.provenance.slackChannelId),
                    owner: parameters.targets.owner,
                    repository: parameters.targets.repo,
                }),
        };
        const slackMessage: slack.SlackMessage = {
            text: `${slack.user(parameters.provenance.slackUserId)} invoked ${opts.commandName}.`,
            attachments: [attachment],
        };
        return context.messageClient.addressChannels(slackMessage, adminChannel, { id: context.correlationId })
            .then(() => Promise.reject(error));
    };
}

function fields(shortOnes: string[], longOnes: string[], source: object) {
    const shorts = shortOnes.map(f => ({
        title: f,
        value: stringify(_.get(source, f, "undefined")),
        short: true,
    }));
    const longs = longOnes.map(f => ({
        title: f,
        value: stringify(_.get(source, f, "undefined")),
        short: false,
    }));

    return shorts.concat(longs);
}