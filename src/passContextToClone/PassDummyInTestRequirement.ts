import { Project } from "@atomist/automation-client/project/Project";
import { emptyReport, Report, reportImplemented } from "./Report";

import { AddImport } from "./manipulateImports";
import * as _ from "lodash";
import {
    FunctionCallIdentifier,
    functionCallPathExpression,
    qualifiedName,
    sameFunctionCallIdentifier,
} from "./functionCallIdentifier";
import { Requirement } from "./TypescriptEditing";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { LocatedTreeNode } from "@atomist/automation-client/tree/LocatedTreeNode";


export class PassDummyInTestsRequirement extends Requirement {
    public readonly kind: "Pass Dummy In Tests" = "Pass Dummy In Tests";

    public functionWithAdditionalParameter: FunctionCallIdentifier;
    public dummyValue: string;
    public additionalImport?: AddImport.ImportIdentifier;

    constructor(params: {
        functionWithAdditionalParameter: FunctionCallIdentifier,
        dummyValue: string,
        additionalImport?: AddImport.ImportIdentifier,
        why?: any
    }) {
        super(params.why);
        this.functionWithAdditionalParameter = params.functionWithAdditionalParameter;
        this.dummyValue = params.dummyValue;
        this.additionalImport = params.additionalImport;
    }

    public sameRequirement(other: Requirement): boolean {
        return isPassDummyInTests(other) &&
            sameFunctionCallIdentifier(this.functionWithAdditionalParameter, other.functionWithAdditionalParameter)
    }

    public describe() {
        return `Pass dummy value to ${qualifiedName(this.functionWithAdditionalParameter)} in tests`

    }
}


export function isPassDummyInTests(r: Requirement): r is PassDummyInTestsRequirement {
    return r.kind === "Pass Dummy In Tests";
}



/*
* Implementation: find all the calls in the test sources and pass a dummy argument
*/
export function passDummyInTests(project: Project, requirement: PassDummyInTestsRequirement): Promise<Report> {
    return findMatches(project, TypeScriptES6FileParser, "test*/**/*.ts",
        functionCallPathExpression(requirement.functionWithAdditionalParameter))
        .then(matches => {
            if (matches.length === 0) {
                return []; // it's valid for there to be no changes
            } else {
                matches.map(functionCall => {
                    // TODO: replace the open paren token instead, it's cuter
                    const newValue = functionCall.$value.replace(
                        new RegExp(requirement.functionWithAdditionalParameter.name + "\\s*\\(", "g"),
                        `${requirement.functionWithAdditionalParameter.name}(${requirement.dummyValue}, `);
                    functionCall.$value = newValue;

                });
                return _.uniq(matches.map(m => (m as LocatedTreeNode).sourceLocation.path));
            }
        })
        .then(filesChanged => project.flush().then(() => filesChanged))
        .then(filesChanged => {
            if (filesChanged.length === 0) {
                return emptyReport
            } else {
                const addImportTo = requirement.additionalImport ? filesChanged : [];
                return Promise.all(addImportTo
                    .map(f => {
                        return AddImport.addImport(project, f, requirement.additionalImport)
                    }))
                    .then(() => reportImplemented(requirement));
            }
        })
}

