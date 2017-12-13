import { Project } from "@atomist/automation-client/project/Project";
import { combine, emptyReport, Report } from "./Report";
import { toPromise } from "@atomist/automation-client/project/util/projectUtils";
import { logger } from "@atomist/automation-client";
import * as stringify from "json-stringify-safe";
import { Requirement } from "./TypescriptEditing";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import { applyRequirement } from "./editor";
import { Changeset, describeChangeset } from "./Changeset";
import { AddParameterRequirement } from "./AddParameterRequirement";

export function upgradeDownstream(library: Project, downstream: GitProject,
                                  commitDangit: (project: GitProject) => (r1: Changeset, report: Report) => Promise<void> = commit
): Promise<Report> {

    return getCurrentVersion(downstream)
        .then(downstreamVersion => gatherRequirements(downstreamVersion, library))
        .then(upgradeRequirements => upgrade(upgradeRequirements, downstream,
             commitDangit))
}

function getCurrentVersion(project: Project): Promise<string> {
    return project.findFile("package.json")
        .then(f => f.getContent())
        .then(content =>
            JSON.parse(content).version)
}

function gatherRequirements(fromVersion: string, upstreamProject: Project) {
    // right now, "all migrations" works well enough
    return toPromise(upstreamProject.streamFiles("migration/*/*.json"))
        .then(files => Promise.all(
            files.map(f =>
                f.getContent().then(c => JSON.parse(c)))))
        .then(reqs => {
            logger.info("Requirements: " + stringify(reqs));
            /* right now, they are all this type */
            return reqs.map(r => new AddParameterRequirement(r))
        })
}

const commit = (project: GitProject) => (r1: Changeset, report: Report) => {
    if (report.implemented.length === 0) {
        logger.info("Skipping commit for " + stringify(r1));
        return Promise.resolve();
    }
    return project.commit(describeChangeset(r1)).then(() => Promise.resolve());
}

function upgrade(applyAll: Requirement[], project: GitProject,
                 commitDangit: (project: GitProject) => (r1: Changeset, report: Report) => Promise<void>) {
    return sequence(project, applyAll, commitDangit)
        .then(report => {
            logger.info("Final report: " + stringify(report, null, 2));
            return report;
        });
}

function sequence(project: GitProject, activities: Requirement[],
                  commitDangit: (project: GitProject) => (r1: Changeset, report: Report) => Promise<void>) {



    return activities.reduce(
        (pp: Promise<Report>, r1: Requirement) => pp
            .then(allTheReportsFromBefore => applyRequirement(r1, commitDangit(project))(project)
                .then(report1 => combine(allTheReportsFromBefore, report1))),
        Promise.resolve(emptyReport));
}