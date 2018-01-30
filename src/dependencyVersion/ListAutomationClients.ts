import { commandHandlerFrom } from "@atomist/automation-client/onCommand";
import { Parameters } from "@atomist/automation-client/decorators";
import {
    HandleCommand, HandlerContext, HandlerResult, logger, Secret, Secrets,
    success,
} from "@atomist/automation-client";
import * as graphql from "../typings/types";
import {
    AutomationClientVersionFingerprintName, determineFingerprint,
    NotAnAutomationClient,
} from "./FingerprintAutomationClientVersion";
import * as slack from "@atomist/slack-messages/SlackMessages";
import * as semver from "semver";
import * as _ from "lodash";
import { NpmWorld } from "./latestVersionFromNpm";
import { adminChannel } from "../credentials";
import * as stringify from "json-stringify-safe";
import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import { UpgradeAutomationClientLibraryCommandName, UpgradeAutomationClientLibraryEditor } from "./UpdateVersionEditor";


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
    const acrs: AutomationClientRepo[] = await Promise.all(
        repos.filter(reposToIgnore).map(r => analyseRepo(params.githubToken, r)));

    const relevant = acrs.filter(acr => acr.isAutomationClient);

    const targetVersion = await NpmWorld.latestVersion("@atomist/automation-client");

    await spy(ctx, acrs);

    return ctx.messageClient.respond(constructMessage(targetVersion, relevant))
        .then(success);
}

function reposToIgnore(r: graphql.ListAutomationClients.Repo): boolean {
    return r.owner !== "scratches"; // not sure why these are linked but I don't care about them
}

async function spy(ctx: HandlerContext, acrs:  AutomationClientRepo[]) {
    const reposes = acrs.map(ar => `${ar.owner}/${ar.repo}`).sort().join("\n");
    return ctx.messageClient.addressChannels("Looking for automation clients in:\n" + reposes , adminChannel)
}


async function analyseRepo(githubToken: string, repo: graphql.ListAutomationClients.Repo): Promise<AutomationClientRepo> {
    const allBranches = await
        Promise.all(
            repo.branches.map(branch =>
                gatherAutomationClientiness(githubToken, repo, branch)));
    const branchesWithAutomationClient = allBranches.filter(b =>
        b.automationClientVersion !== NotAnAutomationClient);
    return {
        isAutomationClient: branchesWithAutomationClient.length > 0,
        repo: repo.name,
        owner: repo.owner,
        provider: providerFromRepo(repo),
        branches: branchesWithAutomationClient,
    }
}

interface AutomationClientBranch {
    sha: string,
    branchName: string,
    automationClientVersion: string; // might be NotAnAutomationClient
    isDefault: boolean,
    isRunning: boolean,
}

interface AutomationClientRepo {
    isAutomationClient: boolean,
    repo: string,
    owner: string,
    provider: { url: string, apiUrl: string },
    branches: AutomationClientBranch[];
};

async function gatherAutomationClientiness(githubToken: string, repo: graphql.ListAutomationClients.Repo,
                                           branch: graphql.ListAutomationClients.Branches): Promise<AutomationClientBranch> {
    try {
        const where = { repo: repo.name, owner: repo.owner, provider: providerFromRepo(repo), sha: branch.commit.sha };
        const existingFingerprint = _.get(branch, "commit.fingerprints", [])
            .find(f => f.name === AutomationClientVersionFingerprintName);
        console.log("existing fingerprint: " + stringify(existingFingerprint));
        const fingerprint = existingFingerprint || await determineFingerprint(githubToken, where);
        return {
            sha: branch.commit.sha,
            branchName: branch.name,
            automationClientVersion: fingerprint.sha,
            isDefault: branch.name === repo.defaultBranch,
            isRunning: _.get(branch, "commit.apps", []).length > 0,
        }

    } catch (err) {
        logger.warn("Could not get automation client version: " + err);
        return {
            sha: _.get(branch, "commit.sha", "???"),
            branchName: branch ? branch.name : "???",
            automationClientVersion: NotAnAutomationClient,
            isDefault: false,
            isRunning: false,
        }
    }
}

function constructMessage(targetVersion: string, acrs: AutomationClientRepo[]): slack.SlackMessage {
    const text = `Found ${acrs.length} automation client` + (acrs.length === 1 ? "" : "s") +
        `\nThe latest version of @atomist/automation-client is ` + targetVersion;
    return {
        text,
        attachments: acrs.sort(byName).map(acr => toAttachment(targetVersion, acr)).slice(0, 25), // Slack only allows so many
    }
}

function byName(acr1: AutomationClientRepo, acr2: AutomationClientRepo): number {
    return acr1.repo.localeCompare(acr2.repo);
}

function toAttachment(targetVersion: string,
                      acr: AutomationClientRepo): slack.Attachment {
    const repoDescription = `${acr.owner}/${acr.repo}`;
    const repoLink = `${acr.provider.url}/${acr.owner}/${acr.repo}`;
    const text = acr.branches.sort(byAutomationClientVersionDecreasing)
        .map(b => toText(repoLink, b)).join("\n");
    const defaultBranch = acr.branches.find(b => b.isDefault)
    const color = (defaultBranch && defaultBranch.automationClientVersion === targetVersion) ?
        "#609930" : "#bb2030";

    return {
        fallback: "an automation client",
        title: repoDescription,
        title_link: repoLink,
        color,
        text,
        actions: [
            buttonForCommand({ text: "Upgrade" },
                UpgradeAutomationClientLibraryCommandName,
                {
                    "targets.repo": acr.repo,
                    "targets.owner": acr.owner,
                })]
    }
}

function toText(repoLink: string, acb: AutomationClientBranch): string {
    const prefix = acb.isRunning ? ":running: " : "";
    const branchName = acb.isDefault ? // bold the default branch
        "*" + acb.branchName + "*" :
        slack.url(repoLink + "/tree/" + acb.branchName, acb.branchName);
    const versionName = acb.automationClientVersion.startsWith("http") ?
        "(custom)" : acb.automationClientVersion;
    return `${prefix}${branchName} ${versionName}`
}

function byAutomationClientVersionDecreasing(acb1: AutomationClientBranch, acb2: AutomationClientBranch): number {
    const v1: string = acb1.automationClientVersion;
    const v2 = acb2.automationClientVersion;

    // These can be links. They don't have to be semver
    if (!semver.valid(v1) && !semver.valid(v2)) {
        // both are invalid. Compare them as strings for deterministicness.
        // but prioritize defaultBranch being first
        return acb1.isDefault ? -1 : acb2.isDefault ? 1 : v1.localeCompare(v2);
    }
    if (!semver.valid(v1)) {
        return 1;
    }
    if (!semver.valid(v2)) {
        return -1;
    }

    const semverComparison = semver.rcompare(v1, v2);
    if (semverComparison === 0) {
        // list the default branch first, if it's otherwise the same
        return acb1.isDefault ? -1 : acb2.isDefault ? 1 : 0;
    }
    return semverComparison;
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