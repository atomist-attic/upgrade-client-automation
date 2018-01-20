import * as GraphQL from "@atomist/automation-client/graph/graphQL";
import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    Secret,
    Secrets,
    Tags,
} from "@atomist/automation-client/Handlers";
import { logger } from "@atomist/automation-client/internal/util/logger";
import * as slack from "@atomist/slack-messages/SlackMessages";
import { configuration } from "../atomist.config";
import * as graphql from "../typings/types";
import * as stringify from "json-stringify-safe";

import { Fingerprint, PushFingerprintWorld } from "./fingerprint";
import * as _ from "lodash";
import { GitHubFileWorld, RemoteFileLocation } from "./fetchOneFile";
import { adminChannel } from "../credentials";

export const AutomationClientVersionFingerprintName = "automation-client-version";

/**
 * This produces a fingerprint on a commit and passes it back to Atomist.
 *
 * A "fingerprint" is a small piece of data representing the essence of some important portion of the code.
 * In this case it's "the contents of the schema.idl"
 *
 * This handler looks at the new contents, takes their SHA, and pushes that to Atomist as a fingerprint.
 * Atomist then produces Impact events whenever the fingerprints are different as the result of a push.
 *
 * The SuggestSchemaDeploy event handler responds to those impact events.
 */
@EventHandler("Add fingerprint on schema change",
    GraphQL.subscriptionFromFile("graphql/push")) // look in graphql/push.idl to see the events we'll get
@Tags("graphql")
export class FingerprintAutomationClientVersion implements HandleEvent<graphql.PushForFingerprinting.Query> {

    @Secret(Secrets.OrgToken)
    public githubToken: string;

    public async handle(e: EventFired<graphql.PushForFingerprinting.Query>,
                        ctx: HandlerContext, params: this): Promise<HandlerResult> {
        logger.info(`Incoming event is %s`, JSON.stringify(e.data, null, 2));
        const push = e.data.Push[0];
        try {
            const repo = push.repo;
            const afterSha = push.after.sha;
            const provider = providerFromRepo(repo);

            // get the contents, and if that worked, then calculate a fingerprint and push it
            const packageLock: RemoteFileLocation = {
                owner: repo.owner,
                name: repo.name,
                baseUrl: provider.url,
                apiUrl: provider.apiUrl,
                path: "package-lock.json",
            };
            const plj = await GitHubFileWorld.fetchFileContents(params.githubToken, packageLock, afterSha);
            if (plj === 404) {
                return {
                    code: 0, message:
                        `no ${AutomationClientVersionFingerprintName} on ${repo.owner}/${repo.name}#${afterSha}`,
                }
            }
            const fingerprint = {
                name: AutomationClientVersionFingerprintName, sha: calculateFingerprint(plj),
            };
            await PushFingerprintWorld.pushFingerprint({
                provider: provider.url,
                owner: repo.owner, repo: repo.name, sha: afterSha,
            }, fingerprint);

            return {
                code: 0, message:
                    `reported fingerprint ${stringify(fingerprint)} on ${repo.owner}/${repo.name}#${afterSha}`,
            };
        } catch (error) {
            return reportFailure(ctx, push, error);
        }
    }
}

function providerFromRepo(repo) {
    return (repo.org && repo.org.provider) ? repo.org.provider : {
        apiUrl: "https://api.github.com",
        url: "https://github.com",
    };
}

function reportFailure(ctx: HandlerContext,
                       push: graphql.PushForFingerprinting.Push, error: Error): Promise<HandlerResult> {
    const report = `Failure fingerprinting ${push.repo.owner}/${push.repo.name}#${push.after.sha}

${error.message}
`;
    return ctx.messageClient.addressChannels(report, adminChannel)
        .then(() => ({ code: 1, error }))
}

export function calculateFingerprint(jpl: string): string {
    const dependencyOfInterest = JSON.parse(jpl).dependencies["@atomist/automation-client"];
    if (dependencyOfInterest) {
        return dependencyOfInterest.version
    } else {
        return "NONE";
    }
}
