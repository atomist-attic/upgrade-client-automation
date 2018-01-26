import { commandHandlerFrom } from "@atomist/automation-client/onCommand";
import { Parameters } from "@atomist/automation-client/decorators";
import {
    HandleCommand, HandlerContext, HandlerResult, logger, Secret, Secrets,
    success,
} from "@atomist/automation-client";
import * as graphql from "../typings/types";
import { doFingerprint, NotAnAutomationClient } from "./FingerprintAutomationClientVersion";
import * as slack from "@atomist/slack-messages/SlackMessages";
import * as semver from "semver";
import * as _ from "lodash";


@Parameters()
export class ListAutomationClientParameters {
    @Secret(Secrets.UserToken) // read: repo
    public githubToken: string;
}

async function listAutomationClients(ctx: HandlerContext, params: ListAutomationClientParameters): Promise<HandlerResult> {
    const query = await ctx.graphClient.executeQueryFromFile<graphql.ListAutomationClients.Query, {}>(
        "graphql/list");

    const repos = query.Repo; //.filter(r => r.name === "lifecycle-automation");

    // for the first test, assume we have
    const acbs: AutomationClientRepo[] = await Promise.all(
        repos.map(r => analyseRepo(params.githubToken, r)));

    return ctx.messageClient.respond(constructMessage(acbs))
        .then(success);
}

async function analyseRepo(githubToken: string, repo: graphql.ListAutomationClients.Repo): Promise<AutomationClientRepo> {
    const allBranches = await
        Promise.all(
            repo.branches.map(branch =>
                gatherAutomationClientiness(githubToken, repo, branch)));
    return {
        repo: repo.name,
        owner: repo.owner,
        provider: providerFromRepo(repo),
        branches: allBranches.filter(b => b.automationClientVersion !== NotAnAutomationClient),
    }
}

interface AutomationClientBranch {
    sha: string,
    branchName: string,
    automationClientVersion: string; // might be NotAnAutomationClient
    isDefault: boolean,
}

interface AutomationClientRepo {
    repo: string,
    owner: string,
    provider: { url: string, apiUrl: string },
    branches: AutomationClientBranch[];
}

async function gatherAutomationClientiness(githubToken: string, repo: graphql.ListAutomationClients.Repo,
                                           branch: graphql.ListAutomationClients.Branches): Promise<AutomationClientBranch> {
    try {
        const where = { repo: repo.name, owner: repo.owner, provider: providerFromRepo(repo), sha: branch.commit.sha };
        const fingerprint = await doFingerprint(githubToken, where);
        return {
            sha: branch.commit.sha,
            branchName: branch.name,
            automationClientVersion: fingerprint.sha,
            isDefault: branch.name === repo.defaultBranch,
        }

    } catch (err) {
        logger.warn("Could not get automation client version: " + err);
        return {
            sha: _.get(branch, "commit.sha", "???"),
            branchName: branch ? branch.name : "???",
            automationClientVersion: "???",
            isDefault: false,
        }
    }
}

function constructMessage(acrs: AutomationClientRepo[]): slack.SlackMessage {
    return {
        text: `Found ${acrs.length} automation client`,
        attachments: acrs.map(acr => toAttachment(acr)),
    }
}

function toAttachment(acr: AutomationClientRepo): slack.Attachment {
    const repoDescription = `${acr.owner}/${acr.repo}`;
    const text = acr.branches.sort(byAutomationClientVersionDecreasing).map(toText).join("\n");
    const repoLink = `${acr.provider.url}/${acr.owner}/${acr.repo}`;
    return {
        fallback: "an automation client",
        title: repoDescription,
        title_link: repoLink,
        text,
    }
}

function toText(acb: AutomationClientBranch): string {
    const branchName = acb.isDefault ? // bold the default branch
        "*" + acb.branchName + "*" : acb.branchName;
    return `${branchName} ${acb.automationClientVersion}`
}

function byAutomationClientVersionDecreasing(acb1: AutomationClientBranch, acb2: AutomationClientBranch): number {
    const v1: string = acb1.automationClientVersion;
    const v2 = acb2.automationClientVersion;

    // These can be links. They don't have to be semver
    if (!semver.valid(v1) && !semver.valid(v2)) {
        // both are invalid. Compare them as strings
        return v1.localeCompare(v2);
    }
    if (!semver.valid(v1)) {
        return 1;
    }
    if (!semver.valid(v2)) {
        return -1;
    }

    return semver.rcompare(v1, v2)

}


function providerFromRepo(repo) {
    return (repo.org && repo.org.provider) ? repo.org.provider : {
        apiUrl: "https://api.github.com",
        url: "https://github.com",
    };
}

export const listAutomationClientsCommand: () => (HandleCommand<ListAutomationClientParameters>) =
    () => commandHandlerFrom(listAutomationClients,
        ListAutomationClientParameters,
        "ListAutomationClients",
        "list repositories containing automation clients",
        "list automation clients");