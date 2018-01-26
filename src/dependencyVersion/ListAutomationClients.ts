import { commandHandlerFrom } from "@atomist/automation-client/onCommand";
import { Parameters } from "@atomist/automation-client/decorators";
import { HandleCommand, HandlerContext, HandlerResult, Secret, Secrets, success } from "@atomist/automation-client";
import * as graphql from "../typings/types";
import * as _ from "lodash";
import { doFingerprint } from "./FingerprintAutomationClientVersion";

@Parameters()
export class ListAutomationClientParameters {
    @Secret(Secrets.OrgToken) // read: repo
    public githubToken: string;
}

async function listAutomationClients(ctx: HandlerContext, params: ListAutomationClientParameters): Promise<HandlerResult> {
    const repos = await ctx.graphClient.executeQueryFromFile<graphql.ListAutomationClients.Query, {}>(
        "graphql/list");

    // for the first test, assume we have
    const acbs: AutomationClientBranch[] = await Promise.all(_.flatten(
        repos.Repo.map(oneRepo =>
            oneRepo.branches.map(branch => gatherAutomationClientiness(params.githubToken, oneRepo, branch)))));

    return ctx.messageClient.respond("Hello")
        .then(success)
}

interface AutomationClientBranch {
    repo: string,
    owner: string,
    provider: { url: string, apiUrl: string},
    sha: string,
    branchName: string,
    automationClientVersion: string; // might be NotAnAutomationClient
}

async function gatherAutomationClientiness(githubToken: string, repo: graphql.ListAutomationClients.Repo,
                                     branch: graphql.ListAutomationClients.Branches): Promise<AutomationClientBranch> {
    const where = { repo: repo.name, owner: repo.owner, provider: providerFromRepo(repo), sha: branch.commit.sha};
    const fingerprint = await doFingerprint(githubToken, where);
    return {

    }
}


function providerFromRepo(repo) {
    return (repo.org && repo.org.provider) ? repo.org.provider : {
        apiUrl: "https://api.github.com",
        url: "https://github.com",
    };
}

export const listAutomationClientsCommand: () => (HandleCommand<ListAutomationClientParameters>) =
    () => commandHandlerFrom(listAutomationClients,
        ListAutomationClientParameters, "ListAutomationClients", "list automation clients");