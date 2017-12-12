
import { HandlerContext, logger } from "@atomist/automation-client";

namespace InHere {
    export function giveMeYourContext(otherParams: any) {
        return "says me";
    }
}

export function exportedAndHasContextAlready(context: HandlerContext, moreStuff: string) {
    logger.info("stuff");
    return InHere.giveMeYourContext({});
}

function doesNotYetHaveContext(thing: string) {
    logger.info("stuff");
    const booger = InHere.giveMeYourContext("yeah");
    return booger.toString();
}

function hasContextAlready(ctx: HandlerContext, moreStuff: string) {
    logger.info("stuff");
    return InHere.giveMeYourContext({});
}

export function exportedDoesNotYetHaveContext() {
    logger.info("stuff");
    const alsoItCallsItTwice = InHere.giveMeYourContext({});
    logger.info("stuff");
    return InHere.giveMeYourContext({});
}

function usesAFunctionThatDoesNotHaveContext(ctx: HandlerContext, blahblah: string) {
    const boo = doesNotYetHaveContext(blahblah);
    return "yes";
}

export function usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext(hoodehoo: string) {
    const bar = exportedDoesNotYetHaveContext();
    return "no";
}
