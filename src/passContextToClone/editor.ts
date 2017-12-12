
import { AddParameterRequirement } from "../typescriptEditing/AddParameterRequirement";
import { ImportIdentifier } from "../typescriptEditing/addImport";
import { Project } from "@atomist/automation-client/project/Project";
import { addParameterEdit, MySpecialEditReport, PerChangesetFunction } from "../typescriptEditing/editor";
import { FunctionCallIdentifier } from "../typescriptEditing/functionCallIdentifier";

const doNothing = () => Promise.resolve();

export function passContextToFunction(params: FunctionCallIdentifier,
                                      betweenChangesets: PerChangesetFunction = doNothing): (p: Project) => Promise<MySpecialEditReport> {
    return (p: Project) => {
        const handlerContextType: ImportIdentifier = {
            kind: "local",
            name: "HandlerContext",
            localPath: "src/HandlerContext",
        };
        const originalRequirement = new AddParameterRequirement({
            functionWithAdditionalParameter: params,
            parameterType: handlerContextType,
            parameterName: "context",
            populateInTests: {
                dummyValue: "{} as HandlerContext",
                additionalImport: handlerContextType,
            },
            why: "I want to use the context in here",
        });

        return addParameterEdit(originalRequirement, betweenChangesets)(p)
    }
}