import { usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext } from "./CodeThatUsesIt";
import { HandlerContext } from "@atomist/automation-client";

function andEvenMoreStuff(context: HandlerContext, ) {
    return usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext(context, "andThings");
}