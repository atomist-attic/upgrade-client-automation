import { successOn } from "@atomist/automation-client/action/ActionResult";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { ReviewRouter } from "@atomist/automation-client/operations/review/reviewerToCommand";
import { ReviewComment } from "@atomist/automation-client/operations/review/ReviewResult";
import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import { deepLink } from "@atomist/automation-client/util/gitHub";
import * as slack from "@atomist/slack-messages";
import { Attachment, SlackMessage } from "@atomist/slack-messages";

/**
 * ReviewRouter that messages to client
 * @param {ProjectReview} pr
 * @param params
 * @param {string} title
 * @param {HandlerContext} ctx
 * @return {Promise<ActionResult<RepoRef>>}
 * @constructor
 */
export const MessagingReviewRouter: ReviewRouter<any> =
    (pr, params, title, ctx) => {
        const msg: SlackMessage = {
            text: `*${title} on ${pr.repoId.owner}/${pr.repoId.repo}*`,
            attachments: pr.comments.map(c => reviewCommentToAttachment(pr.repoId as GitHubRepoRef, c)),
        };
        return ctx.messageClient.respond(msg)
            .then(() => successOn(pr.repoId));
    };

function reviewCommentToAttachment(grr: GitHubRepoRef, rc: ReviewComment): Attachment {
    console.log("Is there a fix? " + rc.fix && rc.fix.command);
    const cuteDragonite = "https://pm1.narvii.com/6636/0d896a7f3b19c15af2b3b7736299f9cb1d42f20e_128.jpg";
    return {
        color: "#a01f05",
        author_name: rc.category,
        author_icon: cuteDragonite,
        text: linkToRepo(grr) + ": " + rc.detail,
        mrkdwn_in: ["text"],
        fallback: "error",
        actions: !!rc.fix ? [
            buttonForCommand({text: "Fix"}, rc.fix.command, rc.fix.params),
        ] : [],
    };
}

function linkToRepo(grr: GitHubRepoRef): string {
    return slack.url(`https://github.com/${grr.owner}/${grr.repo}`,
        `${grr.owner}/${grr.repo}`)

}