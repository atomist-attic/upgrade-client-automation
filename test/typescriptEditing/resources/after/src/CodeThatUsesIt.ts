
import { HandlerContext, logger } from "@atomist/automation-client";

// tslint:disable-next-line:no-namespace
namespace InHere {
    export function giveMeYourContext(context: HandlerContext, otherParams: any) {
        return "says me";
    }
}

export function exportedAndHasContextAlready(context: HandlerContext, moreStuff: string) {
    logger.info("stuff");
    return InHere.giveMeYourContext(context, {});
}

function doesNotYetHaveContext(context: HandlerContext, thing: string) {
    logger.info("stuff");
    const booger = InHere.giveMeYourContext(context, "yeah");
    return booger.toString();
}

function hasContextAlready(ctx: HandlerContext, moreStuff: string) {
    logger.info("stuff");
    return InHere.giveMeYourContext(ctx, {});
}

export function exportedDoesNotYetHaveContext(context: HandlerContext, ) {
    logger.info("stuff");
    const alsoItCallsItTwice = InHere.giveMeYourContext(context, {});
    logger.info("stuff");
    return InHere.giveMeYourContext(context, {});
}

function usesAFunctionThatDoesNotHaveContext(ctx: HandlerContext, blahblah: string) {
    const boo = doesNotYetHaveContext(ctx, blahblah);
    return "yes";
}

export function usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext(context: HandlerContext, hoodehoo: string) {
    const bar = exportedDoesNotYetHaveContext(context, );
    return "no";
}
