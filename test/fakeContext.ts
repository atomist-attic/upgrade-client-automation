import { MessageOptions } from "@atomist/automation-client/spi/message/MessageClient";
import { SlackMessage } from "@atomist/slack-messages/SlackMessages";
import { HandlerContext } from "@atomist/automation-client";

export class FakeContext {

    constructor(public graphs: { [key: string]: any }) {
    }

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

    public graphClient = {
        executeQueryFromFile: (path: string) => {
            if (!this.graphs[path]) {
                throw new Error("I don't know what to return for " + path)
            }
            return this.graphs[path];
        }
    }

}
export function fakeContext(graphs: { [key: string]: any } = {}) : HandlerContext & FakeContext {
    return new FakeContext(graphs) as HandlerContext & FakeContext;
}
