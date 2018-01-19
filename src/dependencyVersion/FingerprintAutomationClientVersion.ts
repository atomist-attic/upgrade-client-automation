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

import { Fingerprint, pushFingerprint } from "./fingerprint";
import * as _ from "lodash";
import { fetchFileContents, RemoteFileLocation } from "./fetchOneFile";
import { adminChannel } from "../credentials";

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
export class NoticeSchemaChange implements HandleEvent<graphql.PushForFingerprinting.Query> {

    @Secret(Secrets.OrgToken)
    public githubToken: string;

    public handle(e: EventFired<graphql.PushForFingerprinting.Query>,
                  ctx: HandlerContext, params: this): Promise<HandlerResult> {
        logger.info(`Incoming event is %s`, JSON.stringify(e.data, null, 2));

        const push = e.data.Push[0];
        const repo = push.repo;
        const afterSha = push.after.sha;
        const beforeSha: string = _.get(push, "before.sha");
        const token = params.githubToken;
        const teamId = configuration.teamIds[0];
        const provider = (repo.org && repo.org.provider) ? repo.org.provider : {
            apiUrl: "https://api.github.com",
            url: "https://github.com",
        };


        // get the contents, and if that worked, then calculate a fingerprint and push it
        const packageLock: RemoteFileLocation = {
            owner: repo.owner,
            name: repo.name,
            baseUrl: provider.url,
            apiUrl: provider.apiUrl,
            path: "package-lock.json",
        };
        const contents = fetchFileContents(token, packageLock, afterSha);
        const pushedFingerprint: Promise<Fingerprint> = contents.then(plj => {
            if (plj === 404) {
                return Promise.resolve({ name: "lack of automation-client-version", sha: "" })
            } else {
                const version = calculateFingerprint(plj);
                const fingerprint = {
                    name: "automation-client-version", sha: version,
                };
                return pushFingerprint(teamId, {
                    provider: provider.url,
                    owner: repo.owner, repo: repo.name, sha: afterSha,
                }, fingerprint)
                    .then(() => fingerprint)
            }
        });

        // notify people if that didn't work.
        return pushedFingerprint
            .then(fingerprint => ({
                code: 0, message:
                    `reported fingerprint ${stringify(fingerprint)} on ${repo.owner}/${repo.name}#${afterSha}`,
            }), error => reportFailure(ctx, push, error))
    }
}

function reportFailure(ctx: HandlerContext, push: graphql.PushForFingerprinting.Push, error: Error) {
    const report = `Failure fingerprinting ${push.repo.owner}/${push.repo.name}#${push.after.sha}

${error.message}
`;
    return ctx.messageClient.addressChannels(report, adminChannel)
}

export function calculateFingerprint(jpl: string): string | null {
    const dependencyOfInterest = JSON.parse(jpl).dependencies["@atomist/automation-client"];
    if (dependencyOfInterest) {
        return dependencyOfInterest.version
    } else {
        return null;
    }
}
