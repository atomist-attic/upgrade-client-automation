import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Secret,
    Secrets, Tags,
} from "@atomist/automation-client";
import { runCommand } from "@atomist/automation-client/action/cli/commandLine";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { PullRequest } from "@atomist/automation-client/operations/edit/editModes";
import { editRepo } from "@atomist/automation-client/operations/support/editorUtils";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { isLocalProject } from "@atomist/automation-client/project/local/LocalProject";
import { Project } from "@atomist/automation-client/project/Project";
import { getLastReleasedVersionFromChangelog, populateChangelog } from "./editor";
import { CachingDirectoryManager } from "@atomist/automation-client/spi/clone/CachingDirectoryManager";

const SemanticVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+$/;

@CommandHandler("Update the CHANGELOG in preparation for a release", "prepare release")
export class BeginReleaseParameters {
    @Parameter({
        pattern: SemanticVersionPattern,
        description: "Next version, like 1.2.3",
    })
    public nextVersion: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repository: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @Secret(Secrets.UserToken)
    public githubToken: string;
}

@CommandHandler("Update the CHANGELOG in preparation for a release", "prepare release")
export class BeginReleaseHandler implements HandleCommand<BeginReleaseParameters> {

    public freshParametersInstance() {
        return new BeginReleaseParameters();
    }

    public handle(context: HandlerContext, params: BeginReleaseParameters): Promise<any> {
        const clone = GitCommandGitProject.cloned(
            { token: params.githubToken },
            new GitHubRepoRef(params.owner, params.repository), {}, CachingDirectoryManager);

        const releaseDate = formatDate(new Date());
        const pullRequest = new PullRequest("prep-" + params.nextVersion,
            "Prepare CHANGELOG for " + params.nextVersion);

        return clone.then(project =>
            getLastReleasedVersionFromChangelog(project)
                .then(oldVersion => runGitLog(project, oldVersion))
                .then(commitSummaries =>
                    // fetch the log
                    editRepo(context, project,
                        populateChangelog(params.nextVersion, releaseDate, commitSummaries),
                        pullRequest)))
            .catch(err => context.messageClient.respond("Sad day, but I have failed. " + err)
                .then(() => Promise.reject(err)));
    }
}

function formatDate(d: Date): string {
    // why is this so hard.
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + (d.getDay() + 1);
}

function runGitLog(p: Project, oldVersion: string): Promise<string[]> {
    if (isLocalProject(p)) {
        return runCommand(`git log --pretty="%s" ${oldVersion}...HEAD`, { cwd: p.baseDir })
            .then(result => result.stdout.split("\n"));
    } else {
        logger.warn("Unable to run git log on a nonlocal project");
        return Promise.resolve([]);
    }
}
