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
import { Project } from "@atomist/automation-client/project/Project";
import { HandlerContext, logger } from "@atomist/automation-client";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";

import { evaluateExpression } from "@atomist/tree-path/path/expressionEngine";
import { isSuccessResult } from "@atomist/tree-path/path/pathExpression";
import { TreeNode } from "@atomist/tree-path/TreeNode";
import * as _ from "lodash";
import { MatchResult } from "@atomist/automation-client/tree/ast/FileHits";
import { EditResult, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import stringify = require("json-stringify-safe");
import { LocatedTreeNode } from "@atomist/automation-client/tree/LocatedTreeNode";
import { AddImport } from "./manipulateImports";
import FunctionCallIdentifier = AddParameter.FunctionCallIdentifier;


export interface MySpecialEditReport extends EditResult {
    addParameterReport: AddParameter.Report
}

export type BetweenFunction = (requirement: AddParameter.Requirement, report: AddParameter.Report) => Promise<void>
const doNothing = () => Promise.resolve();

export function passContextToFunction(params: FunctionCallIdentifier, betweenRequirements: BetweenFunction = doNothing): (p: Project) => Promise<MySpecialEditReport> {
    return (p: Project) => {
        const handlerContextType: AddImport.ImportIdentifier = {
            kind: "local",
            name: "HandlerContext",
            localPath: "src/HandlerContext",
        };
        const originalRequirement: AddParameter.Requirement = {
            kind: "Add Parameter",
            functionWithAdditionalParameter: params,
            parameterType: handlerContextType,
            parameterName: "context",
            populateInTests: {
                dummyValue: "{} as HandlerContext",
                additionalImport: handlerContextType,
            },
            why: "I want to use the context in here",
        };

        return AddParameter.findConsequences(p, [originalRequirement])
            .then(reqs => {
                logger.info("implementing " + reqs.length + " requirements: " + stringify(reqs, null, 1));
                return reqs
            })
            .then(reqs => implementInSequenceWithFlushes(p, reqs, betweenRequirements))
            .then(report => {
                logger.info("Report: " + stringify(report, null, 2));
                return {
                    ...successfulEdit(p, report.implemented.length > 0),
                    addParameterReport: report,
                }
            });
    }
}

function implementInSequenceWithFlushes(project: Project, activities: AddParameter.Requirement[],
                                        betweenRequirements: BetweenFunction) {
    return activities.reduce(
        (pp: Promise<AddParameter.Report>, r1: AddParameter.Requirement) => pp
            .then(allTheReportsFromBefore => AddParameter.implement(project, r1)
                .then((report1) => project.flush()
                    .then(() => betweenRequirements(r1, report1))
                    .then(() => AddParameter.combine(allTheReportsFromBefore, report1)))),
        Promise.resolve(AddParameter.emptyReport));
}

export namespace AddParameter {

    /*
     * Report is the output of attempting to implement requirements.
     */
    export interface Unimplemented {
        requirement: Requirement,
        message: string,
    }

    export interface Report {
        unimplemented: Unimplemented[]

        implemented: Requirement[]
    }

    export const emptyReport: Report = {
        unimplemented: [],
        implemented: [],
    };

    function reportUnimplemented(requirement: Requirement, message: string): Report {
        return {
            unimplemented: [{ requirement, message }],
            implemented: [],
        }
    }

    function reportImplemented(requirement: Requirement): Report {
        return {
            unimplemented: [],
            implemented: [requirement],
        }
    }

    export function combine(report1: Report, report2: Report): Report {
        return {
            unimplemented: report1.unimplemented.concat(report2.unimplemented),
            implemented: report1.implemented.concat(report2.implemented),
        }
    }


    /*
     * Requirements describe what we need to do
     */
    export type Requirement = AddParameterRequirement | PassArgumentRequirement | PassDummyInTestsRequirement

    export type EnclosingScope = ClassAroundMethod | EnclosingNamespace

    export interface ClassAroundMethod {
        kind: "class around method",
        name: string,
        exported: boolean,
        enclosingScope?: EnclosingScope
    }

    export interface EnclosingNamespace {
        kind: "enclosing namespace",
        name: string,
        exported: boolean,
        enclosingScope?: EnclosingScope
    }

    export function isClassAroundMethod(es: EnclosingScope): es is ClassAroundMethod {
        return es.kind === "class around method";
    }

    function isSameScope(s1: EnclosingScope, s2: EnclosingScope): boolean {
        if (s1 === undefined && s2 === undefined) {
            return true
        }
        return s1.kind === s2.kind && s1.name === s2.name && isSameScope(s1.enclosingScope, s2.enclosingScope)
    }

    export type FunctionCallIdentifier = {
        enclosingScope?: EnclosingScope,
        name: string, filePath: string
        access: Access
    };

    function sameFunctionCallIdentifier(r1: FunctionCallIdentifier, r2: FunctionCallIdentifier) {
        return r1.name === r2.name &&
            r1.filePath === r2.filePath &&
            isSameScope(r1.enclosingScope, r2.enclosingScope)
    }

    export function sameRequirement(r1: Requirement, r2: Requirement): boolean {
        return r1.kind === r2.kind &&
            sameFunctionCallIdentifier(r1.functionWithAdditionalParameter, r2.functionWithAdditionalParameter) &&
            r1.functionWithAdditionalParameter.filePath === r2.functionWithAdditionalParameter.filePath &&
            (!isPassArgumentRequirement(r1) ||
                sameFunctionCallIdentifier(r1.enclosingFunction, (r2 as PassArgumentRequirement).enclosingFunction))
    }

    export type Access = PublicFunctionAccess | PrivateFunctionAccess | PrivateMethodAccess

    export function globFromAccess(fci: FunctionCallIdentifier) {
        if (isPrivateFunctionAccess(fci.access)) {
            return fci.filePath;
        } else {
            return "**/*.ts"
        }
    }

    export interface PublicFunctionAccess {
        kind: "PublicFunctionAccess",
    }

    export interface PrivateMethodAccess {
        kind: "PrivateMethodAccess",
    }

    export type PathExpression = string;

    export interface PrivateFunctionAccess {
        kind: "PrivateFunctionAccess",
    }

    export function isPrivateFunctionAccess(scope: Access): scope is PrivateFunctionAccess {
        return scope.kind === "PrivateFunctionAccess";
    }

    export function isPublicFunctionAccess(scope: Access): scope is PublicFunctionAccess {
        return scope.kind === "PublicFunctionAccess";
    }

    export function isPrivateMethodAccess(scope: Access): scope is PrivateMethodAccess {
        return scope.kind === "PrivateMethodAccess";
    }

    export interface AddParameterRequirement {
        kind: "Add Parameter";
        functionWithAdditionalParameter: FunctionCallIdentifier;
        parameterType: AddImport.ImportIdentifier;
        parameterName: string;
        populateInTests: {
            dummyValue: string;
            additionalImport?: AddImport.ImportIdentifier;
        }
        why?: any;
    }

    export interface PassDummyInTestsRequirement {
        kind: "Pass Dummy In Tests";
        functionWithAdditionalParameter: FunctionCallIdentifier;
        dummyValue: string;
        additionalImport?: AddImport.ImportIdentifier;
        why?: any;
    }

    export interface PassArgumentRequirement {
        kind: "Pass Argument"
        enclosingFunction: FunctionCallIdentifier,
        functionWithAdditionalParameter: FunctionCallIdentifier;
        argumentValue: string;
        why?: any;
    }

    export function isAddDummyInTests(r: Requirement): r is PassDummyInTestsRequirement {
        return r.kind === "Pass Dummy In Tests";
    }

    export function isAddParameterRequirement(r: Requirement): r is AddParameterRequirement {
        return r.kind === "Add Parameter";
    }


    export function isPassArgumentRequirement(r: Requirement): r is PassArgumentRequirement {
        return r.kind === "Pass Argument";
    }

    /*
     * Requirements can have consequences, which are additional changes
     * that have to be implemented in order to implement this one.
     */
    export function findConsequencesOfOne(project: Project, requirement: Requirement): Promise<Requirement[]> {
        if (isAddParameterRequirement(requirement)) {
            logger.info("Finding consequences of: " + stringify(requirement, null, 1));
            return findConsequencesOfAddParameter(project, requirement).then(consequences => {
                logger.info("Found " + consequences.length + " consequences");
                return consequences.map(c => ({ ...c, why: requirement }))
            });
        } else {
            return Promise.resolve([]);
        }
    }

    export function findConsequences(project: Project, unchecked: Requirement[],
                                     checked: Requirement[] = []): Promise<Requirement[]> {
        if (unchecked.length === 0) {
            return Promise.resolve(checked);
        }
        const thisOne = unchecked.pop(); // mutation
        if (checked.some(o => sameRequirement(o, thisOne))) {
            logger.info("Already checked " + stringify(thisOne));
            return findConsequences(project, unchecked, checked);
        }
        return findConsequencesOfOne(project, thisOne).then(theseReqs => {
            checked.push(thisOne);
            return findConsequences(project, unchecked.concat(theseReqs), checked)
        });
    }

    function findConsequencesOfAddParameter(project: Project, requirement: AddParameterRequirement): Promise<Requirement[]> {
        const passDummyInTests: PassDummyInTestsRequirement = {
            kind: "Pass Dummy In Tests",
            functionWithAdditionalParameter: requirement.functionWithAdditionalParameter,
            dummyValue: requirement.populateInTests.dummyValue,
            additionalImport: requirement.populateInTests.additionalImport,
        };

        // someday: if the access is private to a class, then the pxe should be narrowed from above
        // also, imports should narrow from above too
        const innerExpression = functionCallPathExpression(requirement.functionWithAdditionalParameter);
        const callWithinFunction = `//FunctionDeclaration[${innerExpression}]`;
        const callWithinMethod = `//MethodDeclaration[${innerExpression}]`;
        logger.info("Looking for calls in : " + callWithinMethod);
        logger.info("Looking for calls in : " + callWithinFunction);
        logger.info("looking in: " + globFromAccess(requirement.functionWithAdditionalParameter));

        const globalConsequences = isPublicFunctionAccess(requirement.functionWithAdditionalParameter.access) ?
            [passDummyInTests] : [];

        // in source, either find a parameter that fits, or receive it.
        return findMatches(project, TypeScriptES6FileParser, globFromAccess(requirement.functionWithAdditionalParameter),
            callWithinFunction + "|" + callWithinMethod)
            .then(matches => _.flatMap(matches, enclosingFunction =>
                requirementsFromFunctionCall(requirement, enclosingFunction)))
            .then((srcConsequences: Requirement[]) => {
                return srcConsequences.concat(globalConsequences);
            });
    }

    function whereMightItBe(fci: FunctionCallIdentifier) {

    }

    function requirementsFromFunctionCall(requirement: AddParameterRequirement,
                                          enclosingFunction: MatchResult): Requirement[] {

        const filePath = (enclosingFunction as LocatedTreeNode).sourceLocation.path;
        if (filePath.startsWith("test")) {
            return [];
        } // skip tests

        const enclosingFunctionName = identifier(enclosingFunction);

        console.log("yo yo here is one: " + enclosingFunctionName);


        const parameterExpression = `/SyntaxList/Parameter[/TypeReference[@value='${requirement.parameterType.name}']]/Identifier`;
        const suitableParameterMatches = evaluateExpression(enclosingFunction, parameterExpression);


        if (isSuccessResult(suitableParameterMatches) && suitableParameterMatches.length > 0) {
            const identifier = suitableParameterMatches[0];
            // these are locatable tree nodes, I can include a line number in the instruction! sourceLocation.lineFrom1
            logger.info("Found a call to %s inside a function called %s, with parameter %s",
                requirement.functionWithAdditionalParameter, enclosingFunctionName, identifier.$value);

            const instruction: PassArgumentRequirement = {
                kind: "Pass Argument",
                enclosingFunction: {
                    enclosingScope: determineScope(enclosingFunction),
                    name: enclosingFunctionName, filePath,
                    access: determineAccess(enclosingFunction),
                },
                functionWithAdditionalParameter: requirement.functionWithAdditionalParameter,
                argumentValue: identifier.$value,
            };
            return [instruction];
        } else {
            logger.info("Found a call to %s inside a function called %s, no suitable parameter",
                requirement.functionWithAdditionalParameter, enclosingFunctionName);
            const passNewArgument: AddParameterRequirement = {
                kind: "Add Parameter",
                functionWithAdditionalParameter: {
                    enclosingScope: determineScope(enclosingFunction),
                    name: enclosingFunctionName, filePath,
                    access: determineAccess(enclosingFunction),
                },
                parameterType: requirement.parameterType,
                parameterName: requirement.parameterName,
                populateInTests: requirement.populateInTests,
            };
            const newParameterForMe: PassArgumentRequirement = {
                kind: "Pass Argument",
                enclosingFunction: {
                    enclosingScope: determineScope(enclosingFunction),
                    name: enclosingFunctionName, filePath,
                    access: determineAccess(enclosingFunction),
                },
                functionWithAdditionalParameter: requirement.functionWithAdditionalParameter,
                argumentValue: requirement.parameterName,
            };
            return [passNewArgument, newParameterForMe];
        }
    }

    function determineAccess(fnDeclaration: MatchResult): Access {
        const access: Access = hasKeyword(fnDeclaration, "ExportKeyword") ?
            { kind: "PublicFunctionAccess" } :
            hasKeyword(fnDeclaration, "PrivateKeyword") ?
                { kind: "PrivateMethodAccess" } :
                { kind: "PrivateFunctionAccess" };
        return access;
    }

    function hasKeyword(fnDeclaration: MatchResult, astElement: string): boolean {
        const keywordExpression = `/SyntaxList/${astElement}`;
        const ekm = evaluateExpression(fnDeclaration, keywordExpression);
        return ekm && ekm.length && true;
    }

    export function implement(project: Project, requirement: Requirement): Promise<Report> {
        logger.info("Implementing: " + stringify(requirement, null, 2));
        if (isAddParameterRequirement(requirement)) {
            return addParameter(project, requirement);
        }
        if (isAddDummyInTests(requirement)) {
            return passDummyInTests(project, requirement);
        }
        if (isPassArgumentRequirement(requirement)) {
            return passArgument(project, requirement);
        }
        return Promise.resolve(reportUnimplemented(requirement, "I don't know how to implement that yet"))
    }

    function propertyAccessExpression(s: EnclosingScope, soFar: string): string {
        if (s === undefined) {
            return soFar;
        }
        return propertyAccessExpression(s.enclosingScope, s.name + "." + soFar);
    }

    function functionCallPathExpression(fn: FunctionCallIdentifier) {
        if (isPrivateMethodAccess(fn.access)) {
            // this should be the last identifier, that is the fn.name, but I don't know how to express that
            return `//CallExpression[/PropertyAccessExpression/Identifier[@value='${fn.name}']]`;
        }
        if (fn.enclosingScope) {
            return `//CallExpression[/PropertyAccessExpression[@value='${propertyAccessExpression(fn.enclosingScope, fn.name)}']]`
        }
        return `//CallExpression[/Identifier[@value='${fn.name}']]`;
    }

    function passArgument(project: Project, requirement: PassArgumentRequirement): Promise<Report> {

        const fullPathExpression = functionDeclarationPathExpression(requirement.enclosingFunction) +
            functionCallPathExpression(requirement.functionWithAdditionalParameter);

        return findMatches(project,
            TypeScriptES6FileParser,
            requirement.enclosingFunction.filePath,
            fullPathExpression)
            .then(mm => applyPassArgument(mm, requirement));
    }

    function applyPassArgument(matches: MatchResult[], requirement: PassArgumentRequirement): Report {
        if (matches.length === 0) {
            logger.warn("No matches on " + stringify(requirement));
            return reportUnimplemented(requirement, "Function not found");
        } else {
            matches.map(enclosingFunction => {
                const openParen = requireExactlyOne(enclosingFunction.evaluateExpression("/OpenParenToken"),
                    "wtf where is open paren");
                openParen.$value = `(${requirement.argumentValue}, `;
            });
            return reportImplemented(requirement);
        }
    }

    function scopePathExpressionComponents(s: EnclosingScope, soFar: string[] = []): string[] {
        if (s === undefined) {
            return soFar;
        }
        const component = isClassAroundMethod(s) ?
            `ClassDeclaration[/Identifier[@value='${s.name}']]` :
            `ModuleDeclaration[/Identifier[@value='${s.name}']]/ModuleBlock`;
        return [component].concat(soFar)
    }

    function functionDeclarationPathExpression(fn: FunctionCallIdentifier): PathExpression {
        const identification = `[/Identifier[@value='${fn.name}']]`;
        const methodOrFunction = fn.enclosingScope && isClassAroundMethod(fn.enclosingScope) ? "MethodDeclaration" : "FunctionDeclaration";

        const components = scopePathExpressionComponents(fn.enclosingScope).concat([methodOrFunction + identification]);
        return "//" + components.join("//");
    }

    /*
    * Implementation: find all the calls in the test sources and pass a dummy argument
    */
    function passDummyInTests(project: Project, requirement: PassDummyInTestsRequirement): Promise<Report> {
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


    function addParameter(project: Project, requirement: AddParameterRequirement): Promise<Report> {
        return AddImport.addImport(project,
            requirement.functionWithAdditionalParameter.filePath,
            requirement.parameterType)
            .then(importAdded => {
                logger.info("Exercising path expression: " + functionDeclarationPathExpression(requirement.functionWithAdditionalParameter))
                return findMatches(project, TypeScriptES6FileParser, requirement.functionWithAdditionalParameter.filePath,
                    functionDeclarationPathExpression(requirement.functionWithAdditionalParameter))
                    .then(matches => {
                        if (matches.length === 0) {
                            logger.warn("Found 0 function declarations for " +
                                functionDeclarationPathExpression(requirement.functionWithAdditionalParameter) + " in " +
                                requirement.functionWithAdditionalParameter.filePath);
                            return reportUnimplemented(requirement, "Function declaration not found");
                        } else if (1 < matches.length) {
                            logger.warn("Doing Nothing; Found more than one function declaration at " + functionDeclarationPathExpression(requirement.functionWithAdditionalParameter));
                            return reportUnimplemented(requirement, "More than one function declaration matched. I'm confused.")
                        } else {
                            const functionDeclaration = matches[0];
                            const openParen = requireExactlyOne(functionDeclaration.evaluateExpression("/OpenParenToken"),
                                "wtf where is open paren");

                            openParen.$value = `(${requirement.parameterName}: ${requirement.parameterType.name}, `;
                            return reportImplemented(requirement);
                        }
                    })
            });
    }

    function requireExactlyOne(m: TreeNode[], msg: string): TreeNode {
        if (!m || m.length != 1) {
            throw new Error(msg)
        }
        return m[0];
    }

    function identifier(parent: TreeNode): string {
        return childrenNamed(parent, "Identifier")[0].$value
    }

    function childrenNamed(parent: TreeNode, name: string) {
        return parent.$children.filter(child => child.$name === name);
    }


    export function determineScope(tn: TreeNode, topLevel?: EnclosingScope, baseScope?: EnclosingScope): EnclosingScope | undefined {
        if (!tn.$parent) {
            return baseScope;
        } else {
            switch (tn.$parent.$name) {
                case "ClassDeclaration":
                    const thisLevel: ClassAroundMethod = {
                        kind: "class around method",
                        name: identifier(tn.$parent),
                        exported: true // TODO: really check
                    };
                    if (topLevel) {
                        topLevel.enclosingScope = thisLevel;
                    }
                    return determineScope(tn.$parent, thisLevel, baseScope || thisLevel);
                case "ModuleDeclaration":
                    if (isNamespaceModule(tn.$parent)) {
                        const thisLevel: EnclosingNamespace = {
                            kind: "enclosing namespace",
                            name: identifier(tn.$parent),
                            exported: true // TODO: really check
                        };
                        if (topLevel) {
                            topLevel.enclosingScope = thisLevel;
                        }
                        return determineScope(tn.$parent, thisLevel, baseScope || thisLevel);
                    } // else fall through
                default:
                    // nothing interesting at this level
                    return determineScope(tn.$parent, topLevel, baseScope);
            }
        }
    }

    function isNamespaceModule(tn: TreeNode): boolean {
        return tn.$children.some(c => c.$name === "ModuleBlock")
    }


}

