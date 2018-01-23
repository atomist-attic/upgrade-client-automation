import { commandHandlerFrom } from "@atomist/automation-client/onCommand";
import { Parameters } from "@atomist/automation-client/decorators";
import { HandleCommand, HandlerContext, HandlerResult, success } from "@atomist/automation-client";

@Parameters()
export class ListAutomationClientParameters {

}

function listAutomationClients(ctx: HandlerContext): Promise<HandlerResult> {
    return ctx.messageClient.respond("Hello")
        .then(success)
}


export const listAutomationClientsCommand: () => (HandleCommand<ListAutomationClientParameters>) =
    () => commandHandlerFrom(listAutomationClients,
        ListAutomationClientParameters, "ListAutomationClients", "list automation clients");