import { AddMigrationRequirement } from "./AddMigrationRequirement";
import { Requirement } from "./TypescriptEditing";

import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { combineConsequences, concomitantChange, Consequences, emptyConsequences } from "./Consequences";

import { TreeNode } from "@atomist/tree-path/TreeNode";

import { logger } from "@atomist/automation-client";
import { Project } from "@atomist/automation-client/project/Project";
import { MatchResult } from "@atomist/automation-client/tree/ast/FileHits";
import { LocatedTreeNode } from "@atomist/automation-client/tree/LocatedTreeNode";
import { evaluateExpression } from "@atomist/tree-path/path/expressionEngine";
import { isSuccessResult } from "@atomist/tree-path/path/pathExpression";
import {
    addImport, BuiltIn, externalImportLocation, ImportIdentifier, isBuiltIn, isLibraryImport,
    LibraryImport,
} from "./addImport";
import {
    FunctionCallIdentifier, functionCallIdentifierFromTreeNode, functionCallPathExpression,
    functionDeclarationPathExpression, globFromAccess, isPublic,
    isPublicFunctionAccess, isPublicMethodAccess, qualifiedName,
    sameFunctionCallIdentifier,
} from "./functionCallIdentifier";
import { PassArgumentRequirement } from "./PassArgumentRequirement";
import { PassDummyInTestsRequirement } from "./PassDummyInTestRequirement";
import { emptyReport, Report, reportImplemented, reportUnimplemented } from "./Report";
import { printMatch } from "../jess/printMatchStructure";
import * as stringify from "json-stringify-safe";


export class AddParameterRequirement extends Requirement {
    public readonly kind: "Add Parameter" = "Add Parameter";

    public functionWithAdditionalParameter: FunctionCallIdentifier;
    public parameterType: ImportIdentifier;
    public parameterName: string;
    public populateInTests?: {
        dummyValue: string;
        additionalImport?: ImportIdentifier;
    };
    public readonly external: boolean;

    constructor(params: {
        functionWithAdditionalParameter: FunctionCallIdentifier,
        parameterType: ImportIdentifier,
        parameterName: string,
        populateInTests?: {
            dummyValue: string;
            additionalImport?: ImportIdentifier;
        },
        external?: boolean
        why?: any,
    }) {
        super(params.why);
        this.functionWithAdditionalParameter = params.functionWithAdditionalParameter;
        this.parameterType = params.parameterType;
        this.parameterName = params.parameterName;
        this.populateInTests = params.populateInTests;
        this.external = params.external || false;
    }

    public sameRequirement(other: Requirement): boolean {
        return isAddParameterRequirement(other) &&
            sameFunctionCallIdentifier(this.functionWithAdditionalParameter, other.functionWithAdditionalParameter) &&
            this.parameterName === other.parameterName;
    }

    public describe() {
        const r = this;
        return `Add parameter "${r.parameterName}: ${r.parameterType.name}" to ${qualifiedName(r.functionWithAdditionalParameter)}`;
    }

    public findConsequences(project: Project) {
        return findConsequencesOfAddParameter(project, this);
    }

    public implement(project: Project) {
        return implementAddParameter(project, this);
    }

    public downstream(project: Project): AddParameterRequirement {
        const downstreamParameterType: LibraryImport | BuiltIn =
            isLibraryImport(this.parameterType) || isBuiltIn(this.parameterType) ?
                this.parameterType :
                {
                    kind: "library",
                    name: this.parameterType.name,
                    location: this.parameterType.externalPath ||
                    externalImportLocation(project, this.parameterType.localPath),
                };

        return new AddParameterRequirement({
            functionWithAdditionalParameter: this.functionWithAdditionalParameter,
            parameterType: downstreamParameterType,
            parameterName: this.parameterName,
            populateInTests: this.populateInTests,
            external: true,
        });
    }

    public isExternallyFacing() {
        return isPublic(this.functionWithAdditionalParameter.access)
    }
}

export function isAddParameterRequirement(r: Requirement): r is AddParameterRequirement {
    return r.kind === "Add Parameter";
}

function findConsequencesOfAddParameter(project: Project, requirement: AddParameterRequirement): Promise<Consequences> {

    // someday: if the access is private to a class, then the pxe should be narrowed from above
    // also, imports should narrow from above too
    const innerExpression = functionCallPathExpression(requirement.functionWithAdditionalParameter);
    const callWithinFunction = `//FunctionDeclaration[${innerExpression}]`;
    const callWithinMethod = `//MethodDeclaration[${innerExpression}]`;
    logger.info("Looking for calls in : " + callWithinMethod);
    logger.info("Looking for calls in : " + callWithinFunction);
    logger.info("looking in: " + globFromAccess(requirement.functionWithAdditionalParameter));

    const testConsequences = isPublic(requirement.functionWithAdditionalParameter.access) &&
    requirement.populateInTests ?
        concomitantChange(new PassDummyInTestsRequirement({
            functionWithAdditionalParameter: requirement.functionWithAdditionalParameter,
            dummyValue: requirement.populateInTests.dummyValue,
            additionalImport: requirement.populateInTests.additionalImport,
        })) : emptyConsequences;
    const externalConsequences = requirement.isExternallyFacing() && !requirement.external ?
        concomitantChange(new AddMigrationRequirement(requirement.downstream(project), requirement))
        : emptyConsequences;
    const globalConsequences = combineConsequences(testConsequences, externalConsequences);

// in source, either find a parameter that fits, or receive it.
    return findMatches(project, TypeScriptES6FileParser, globFromAccess(requirement.functionWithAdditionalParameter),
        callWithinFunction + "|" + callWithinMethod)
        .then(matches => matches.reduce((cc, functionCallMatch) =>
                combineConsequences(cc, consequencesOfFunctionCall(requirement, functionCallMatch)),
            emptyConsequences))
        .then((srcConsequences: Consequences) => {
            return combineConsequences(srcConsequences, globalConsequences);
        });
}

export function consequencesOfFunctionCall(requirement: AddParameterRequirement,
                                           enclosingFunction: MatchResult): Consequences {

    const filePath = (enclosingFunction as LocatedTreeNode).sourceLocation.path;
    if (filePath.startsWith("test")) {
        return emptyConsequences;
    } // skip tests

    const enclosingFunctionName = identifier(enclosingFunction);

    const parameterExpression = `/SyntaxList/Parameter[/TypeReference[@value='${requirement.parameterType.name}']]/Identifier`;
    const suitableParameterMatches = evaluateExpression(enclosingFunction, parameterExpression);

    if (isSuccessResult(suitableParameterMatches) && suitableParameterMatches.length > 0) {
        const identifier = suitableParameterMatches[0];
        // these are locatable tree nodes, I can include a line number in the instruction! sourceLocation.lineFrom1
        logger.info("Found a call to %s inside a function called %s, with parameter %s",
            requirement.functionWithAdditionalParameter.name, enclosingFunctionName, identifier.$value);

        const instruction: PassArgumentRequirement = new PassArgumentRequirement({
            enclosingFunction: functionCallIdentifierFromTreeNode(enclosingFunction),
            functionWithAdditionalParameter: requirement.functionWithAdditionalParameter,
            argumentValue: identifier.$value,
            why: requirement.describe(),
        });
        return concomitantChange(instruction);
    } else {
        logger.info("Found a call to %s inside a function called %s, no suitable parameter",
            requirement.functionWithAdditionalParameter.name, enclosingFunctionName);

        const passArgument: PassArgumentRequirement = new PassArgumentRequirement({
            enclosingFunction: functionCallIdentifierFromTreeNode(enclosingFunction),
            functionWithAdditionalParameter: requirement.functionWithAdditionalParameter,
            argumentValue: requirement.parameterName,
            why: requirement.describe(),
        });
        const newParameterForMe: AddParameterRequirement = new AddParameterRequirement({
            functionWithAdditionalParameter: functionCallIdentifierFromTreeNode(enclosingFunction),
            parameterType: requirement.parameterType,
            parameterName: requirement.parameterName,
            populateInTests: requirement.populateInTests,
            why: passArgument.describe(),
        });
        return { concomitantChanges: [passArgument], prerequisiteChanges: [newParameterForMe] };
    }
}

function implementAddParameter(project: Project, requirement: AddParameterRequirement): Promise<Report> {
    if (requirement.external) {
        return Promise.resolve(emptyReport);
    }
    return addImport(project,
        requirement.functionWithAdditionalParameter.filePath,
        requirement.parameterType)
        .then(importAdded => {
            logger.info("Exercising path expression: " + functionDeclarationPathExpression(requirement.functionWithAdditionalParameter));
            return findMatches(project, TypeScriptES6FileParser, requirement.functionWithAdditionalParameter.filePath,
                functionDeclarationPathExpression(requirement.functionWithAdditionalParameter))
                .then(matches => {
                    if (matches.length === 0) {
                        logger.warn("Found 0 function declarations for " +
                            functionDeclarationPathExpression(requirement.functionWithAdditionalParameter) + " in " +
                            requirement.functionWithAdditionalParameter.filePath);
                        return reportUnimplemented(requirement, "Function declaration not found");
                    } else if (1 < matches.length) {
// tslint:disable-next-line:max-line-length
                        logger.warn("Doing Nothing; Found more than one function declaration at " + functionDeclarationPathExpression(requirement.functionWithAdditionalParameter));
                        return reportUnimplemented(requirement, "More than one function declaration matched. I'm confused.");
                    } else {
                        const functionDeclaration = matches[0];
                        const existingParameters = functionDeclaration.evaluateExpression("/SyntaxList/Parameter/Identifier");
                        if (existingParameters &&
                            existingParameters.length > 0 && (console.log("yo Jess:" + existingParameters[0].$value) || true) &&
                            existingParameters[0].$value === requirement.parameterName) {
                            return reportUnimplemented(requirement, "This is already the first parameter")
                        }
                        const openParen = requireExactlyOne(functionDeclaration.evaluateExpression("/OpenParenToken"),
                            "wtf where is open paren");

                        openParen.$value = `(${requirement.parameterName}: ${requirement.parameterType.name}, `;
                        return reportImplemented(requirement);
                    }
                });
        });
}

function requireExactlyOne<A>(m: TreeNode[], msg: string): TreeNode {
    if (!m || m.length != 1) {
        throw new Error(msg);
    }
    return m[0];
}

function identifier(parent: TreeNode): string {
    return childrenNamed(parent, "Identifier")[0].$value;
}

function childrenNamed(parent: TreeNode, name: string) {
    return parent.$children.filter(child => child.$name === name);
}
