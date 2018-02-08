
import * as cfenv from "cfenv";
import { ProjectOperationCredentials } from "@atomist/automation-client/operations/common/ProjectOperationCredentials";

const appEnv = cfenv.getAppEnv();

const webhookCreds = appEnv.getServiceCreds("atomist-webhook");

export const atomistWebhookUrl = webhookCreds ? webhookCreds.url : "https://webhook.atomist.com/atomist";

export const adminChannel = "upgrade-automation";

export const adminUser = ["jessitron", "jessica"];

export const teamId = "T29E48P34";

export const GitHubToken = process.env.GITHUB_TOKEN;

export const GitHubCredentials: ProjectOperationCredentials = {
    token: GitHubToken
}