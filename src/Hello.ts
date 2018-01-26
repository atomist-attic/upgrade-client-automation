import { MappedParameter } from "@atomist/automation-client/decorators";
import { Success } from "@atomist/automation-client/HandlerResult";
import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    MappedParameters,
    Tags,
} from "@atomist/automation-client/Handlers";
import { logger } from "@atomist/automation-client/internal/util/logger";
import * as child_process from "child_process"
import * as appRoot from "app-root-path";
import { adminUser } from "./credentials";

const packageJson = require(`${appRoot.path}/package.json`);

@CommandHandler("Sends a hello back to the invoking user/channel", "hello upgrade-client-automation")
@Tags("hello")
export class HelloWorld implements HandleCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public slackUser: string;

    public handle(ctx: HandlerContext, params: this): Promise<HandlerResult> {
        logger.info(`Incoming parameter was ${params.slackUser}`);

        return describeLocal().then(provenance =>
            ctx.messageClient.respond({
                text: `Hello, ${params.slackUser}!`
                , attachments: [{
                    fallback: "local provenance",
                    footer: provenance,
                }],
            })).then(() => Success);
    }

}

export function describeLocal(): Promise<string> {
    return Promise.all(
        [execufy("git rev-parse HEAD", "(no sha)"),
            execufy("git diff-index --quiet HEAD --", " (:dirty:)"),
            execufy("hostname", "an unknown host"),
            adminUser]).then(values => {
        const [sha, dirty, host, adminGitHubLogin] = values;
        return Promise.resolve(
            `this message brought to you by ${packageJson.name}:${
                packageJson.version} running on ${host} at ${sha}${dirty} as ${adminGitHubLogin}`);
    });
}

function execufy(cmd: string, errorResult: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child_process.exec(cmd, (error, stdout: string, stderr: string) => {
            if (error) {
                console.log(`stderr from ${cmd}: ${stderr}`);
                resolve(errorResult);
            } else {
                resolve(stdout);
            }
        });
    });
}