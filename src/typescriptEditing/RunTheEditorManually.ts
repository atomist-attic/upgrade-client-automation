import { logger } from "@atomist/automation-client";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import * as stringify from "json-stringify-safe";
import { Changeset, describeChangeset } from "./Changeset";
import { passContextToFunction } from "./editor";
import { Report } from "./Report";

// run with ts-node

const realProject = GitCommandGitProject.fromProject(new NodeFsLocalProject("automation-client",
    "/Users/jessitron/code/atomist/automation-client-ts"), { token: "poo" });

function commitDangit(r1: Changeset, report: Report) {
    if (report.implemented.length === 0) {
        logger.info("Skipping commit for " + stringify(r1));
        return Promise.resolve();
    }
    return realProject.commit(describeChangeset(r1)).then(() => Promise.resolve());
}

passContextToFunction({
    name: "GitCommandGitProject.cloned",
    filePath: "src/project/git/GitCommandGitProject.ts",
    access: { kind: "PublicFunctionAccess" },
}, commitDangit)(realProject)
    .then(report => {
        logger.info("implemented: " + stringify(report.addParameterReport.implemented, null, 1));
        logger.info("UNIMPLEMENTED: " + stringify(report.addParameterReport.unimplemented, null, 2));
    });
