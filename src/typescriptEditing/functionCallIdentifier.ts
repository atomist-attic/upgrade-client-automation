import { LocatedTreeNode } from "@atomist/automation-client/tree/LocatedTreeNode";
import { evaluateExpression } from "@atomist/tree-path/path/expressionEngine";
import { TreeNode } from "@atomist/tree-path/TreeNode";

export interface FunctionCallIdentifier {
    enclosingScope?: EnclosingScope;
    name: string;
    filePath: string;
    access: Access;
}

export type PathExpression = string;

export type Access = PublicFunctionAccess | PrivateFunctionAccess | PrivateMethodAccess | PublicMethodAccess;

export interface PublicFunctionAccess {
    kind: "PublicFunctionAccess";
}

export interface PrivateFunctionAccess {
    kind: "PrivateFunctionAccess";
}

export interface PublicMethodAccess {
    kind: "PublicMethodAccess";
}

export interface PrivateMethodAccess {
    kind: "PrivateMethodAccess";
}

export function isPublicMethodAccess(scope: Access): scope is PublicMethodAccess {
    return scope.kind === "PublicMethodAccess";
}

export function isPublicFunctionAccess(scope: Access): scope is PublicFunctionAccess {
    return scope.kind === "PublicFunctionAccess";
}

export function isPrivateMethodAccess(scope: Access): scope is PrivateMethodAccess {
    return scope.kind === "PrivateMethodAccess";
}

export function globFromAccess(fci: FunctionCallIdentifier) {
    if (isPublicFunctionAccess(fci.access)) {
        return "**/*.ts";
    } else {
        return fci.filePath;
    }
}

/*
 * Scope
 */
export function qualifiedName(fci: FunctionCallIdentifier) {
    return qualify(fci.enclosingScope, fci.name);
}

function qualify(s: EnclosingScope, soFar: string): string {
    if (s === undefined) {
        return soFar;
    }
    return qualify(s.enclosingScope, s.name + "." + soFar);
}

export type EnclosingScope = ClassAroundMethod | EnclosingNamespace;

export interface ClassAroundMethod {
    kind: "class around method";
    name: string;
    exported: boolean;
    enclosingScope?: EnclosingScope;
}

export interface EnclosingNamespace {
    kind: "enclosing namespace";
    name: string;
    exported: boolean;
    enclosingScope?: EnclosingScope;

}

export function isClassAroundMethod(es: EnclosingScope): es is ClassAroundMethod {
    return es.kind === "class around method";
}

function isSameScope(s1: EnclosingScope, s2: EnclosingScope): boolean {
    if (s1 === undefined && s2 === undefined) {
        return true;
    }
    return s1.kind === s2.kind && s1.name === s2.name && isSameScope(s1.enclosingScope, s2.enclosingScope);
}

export function sameFunctionCallIdentifier(r1: FunctionCallIdentifier, r2: FunctionCallIdentifier) {
    return r1.name === r2.name &&
        r1.filePath === r2.filePath &&
        isSameScope(r1.enclosingScope, r2.enclosingScope);
}

export function functionDeclarationPathExpression(fn: FunctionCallIdentifier): PathExpression {
    const identification = `[/Identifier[@value='${fn.name}']]`;
    const methodOrFunction = fn.enclosingScope && isClassAroundMethod(fn.enclosingScope) ? "MethodDeclaration" : "FunctionDeclaration";

    return pathExpressionIntoScope(fn.enclosingScope) + "//" + methodOrFunction + identification;
}

export function pathExpressionIntoScope(scope: EnclosingScope): PathExpression {
    const components = scopePathExpressionComponents(scope);
    return components.length === 0 ? "" : "//" + components.join("//");
}

function scopePathExpressionComponents(s: EnclosingScope, soFar: string[] = []): string[] {
    if (s === undefined) {
        return soFar;
    }
    const component = isClassAroundMethod(s) ?
        `ClassDeclaration[/Identifier[@value='${s.name}']]` :
        `ModuleDeclaration[/Identifier[@value='${s.name}']]/ModuleBlock`;
    return [component].concat(soFar);
}

export function functionCallPathExpression(fn: FunctionCallIdentifier) {
    if (isPrivateMethodAccess(fn.access)) {
        // this should be the last identifier in the PropertyAccessExpression, but I don't know how to express that
        return `//CallExpression[/PropertyAccessExpression/Identifier[@value='${fn.name}']]`;
    }
    if (fn.enclosingScope) {
        return `//CallExpression[/PropertyAccessExpression[@value='${propertyAccessExpression(fn.enclosingScope, fn.name)}']]`;
    }
    return localFunctionCallPathExpression(fn.name);
}

function propertyAccessExpression(s: EnclosingScope, soFar: string): string {
    if (s === undefined) {
        return soFar;
    }
    return propertyAccessExpression(s.enclosingScope, s.name + "." + soFar);
}

export function localFunctionCallPathExpression(name: string): PathExpression {
    return `//CallExpression[/Identifier[@value='${name}']]`;
}

function identifier(parent: TreeNode): string {
    return childrenNamed(parent, "Identifier")[0].$value;
}

function childrenNamed(parent: TreeNode, name: string) {
    return parent.$children.filter(child => child.$name === name);
}

function isNamespaceModule(tn: TreeNode): boolean {
    return tn.$children.some(c => c.$name === "ModuleBlock");
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
                    exported: true, // TODO: really check
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
                        exported: true, // TODO: really check
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

export function functionCallIdentifierFromTreeNode(functionDeclaration: TreeNode): FunctionCallIdentifier {
    const filePath = (functionDeclaration as LocatedTreeNode).sourceLocation.path;
    const enclosingFunctionName = identifier(functionDeclaration);
    return {
        enclosingScope: determineScope(functionDeclaration),
        name: enclosingFunctionName, filePath,
        access: determineAccess(functionDeclaration),
    };
}

function determineAccess(fnDeclaration: TreeNode): Access {
    const access: Access = hasKeyword(fnDeclaration, "ExportKeyword") ?
        { kind: "PublicFunctionAccess" } :
        hasKeyword(fnDeclaration, "PrivateKeyword") || hasKeyword(fnDeclaration, "ProtectedKeyword") ?
            { kind: "PrivateMethodAccess" } :
            hasKeyword(fnDeclaration, "PublicKeyword") ?
                { kind: "PublicMethodAccess" } :
                { kind: "PrivateFunctionAccess" };
    return access;
}

function hasKeyword(fnDeclaration: TreeNode, astElement: string): boolean {
    const keywordExpression = `/SyntaxList/${astElement}`;
    const ekm = evaluateExpression(fnDeclaration, keywordExpression);
    return ekm && ekm.length && true;
}
