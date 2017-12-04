import { HandlerContext } from "@atomist/automation-client";
import { usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext } from "./CodeThatUsesIt";

function andEvenMoreStuff(context: HandlerContext, ) {
    return usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext(context, "andThings");
}