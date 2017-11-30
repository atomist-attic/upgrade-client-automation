
import { HandlerContext, logger } from "@atomist/automation-client";

namespace InHere {
    export function giveMeYourContext(otherParams: any) {
        return "says me";
    }
}

export function hasContextAlready(context: HandlerContext, moreStuff: string) {
    logger.info("stuff");
    return InHere.giveMeYourContext({});
}

function doesNotYetHaveContext(thing: string) {
    logger.info("stuff");
    const booger = InHere.giveMeYourContext("yeah")
    return booger.toString();
}

export function exportedDoesNotYetHaveContext() {
    logger.info("stuff");
    logger.info("stuff");
    return InHere.giveMeYourContext({});
}