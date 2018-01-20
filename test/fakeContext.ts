import { MessageOptions } from "@atomist/automation-client/spi/message/MessageClient";
import { SlackMessage } from "@atomist/slack-messages/SlackMessages";
import { HandlerContext } from "@atomist/automation-client";

export function fakeContext() : HandlerContext {
    return {
        messageClient: {
            respond: (msg: string | SlackMessage, options?: MessageOptions): Promise<any> => {
                return Promise.resolve()
            },
            addressUsers: (msg: string | SlackMessage,
                           userNames: string | string[], options?: MessageOptions): Promise<any> => {
                return Promise.resolve()
            },
            addressChannels: (msg: string | SlackMessage,
                              channelNames: string | string[],
                              options?: MessageOptions): Promise<any> => {
                return Promise.resolve()
            },
        },
    } as HandlerContext;
}
