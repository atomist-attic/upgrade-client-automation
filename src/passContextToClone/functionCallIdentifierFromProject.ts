
import { Project } from "@atomist/automation-client/project/Project";
import { FunctionCallIdentifier, functionCallIdentifierFromTreeNode, PathExpression } from "./functionCallIdentifier";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";

import { TreeNode } from "@atomist/tree-path/TreeNode";

export function functionCallIdentifierFromProject(project: Project,
                                                  filePath: string,
                                                  pxe: PathExpression): Promise<FunctionCallIdentifier> {
    return findMatches(project, TypeScriptES6FileParser, filePath, pxe)
        .then(mm => {
            const m = requireExactlyOne(mm, pxe);
            return functionCallIdentifierFromTreeNode(m);
        })
}

function requireExactlyOne(m: TreeNode[], msg: string): TreeNode {
    if (!m || m.length != 1) {
        throw new Error(msg)
    }
    return m[0];
}


export function methodInClass(className: string, methodName: string): PathExpression {
    return `//ClassDeclaration[/Identifier[@value='${className}']]//MethodDeclaration[/Identifier[@value='${methodName}']]`;
}