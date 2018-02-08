import { Requirement } from "../typescriptEditing/TypescriptEditing";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { GitHubCredentials } from "../credentials";
import { toPromise } from "@atomist/automation-client/project/util/projectUtils";
import { Project } from "@atomist/automation-client/project/Project";
import * as stringify from "json-stringify-safe";

export async function runMigrations(project: Project, oldVersion: string, newVersion: string, branch?: string) {
    const migrations = await gatherMigrations(oldVersion, newVersion, branch);
    console.log("migrations: " + migrations.map(a => stringify(a)).join("\n"));
    throw new Error("Not implemented further");
}

async function gatherMigrations(oldVersion: string, newVersion: string, branch?: string): Promise<Requirement[]> {
    const clientProject = await GitCommandGitProject.cloned(GitHubCredentials,
        new GitHubRepoRef("atomist", "automation-client", branch));

    const allMigrations = await toPromise(clientProject.streamFiles("migration/**/*.json"));
    console.log("There are " + allMigrations.length + " total migrations");
    // TODO: filter by version.
    const contents = await Promise.all(allMigrations.map(f => f.getContent()
        .then(p => JSON.parse(p))
        .catch(err => Promise.reject("Could not parse contents of " + f.path + ": " + err.message))));

    return contents;
}