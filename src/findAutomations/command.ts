import { ReviewerCommandDetails, } from "@atomist/automation-client/operations/review/reviewerToCommand";
import { ProjectReviewer } from "@atomist/automation-client/operations/review/projectReviewer";
import {
    Fix, ProjectReview, ReviewComment,
    ReviewResult,
} from "@atomist/automation-client/operations/review/ReviewResult";
import {
    HandleCommand,
    HandlerContext,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import { Project } from "@atomist/automation-client/project/Project";
import { SmartParameters } from "@atomist/automation-client/SmartParameters";
import {
    BaseEditorOrReviewerParameters,
    EditorOrReviewerParameters,
} from "@atomist/automation-client/operations/common/params/BaseEditorOrReviewerParameters";
import { Parameters } from "@atomist/automation-client/decorators";
import { GitBranchRegExp } from "@atomist/automation-client/operations/common/params/gitHubPatterns";
import { GitHubTargetsParams } from "@atomist/automation-client/operations/common/params/GitHubTargetsParams";
import { MessagingReviewRouter } from "./messagingReviewRouter";
import { PackageJson } from "../npmScripts/editor";
import { commandHandlerFrom, OnCommand } from "@atomist/automation-client/onCommand";
import { RepoFinder } from "@atomist/automation-client/operations/common/repoFinder";
import { reviewAll } from "@atomist/automation-client/operations/review/reviewAll";
import { andFilter } from "@atomist/automation-client/operations/common/repoFilter";
import { CommandInvocationProvenance, dmTheAdmin, ProvenanceParameters } from "../npmScripts/repositoryOperationsInfra";
import * as npmScripts from "../npmScripts/command";
import { ProjectOperationCredentials } from "@atomist/automation-client/operations/common/ProjectOperationCredentials";


const lookForClientDep: ProjectReviewer = (p: Project, context: HandlerContext) => {
    const emptyReview: ProjectReview = { repoId: p.id, comments: [] };
    const fix: Fix = {
        command: npmScripts.commandName,
        params: {
            "targets.repo": p.id.repo,
            "targets.owner": p.id.owner,
        },
    };
    return p.findFile("package.json")
        .then(f => f.getContent()
                .then(content => JSON.parse(content) as PackageJson)
                .then(json => {
                    if (json.dependencies && json.dependencies["@atomist/automation-client"]) {
                        const comment: ReviewComment = {
                            severity: "info",
                            category: "found one",
                            detail: json.dependencies["@atomist/automation-client"],
                            fix,
                        };
                        return {
                            repoId: p.id, comments: [comment],
                        };
                    } else {
                        return emptyReview;
                    }
                }),
            findFileError => emptyReview)
        .catch(error => {
            const comment: ReviewComment = {
                severity: "error",
                category: "package.json",
                detail: error.toString(),
            };
            return {
                repoId: p.id, comments: [comment],
            }
        });
};

/**
 * Parameters with fallback
 */
@Parameters()
export class UnleashPhilParameters extends BaseEditorOrReviewerParameters
    implements SmartParameters, ProvenanceParameters {

    public provenance: CommandInvocationProvenance;

    constructor() {
        super(new FallbackReposParameters());
        this.provenance = new CommandInvocationProvenance;
    }

    public bindAndValidate() {
        const targets = this.targets as FallbackReposParameters;
        if (!targets.repo) {
            if (!targets.repos) {
                throw new Error("Must set repos or repo");
            }
            console.log("Harmonizing regex");
            targets.repo = targets.repos;
        }
    }

}

/**
 * Resolve from a Mapped parameter or from a supplied repos regex if not found
 */
export class FallbackReposParameters extends GitHubTargetsParams {

    @MappedParameter(MappedParameters.GitHubOwner, false)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository, false)
    public repo: string;

    @Parameter({ description: "Branch or ref. Defaults to 'master'", ...GitBranchRegExp, required: false })
    public sha: string;

    @Parameter({ description: "regex", required: false })
    public repos: string = ".*";

}


const detailsToUse = {
    description: "Notice every node project that depends on @atomist/automation-client",
    intent: "find automation clients",
    tags: ["node", "automation-client"],
    reviewRouter: MessagingReviewRouter,
};

const commandName = "FindAutomationClients";

const reviewHandleMethod =
    handleReviewOneOrMany((params) => lookForClientDep, commandName, detailsToUse);


const doAllTheThings: OnCommand =
    (ctx: HandlerContext, parameters: UnleashPhilParameters) => {
        return reviewHandleMethod(ctx, parameters)
            .then((result: ReviewResult) => {
                return dmTheAdmin(ctx, parameters, {
                    commandName,
                    success: result.code === 0,
                    message: "Looks legit, " + result.projectsReviewed + " projects reviewed",
                }).then(() => result)
            }, (error) => {
                return dmTheAdmin(ctx, parameters, {
                    commandName,
                    success: false,
                    error,
                }).then(() => Promise.reject(error))
            })
    };


export const findAutomationClientsCommand: HandleCommand =
    commandHandlerFrom(doAllTheThings,
        UnleashPhilParameters,
        commandName,
        detailsToUse.description, detailsToUse.intent, detailsToUse.tags);


// I copied this because it isn't exported
/**
 * If owner and repo are required, review just one repo. Otherwise review all repos
 * in the present team
 */
function handleReviewOneOrMany<PARAMS extends EditorOrReviewerParameters>(reviewerFactory: (params: PARAMS) => ProjectReviewer<PARAMS>,
                                                                          name: string,
                                                                          details: ReviewerCommandDetails<PARAMS>) {
    return (ctx: HandlerContext, parameters: PARAMS): Promise<ReviewResult> => {
        const credentials: ProjectOperationCredentials = parameters.targets.credentials;
        const repoFinder: RepoFinder = parameters.targets.repoRef ?
            () => Promise.resolve([parameters.targets.repoRef]) :
            details.repoFinder;
        return reviewAll(ctx, credentials, reviewerFactory(parameters), parameters,
            repoFinder,
            andFilter(parameters.targets.test, details.repoFilter),
            !!details.repoLoader ? details.repoLoader(parameters) : undefined)
            .then(projectReviews => {
                return Promise.all(projectReviews
                    .filter(pr => pr.comments.length > 0)
                    .map(pr => {
                        return details.reviewRouter(pr, parameters, name, ctx);
                    }))
                    .then(persisted =>
                        ctx.messageClient.respond(
                            `${name} reviewed ${projectReviews.length} repositories: Reported on ${persisted.length} with problems`)
                            .then(() => ({
                                code: 0,
                                projectsReviewed: projectReviews.length,
                                projectReviews,
                            })));
            });
    };
}
