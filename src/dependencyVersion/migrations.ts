import { Requirement } from "../typescriptEditing/TypescriptEditing";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { GitHubCredentials } from "../credentials";
import { toPromise } from "@atomist/automation-client/project/util/projectUtils";
import { Project } from "@atomist/automation-client/project/Project";
import * as stringify from "json-stringify-safe";
import { applyRequirement } from "../typescriptEditing/editor";
import { deserializeRequirement } from "../typescriptEditing/deserializeRequirement";
import { File } from "@atomist/automation-client/project/File";
import { Changeset, describeChangeset } from "../typescriptEditing/Changeset";
import { Report } from "../typescriptEditing/Report";
import { logger } from "@atomist/automation-client";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";

export interface MigrationResult {
    message: string
    error?: Error
}

export async function runMigrations(project: GitProject, oldVersion: string,
                                    newVersion: string, branch?: string): Promise<MigrationResult[]> {
    const migrations = await gatherMigrations(oldVersion, newVersion, branch);
    console.log("migrations: " + migrations.map(a => stringify(a)).join("\n"));
    const results: MigrationResult[] = await Promise.all(migrations.map(m => runOneMigration(project, m)));
    console.log("Migration results: " + stringify(results));
    return results;
}

async function runOneMigration(project: GitProject, r: Requirement): Promise<MigrationResult> {
    try {
        const result = await applyRequirement(r)(project);
        if (result.implemented.length === 0) {
            return { message: "Not applicable: " + r.describe() }
        }
        await project.commit("Migrated for breaking change: " + r.describe());
        return { message: "Applied " + r.describe() };
    } catch (error) {
        return { message: "failed: " + r.describe(), error }
    }
}

async function gatherMigrations(oldVersion: string, newVersion: string, branch?: string): Promise<Requirement[]> {
    const clientProject = await GitCommandGitProject.cloned(GitHubCredentials,
        new GitHubRepoRef("atomist", "automation-client", branch));

    const allMigrations = await toPromise(clientProject.streamFiles("migration/**/*.json"));
    console.log("There are " + allMigrations.length + " total migrations");
    // TODO: filter by version.
    const contents = await Promise.all(allMigrations.map(deserializeOne));
    return contents;
}

async function deserializeOne(migration: File): Promise<Requirement> {
    const content = await migration.getContent();
    try {
        const json = JSON.parse(content)
        return deserializeRequirement(json);
    } catch (err) {
        throw new Error("Could not parse contents of " + migration.path + ": " + err.message)
    }
}

function commitDangit(project: GitProject) {
    return (r1: Changeset, report: Report) => {
        if (report.implemented.length === 0) {
            logger.info("Skipping commit for " + stringify(r1));
            return Promise.resolve();
        }
        return project.commit(describeChangeset(r1)).then(() => Promise.resolve());
    }
}