import { Project } from "@atomist/automation-client/project/Project";
import { ImportIdentifier } from "../typescriptEditing/addImport";
import { AddParameterRequirement } from "../typescriptEditing/AddParameterRequirement";
import { applyRequirement, PerChangesetFunction } from "../typescriptEditing/editor";
import { EditResult, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import * as stringify from "json-stringify-safe";
import { logger } from "@atomist/automation-client";
import { Report } from "../typescriptEditing/Report";
import {
    functionCallIdentifierFromProject,
    methodInClass,
} from "../typescriptEditing/functionCallIdentifierFromProject";

const doNothing = () => Promise.resolve();


export interface MySpecialEditReport extends EditResult {
    addParameterReport: Report;
}



export function passContextToFunction(betweenChangesets: PerChangesetFunction = doNothing): (p: Project) => Promise<MySpecialEditReport> {
    return (p: Project) => functionCallIdentifierFromProject(p,
        "src/project/git/GitCommandGitProject.ts",
        methodInClass("GitCommandGitProject", "cloned"))
        .then(functionCallIdentifier => {
            const handlerContextType: ImportIdentifier = {
                kind: "local",
                name: "HandlerContext",
                localPath: "src/HandlerContext",
            };
            const originalRequirement = new AddParameterRequirement({
                functionWithAdditionalParameter: functionCallIdentifier,
                parameterType: handlerContextType,
                parameterName: "context",
                populateInTests: {
                    dummyValue: "{} as HandlerContext",
                    additionalImport: handlerContextType,
                },
                why: "I want to use the context in here",
            });

            return applyRequirement(originalRequirement, betweenChangesets)(p)
                .then(report => {
                    logger.info("Report: " + stringify(report, null, 2));
                    return {
                        ...successfulEdit(p, report.implemented.length > 0),
                        addParameterReport: report,
                    };
                });
        });
}
