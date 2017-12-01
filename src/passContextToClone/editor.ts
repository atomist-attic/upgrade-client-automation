/*
 * Copyright © 2017 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { EditResult, SimpleProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import { doWithFiles } from "@atomist/automation-client/project/util/projectUtils";
import { editorHandler } from "@atomist/automation-client/operations/edit/editorToCommand";
import { BaseEditorParameters } from "@atomist/automation-client/operations/edit/BaseEditorParameters";
import { BranchCommit, PullRequest } from "@atomist/automation-client/operations/edit/editModes";
import { HandleCommand, logger } from "@atomist/automation-client";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";

import { evaluateExpression } from "@atomist/tree-path/path/expressionEngine";
import stringify = require("json-stringify-safe");
import { isSuccessResult } from "@atomist/tree-path/path/pathExpression";
import { TreeNode } from "@atomist/tree-path/TreeNode";
import * as _ from "lodash";
import Requirement = AddParameter.Requirement;

const saveUpgradeToGitHub: BranchCommit = {
    branch: "pass-context-to-clone-atomist",
    message: "in tests, pass a dummy context.",
};

export const upgradeTo0_5 = (): HandleCommand =>
    editorHandler(() => sendDummyContextInTests,
        BaseEditorParameters,
        "upgrade code using automation-client to 0.5", {
            editMode: saveUpgradeToGitHub,
            intent: "upgrade code for automation-client 0.5",
        });

export function passContextToFunction(functionWeWant: string): (p: Project) => Promise<AddParameter.Report> {
    return (p: Project) => {
        const originalRequirement: Requirement = {
            kind: "Add Parameter",
            functionWithAdditionalParameter: functionWeWant,
            parameterType: "HandlerContext",
            parameterName: "context",
        };
        return AddParameter.findConsequences(p, originalRequirement).then((consequences: Requirement[]) => {
            const originalRequirementInArray: Requirement[] = [originalRequirement];
            const reqs = originalRequirementInArray.concat(consequences);
            logger.info("Requirements: " + stringify(reqs, null, 2));
            return implementInSequenceWithFlushes(p, reqs);
        });
    }
}

function implementInSequenceWithFlushes(project: Project, activities: AddParameter.Requirement[]) {
    console.log("implementing " + activities.length + " requirements: " + stringify(activities, null, 1));
    return activities.reduce(
        (pp: Promise<AddParameter.Report>, r1: Requirement) => pp
            .then(report => AddParameter.implement(project, r1)
                .then((report1) => project.flush()
                    .then(() => AddParameter.combine(report, report1)))),
        Promise.resolve(AddParameter.emptyReport));
}

export namespace AddParameter {

    export interface Unimplemented {
        requirement: Requirement,
        message: string,
    }

    export interface Report {
        unimplemented: Unimplemented[]
    }

    export const emptyReport: Report = {
        unimplemented: [],
    };

    function reportUnimplemented(requirement: Requirement, message: string): Report {
        return {
            unimplemented: [{ requirement, message }],
        }
    }

    export function combine(report1: Report, report2: Report): Report {
        return {
            unimplemented: report1.unimplemented.concat(report2.unimplemented),
        }
    }

    export type FunctionIdentifier = string;

    export type Requirement = AddParameterRequirement | PassArgumentRequirement

    export interface AddParameterRequirement {
        kind: "Add Parameter";
        functionWithAdditionalParameter: FunctionIdentifier;
        parameterType: string;
        parameterName: string;
    }

    function isAddParameterRequirement(r: Requirement): r is AddParameterRequirement {
        return r.kind === "Add Parameter";
    }

    export interface PassArgumentRequirement {
        kind: "Pass Argument"
        enclosingFunction: FunctionIdentifier,
        functionWithAdditionalParameter: FunctionIdentifier;
        argumentName: string
    }

    export function findConsequences(project: Project, requirement: AddParameterRequirement): Promise<Requirement[]> {

        const innerExpression = `//CallExpression[/PropertyAccessExpression[@value='${requirement.functionWithAdditionalParameter}']]`;

        return findMatches(project, TypeScriptES6FileParser, "CodeThatUsesIt.ts",
            `//FunctionDeclaration[${innerExpression}]`)
            .then(matches => {
                console.log("FOUND nodes: " + matches.length);
                return _.flatMap(matches, enclosingFunction => {
                    const enclosingFunctionName = childrenNamed(enclosingFunction, "Identifier")[0].$value;

                    logger.info("File is: " + (enclosingFunction as any).sourceFile.fileName); // this is part of location too
                    const parameterExpression = `/SyntaxList/Parameter[/TypeReference[@value='${requirement.parameterType}']]/Identifier`;
                    const suitableParameterMatches = evaluateExpression(enclosingFunction, parameterExpression);
                    if (isSuccessResult(suitableParameterMatches) && suitableParameterMatches.length > 0) {
                        const identifier = suitableParameterMatches[0];
                        // If these are locatable tree nodes, I could include a line number in the instruction!
                        logger.info("Found a call to %s inside a function called %s, with parameter %s",
                            requirement.functionWithAdditionalParameter, enclosingFunctionName, identifier.$value);
                        const instruction: PassArgumentRequirement = {
                            kind: "Pass Argument",
                            enclosingFunction: enclosingFunctionName,
                            functionWithAdditionalParameter: requirement.functionWithAdditionalParameter,
                            argumentName: identifier.$value,
                        };
                        return [instruction];
                    } else {
                        logger.info("Found a call to %s inside a function called %s, no suitable parameter",
                            requirement.functionWithAdditionalParameter, enclosingFunctionName);
                        return [{
                            kind: "Add Parameter",
                            functionWithAdditionalParameter: enclosingFunctionName,
                            parameterType: requirement.parameterType,
                            parameterName: requirement.parameterName,
                        } as AddParameterRequirement,
                            {
                                kind: "Pass Argument",
                                enclosingFunction: enclosingFunctionName,
                                functionWithAdditionalParameter: requirement.functionWithAdditionalParameter,
                                argumentName: requirement.parameterName,
                            } as PassArgumentRequirement];
                    }
                });
            })
    }

    export function implement(project: Project, requirement: Requirement): Promise<Report> {
        logger.info("Implementing: " + stringify(requirement));
        if (isAddParameterRequirement(requirement)) {
            return addParameter(project, requirement);
        } else {
            return passArgument(project, requirement);
        }
    }

    function passArgument(project: Project, requirement: PassArgumentRequirement): Promise<Report> {
        const innerExpression = `//CallExpression[/PropertyAccessExpression[@value='${requirement.functionWithAdditionalParameter}']]`;
        const enclosingFunctionExpression = `/Identifier[@value='${requirement.enclosingFunction}'`;

        const fullPathExpression = `//FunctionDeclaration[${enclosingFunctionExpression}]][${innerExpression}]`

        return findMatches(project, TypeScriptES6FileParser, "CodeThatUsesIt.ts", // TODO: get filename
            fullPathExpression)
            .then(matches => {
                console.log("FOUND nodes: " + matches.length);
                if (matches.length === 0) {
                    logger.warn("No matches for " + fullPathExpression + " in " + project.findFileSync("CodeThatUsesIt.ts").getContentSync());
                    return reportUnimplemented(requirement, "Function not found");
                } else {
                    matches.map(enclosingFunction => {
                        console.log(enclosingFunction.$name + ": " + enclosingFunction.$value);
                        console.log(enclosingFunction.$children.map(child => child.$name + "=" + child.$value).join(", "));
                        console.log("is it: " + (enclosingFunction as any).SyntaxList.$value);

                        const newValue = enclosingFunction.$value.replace(
                            new RegExp(requirement.functionWithAdditionalParameter + "\\s*\\(", "g"),
                            requirement.functionWithAdditionalParameter + `(${requirement.argumentName}, `);
                        enclosingFunction.$value = newValue;
                    });
                    return emptyReport;
                }
            });
    }

    function pathExpressionToFunctionDeclaration(fn: FunctionIdentifier): string {

        const declarationOfInterest = `/Identifier[@value='${fn}'`;
        const functionDeclarationExpression = `//FunctionDeclaration[${declarationOfInterest}]]`;

        return functionDeclarationExpression
    }

    function addParameter(project: Project, requirement: AddParameterRequirement): Promise<Report> {

        const functionDeclarationExpression = pathExpressionToFunctionDeclaration(requirement.functionWithAdditionalParameter);
        return findMatches(project, TypeScriptES6FileParser, "CodeThatUsesIt.ts", // TODO: get filename
            functionDeclarationExpression)
            .then(matches => {
                if (matches.length === 0) {
                    logger.warn("Found 0 function declarations called " + requirement.functionWithAdditionalParameter);
                    return reportUnimplemented(requirement, "Function declaration not found");
                } else if (1 < matches.length) {
                    logger.warn("Doing Nothing; Found more than one function declaration called " + requirement.functionWithAdditionalParameter);
                    return reportUnimplemented(requirement, "More than one function declaration matched. I'm confused.")
                } else {
                    const enclosingFunction = matches[0];
                    const enclosingFunctionName = childrenNamed(enclosingFunction, "Identifier")[0].$value;

                    const newValue = enclosingFunction.$value.replace(
                        new RegExp(enclosingFunctionName + "\\s*\\(", "g"),
                        `${enclosingFunctionName}(${requirement.parameterName}: ${requirement.parameterType}, `);
                    enclosingFunction.$value = newValue;
                    return emptyReport;
                }
            });
    }

    function childrenNamed(parent: TreeNode, name: string) {
        return parent.$children.filter(child => child.$name === name);
    }

}


export const sendDummyContextInTests: SimpleProjectEditor = (p: Project) => {
    return doWithFileContent(p, "test/**/*.ts", content => {
        return content.replace(/GitCommandGitProject.cloned\(/g,
            "GitCommandGitProject.cloned({} as HandlerContext, ")
    });
};

function doWithFileContent(p: Project, glob: string, manipulation: (content: string) => string) {
    return doWithFiles(p, "test/**/*.ts", f => {
        return f.getContent()
            .then(content =>
                f.setContent(manipulation(content)),
            )
    });
}
