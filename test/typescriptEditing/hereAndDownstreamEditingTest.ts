import "mocha";
import * as assert from "power-assert";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { AddParameterRequirement } from "../../src/typescriptEditing/AddParameterRequirement";

var tmp = require('tmp-promise');
import {
    functionCallIdentifierFromProject,
    topLevelFunction,
} from "../../src/typescriptEditing/functionCallIdentifierFromProject";
import { applyRequirement } from "../../src/typescriptEditing/editor";
import { upgradeDownstream } from "../../src/typescriptEditing/upgradeDownstream";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { Project } from "@atomist/automation-client/project/Project";

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

        tmp.dir()
            .then((dirInfo: { path: string }): Promise<Project> =>
                NodeFsLocalProject.copy(InMemoryProject.from(
                    { owner: "whothefuckcares", sha: "master", repo: "yourbutt" },
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
                    }), dirInfo.path))
            .then((local: Project) => {
                const downstreamProject = GitCommandGitProject.fromProject(local
                    , { token: "no" });

                const downstreamContentAfterUpdate = `import { HandlerContext } from "@atomist/automation-client";
import { giveMeYourContext } from "@atomist/automation-client";

function doesStuff(context: HandlerContext) {
    return giveMeYourContext(context, "and your stuff");
}\n`;

                return functionCallIdentifierFromProject(libraryProject, "src/friendly.ts",
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
                    .then(() => upgradeDownstream(libraryProject, downstreamProject))
                    .then(() => {
                        // the downstream project has been updated
                        const after = downstreamProject.findFileSync("src/usesFriendly.ts").getContentSync();

                        assert.equal(after, downstreamContentAfterUpdate)
                    });

            }).then(() => done(), done);
    })
});