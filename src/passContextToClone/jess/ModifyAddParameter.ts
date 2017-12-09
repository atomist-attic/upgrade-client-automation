import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { Project } from "@atomist/automation-client/project/Project";
import { TreeNode } from "@atomist/tree-path/TreeNode";
import * as _ from "lodash";
import { logger } from "@atomist/automation-client";

/*
 * To run this while working:
 *
 * cd src/passContextToClone/
 * watch "ts-node jess/ModifyAddParameter.ts" jess
 *
 * and then push alt-cmd-Y in IntelliJ on AddParameter.ts to refresh it
 *
 * next:
 */

function printStructureOfFile(project: Project, path: string) {
    return findMatches(project, TypeScriptES6FileParser, path,
        `/SourceFile`)
        .then(matches => {
            if (matches.length === 0) {
                console.log("no matches found!")
            }
            matches.forEach(m => {
                console.log(printMatch(m).join("\n"));
            })
        });
}

function printMatch(m: TreeNode): string[] {
    let me = m.$name + "/";
    if (!m.$children) {
        me = m.$name + " = " + m.$value;
    }
    const myBabies = _.flatMap(m.$children, ch => printMatch(ch).map(o => " " + o));
    return [me].concat(myBabies);
}

const inputProject = new NodeFsLocalProject(null,
    "/Users/jessitron/code/atomist/upgrade-client-automation/src/passContextToClone/");

const fileOfInterest = "AddParameter.ts";
const pathExpression = "/SourceFile//TypeAliasDeclaration/";

function delineateMatches() {
    return inputProject.findFile(fileOfInterest)
        .then(f => f.replace(/\/\* \[[0-9\/]+] ->? \*\//g, ""))
        .then(f => f.replace(/\/\* <?->? \*\//g, ""))
        .then(() => inputProject.flush())
        .then(() => findMatches(inputProject, TypeScriptES6FileParser,
            fileOfInterest,
            pathExpression))
        .then(mm => {
            const n = mm.length;
            mm.forEach((m, i) => {
                m.$value = `/* [${i}/${n}] -> */` + m.$value + "/* <- */"
            })
        }).then(() => inputProject.flush())
}

function reallyEdit() {
    return findMatches(inputProject, TypeScriptES6FileParser,
        fileOfInterest,
        pathExpression,
    ).then(
        mm => {
            console.log("found " + mm.length + " matches");
            mm.forEach(m => console.log(m.$value))
        });
}


(logger as any).level = "warn";
console.log("where");
console.log("basedir: " + inputProject.baseDir);
inputProject.findFile(fileOfInterest)
    .then(() => printStructureOfFile(inputProject, fileOfInterest))
    .then(() => delineateMatches())
    .then(() => reallyEdit())
    .then(() => {logger.warn("DONE")});
