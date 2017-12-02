import { GitHubNameRegExp } from "@atomist/automation-client/operations/common/params/gitHubPatterns";
import {
    CommandHandler, HandleCommand, HandlerContext, MappedParameter, MappedParameters, Parameter, Secret,
    Secrets,
} from "@atomist/automation-client";
import { MySpecialEditReport, passContextToFunction } from "./editor";
import { editOne } from "@atomist/automation-client/operations/edit/editAll";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import stringify = require("json-stringify-safe");
import { EditMode, PullRequest } from "@atomist/automation-client/operations/edit/editModes";

const saveUpgradeToGitHub: EditMode = new PullRequest("upgrade-to-0-5",
    "Pass context in to anything that clones");


@CommandHandler("Upgrade to 0.5.0, compensating for breaking changes", "pass context to clone")
export class UpgradeTo0_5 implements HandleCommand {

    @Secret(Secrets.userToken(["repo", "user"]))
    public githubToken: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;


    public handle(ctx: HandlerContext, params: this): Promise<void> {
        const editor = passContextToFunction({
            name: "GitCommandGitProject.cloned",
            filePath: "src/project/git/GitCommandGitProject.ts",
        });

        return editOne(ctx, { token: params.githubToken }, editor, saveUpgradeToGitHub
            , new GitHubRepoRef(params.owner, params.repo))
            .then(result => {
                    const report = (result as MySpecialEditReport).addParameterReport;
                    if (!report) {
                        ctx.messageClient.respond("I didn't get my report back, dangit. ");
                        console.log("Edit Result: " + stringify(result));
                    } else {
                        const more = report.unimplemented.length === 0 ? "" : ` Unable to implement these: ` +
                            report.unimplemented.map(m => stringify(m, null, 2)).join("\n");
                        // really I need to put this on the PR
                        return ctx.messageClient.respond("Whew. I did a thing." + more)
                    }
                });


    }

}