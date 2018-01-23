import { MessageOptions } from "@atomist/automation-client/spi/message/MessageClient";
import { SlackMessage } from "@atomist/slack-messages/SlackMessages";
import { HandlerContext } from "@atomist/automation-client";

export class FakeContext {

    public responses: (string | SlackMessage)[] = [];

    public messageClient = {
        respond: (msg: string | SlackMessage, options?: MessageOptions): Promise<any> => {
            this.responses.push(msg);
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
    }

}
export function fakeContext() : HandlerContext & FakeContext {
    return new FakeContext() as HandlerContext & FakeContext;
}
