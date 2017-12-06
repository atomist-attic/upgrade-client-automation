import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { AddParameter, passContextToFunction } from "./editor";
import * as stringify from "json-stringify-safe";


// TODO: how would I run this?

const realProject = GitCommandGitProject.fromProject(new NodeFsLocalProject("automation-client",
    "/Users/jessitron/code/atomist/automation-client-ts"), { token: "poo" });


function commitDangit(r1: AddParameter.Requirement, report: AddParameter.Report) {
    if (report.implemented.length === 0) {
        return Promise.resolve();
    }
    return realProject.commit(stringify(r1)).then(() => Promise.resolve())
}

let areWeDoneYet = false;

function done(err?: Error) {
    areWeDoneYet = true;
    if (err) {
        throw err;
    }
}

passContextToFunction({
    name: "GitCommandGitProject.cloned",
    filePath: "src/project/git/GitCommandGitProject.ts",
}, commitDangit)(realProject)
    .then(report => {
        console.log("implemented: " + stringify(report.addParameterReport.implemented, null, 1))
        console.log("UNIMPLEMENTED: " + stringify(report.addParameterReport.unimplemented, null, 2))
    })
    .then(() => done(), done);

function keepGoingIfNotDone() {
    setTimeout((arg) => {
        if (!areWeDoneYet) {
            keepGoingIfNotDone();
        }
    }, 1000)
}

keepGoingIfNotDone();

