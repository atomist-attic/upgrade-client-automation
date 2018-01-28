import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { Project } from "@atomist/automation-client/project/Project";
import { logger } from "@atomist/automation-client";
import * as _ from "lodash";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { TreeNode } from "@atomist/tree-path/TreeNode";

export function printStructureOfFile(project: Project, path: string,
                              howToPrint: (s: string) => void = s => logger.info(s)) {
    return findMatches(project, TypeScriptES6FileParser, path,
        `/SourceFile`)
        .then(matches => {
            if (matches.length === 0) {
                logger.info("no matches found!");
            }
            matches.forEach(m => {
                howToPrint(printMatch(m).join("\n"));
            });
        });
}

export function printMatch(m: TreeNode): string[] {
    let me = m.$name + "/";
    if (!m.$children) {
        me = m.$name + " = " + m.$value;
    }
    const myBabies = _.flatMap(m.$children, ch => printMatch(ch).map(o => " " + o));
    return [me].concat(myBabies);
}