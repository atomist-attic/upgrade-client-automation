import "mocha";
import * as assert from "power-assert";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { AddParameterRequirement } from "../../src/typescriptEditing/AddParameterRequirement";
import {
    functionCallIdentifierFromProject,
    topLevelFunction,
} from "../../src/typescriptEditing/functionCallIdentifierFromProject";
import { applyRequirement } from "../../src/typescriptEditing/editor";
import { upgradeDownstream } from "../../src/typescriptEditing/upgradeDownstream";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { logger } from "@atomist/automation-client";
import * as stringify from "json-stringify-safe";

describe("Making updates here that cascade downstream", () => {

    it("When an editor updates a library, it leaves a trail that lets another editor change downstream projects", done => {

        const libraryProject = InMemoryProject.of(
            {
                path: "package.json", content: `{
   "name" : "@atomist/automation-client",
   "version" : "0.6.0"
}\n`,
            },
            {
                path: "src/friendly.ts", content: `
export function giveMeYourContext(stuff: string) {
    return "stuff with the context";
}\n`,
            });

        const downstreamProject = InMemoryProject.of(
            {
                path: "package.json", content: `{
                "name": "@atomist/lifecycle-automation",
                "version": "0.2.11",
                "dependencies": {
                    "@atomist/automation-client": "0.5.0"
                    }
}\n`,
            },
            {
                path: "src/usesFriendly.ts", content: `import { giveMeYourContext } from "@atomist/automation-client";

function doesStuff() {
    return giveMeYourContext("and your stuff");
}\n`,
            });

        const downstreamContentAfterUpdate = `import { HandlerContext, giveMeYourContext } from "@atomist/automation-client";

function doesStuff(context: HandlerContext, ) {
    return giveMeYourContext(context, "and your stuff");
}\n`;

        const dontCommit = () => () => Promise.resolve();

        functionCallIdentifierFromProject(libraryProject, "src/friendly.ts",
            topLevelFunction("giveMeYourContext"))
            .then(functionToChange => {
                const libraryRequirement = new AddParameterRequirement(
                    {
                        functionWithAdditionalParameter: functionToChange,
                        parameterType: {
                            kind: "local",
                            name: "HandlerContext",
                            localPath: "./HandlerContext",
                            externalPath: "@atomist/automation-client",
                        },
                        parameterName: "context",
                    },
                );
                return applyRequirement(libraryRequirement)(libraryProject);
            })
            .then(() => {
                // the library project has been updated
                const after = libraryProject.findFileSync("src/friendly.ts").getContentSync();

                assert(after.includes("giveMeYourContext(context: HandlerContext, stuff: string)"))
            })
            .then(() => upgradeDownstream(libraryProject, downstreamProject as any as GitProject, dontCommit))
            .then(() => {
                // the downstream project has been updated
                const after = downstreamProject.findFileSync("src/usesFriendly.ts").getContentSync();

                assert.equal(after, downstreamContentAfterUpdate)
            }).then(() => done(), done);
    })
});

describe("run it for real", () => {

    it("runs on a real project", done => {
        const downstreamProject = GitCommandGitProject.fromBaseDir({ repo: "samples", owner: "atomist" },
            "/Users/jessitron/code/atomist/automation-client-samples-ts", { token: "no" },
            () => Promise.resolve(console.log("released, ahhh")))

        const libraryProject = GitCommandGitProject.fromBaseDir({ repo: "client", owner: "atomist" },
            "/Users/jessitron/code/atomist/automation-client-ts", { token: "no" },
            () => Promise.resolve(console.log("released, ahhh")))

        upgradeDownstream(libraryProject, downstreamProject as any as GitProject)
            .then(report => {
                logger.info(stringify(report, null, 2))
            }).then(() => done(), done);
    })

});