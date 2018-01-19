
import * as cfenv from "cfenv";

const appEnv = cfenv.getAppEnv();

const webhookCreds = appEnv.getServiceCreds("atomist-webhook");

export const atomistWebhookUrl = webhookCreds ? webhookCreds.url : "https://webhook.atomist.com/atomist";

export const adminChannel = "upgrade-automation";