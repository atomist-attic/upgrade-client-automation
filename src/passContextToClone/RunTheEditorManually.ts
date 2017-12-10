import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import * as stringify from "json-stringify-safe";
import { Report } from "./Report";
import { passContextToFunction } from "./editor";
import { Changeset, describeChangeset } from "./Changeset";


// run with ts-node

const realProject = GitCommandGitProject.fromProject(new NodeFsLocalProject("automation-client",
    "/Users/jessitron/code/atomist/automation-client-ts"), { token: "poo" });


function commitDangit(r1: Changeset, report: Report) {
    if (report.implemented.length === 0) {
        console.log("Skipping commit for " + stringify(r1));
        return Promise.resolve();
    }
    return realProject.commit(describeChangeset(r1)).then(() => Promise.resolve())
}

passContextToFunction({
    name: "GitCommandGitProject.cloned",
    filePath: "src/project/git/GitCommandGitProject.ts",
    access: { kind: "PublicFunctionAccess" }
}, commitDangit)(realProject)
    .then(report => {
        console.log("implemented: " + stringify(report.addParameterReport.implemented, null, 1))
        console.log("UNIMPLEMENTED: " + stringify(report.addParameterReport.unimplemented, null, 2))
    });


