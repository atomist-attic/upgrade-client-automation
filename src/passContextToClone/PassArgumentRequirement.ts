
import { logger } from "@atomist/automation-client";
import { Project } from "@atomist/automation-client/project/Project";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { MatchResult } from "@atomist/automation-client/tree/ast/FileHits";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import stringify = require("json-stringify-safe");
import {
    FunctionCallIdentifier, functionCallPathExpression, functionDeclarationPathExpression, qualifiedName,
    sameFunctionCallIdentifier,
} from "./functionCallIdentifier";
import { Report, reportImplemented, reportUnimplemented } from "./Report";
import { Requirement } from "./TypescriptEditing";

import { TreeNode } from "@atomist/tree-path/TreeNode";

export class PassArgumentRequirement extends Requirement {
    public readonly kind: "Pass Argument" = "Pass Argument";

    public enclosingFunction: FunctionCallIdentifier;
    public functionWithAdditionalParameter: FunctionCallIdentifier;
    public argumentValue: string;

    constructor(params: {
        enclosingFunction: FunctionCallIdentifier,
        functionWithAdditionalParameter: FunctionCallIdentifier,
        argumentValue: string,
        why?: any,
    }) {
        super(params.why);
        this.enclosingFunction = params.enclosingFunction;
        this.functionWithAdditionalParameter = params.functionWithAdditionalParameter;
        this.argumentValue = params.argumentValue;
    }

    public sameRequirement(other: Requirement): boolean {
        return isPassArgumentRequirement(other) &&
            sameFunctionCallIdentifier(this.functionWithAdditionalParameter, other.functionWithAdditionalParameter) &&
            sameFunctionCallIdentifier(this.enclosingFunction, other.enclosingFunction);
    }

    public describe() {
        const r = this;
        return `Pass argument "${r.argumentValue}" to ${qualifiedName(r.functionWithAdditionalParameter)} in ${qualifiedName(r.enclosingFunction)}`;
    }

    public implement(project: Project) {
        return passArgument(project, this);
    }
}

function passArgument(project: Project, requirement: PassArgumentRequirement): Promise<Report> {

    const fullPathExpression = functionDeclarationPathExpression(requirement.enclosingFunction) +
        functionCallPathExpression(requirement.functionWithAdditionalParameter);

    return findMatches(project,
        TypeScriptES6FileParser,
        requirement.enclosingFunction.filePath,
        fullPathExpression)
        .then(mm => applyPassArgument({ matches: mm, requirement }));
}

function applyPassArgument(parameters: { matches: MatchResult[], requirement: PassArgumentRequirement }): Report {
    const { matches, requirement } = parameters;
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

function requireExactlyOne(m: TreeNode[], msg: string): TreeNode {
    if (!m || m.length != 1) {
        throw new Error(msg);
    }
    return m[0];
}

export function isPassArgumentRequirement(r: Requirement): r is PassArgumentRequirement {
    return r.kind === "Pass Argument";
}
