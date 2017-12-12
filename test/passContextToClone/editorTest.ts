import * as stringify from "json-stringify-safe";
import "mocha";
import * as assert from "power-assert";
import { logger } from "@atomist/automation-client";
import { Changeset, describeChangeset } from "../../src/typescriptEditing/Changeset";
import { Report } from "../../src/typescriptEditing/Report";
import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { passContextToFunction } from "../../src/passContextToClone/editor";
import * as appRoot from "app-root-path";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";

describe("editor to pass the context into the cloned method", () => {
    it("sends a dummy context into tests, with just enough populated", done => {

        const OldTestCode = `
    const getAClone = (repoName: string = RepoName) => {
        const repositoryThatExists = new GitHubRepoRef(Owner, repoName);
        return GitCommandGitProject.cloned(Creds, repositoryThatExists);
    };

    it("does another thing", () => {
       GitCommandGitProject.cloned({ token: "yeah" }, whatever, more, things)
    });
`;

        const input = InMemoryProject.of({ path: "test/something.ts", content: OldTestCode });
        passContextToFunction({
            enclosingScope: {
                kind: "class around method",
                name: "GitCommandGitProject",
                exported: true,
            },
            name: "cloned", filePath: "src/project/git/GitCommandGitProject.ts",
            access: { kind: "PublicFunctionAccess" },
        })(input)
            .then(report => input.findFile("test/something.ts"))
            .then(f => f.getContent())
            .then(newTestCode => {
                const wanted = /cloned\({} as HandlerContext,/g;
                const m = getAllMatches(wanted, newTestCode);
                assert.equal(m.length, 2, newTestCode);
            }).then(() => done(), done);
    });

    it("detects context in the calling function", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/typescriptEditing/resources/before");
        const mutableProject = InMemoryProject.of(
            thisProject.findFileSync("src/CodeThatUsesIt.ts"),
            thisProject.findFileSync("src/AdditionalFileThatUsesStuff.ts"));

        const resultProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/typescriptEditing/resources/after");

        const functionWeWant = "giveMeYourContext";

        passContextToFunction({
            enclosingScope: { kind: "enclosing namespace", name: "InHere", exported: true },
            name: functionWeWant,
            filePath: "src/CodeThatUsesIt.ts",
            access: { kind: "PublicFunctionAccess" },
        })(mutableProject)
            .then(report => {
                const modified = mutableProject.findFileSync("src/AdditionalFileThatUsesStuff.ts").getContentSync();

                logger.info(modified);
                assert(modified.includes("import { HandlerContext"), "needs the import");
                assert(modified.includes("andEvenMoreStuff(context: HandlerContext"), "adds parameter");
                assert(modified.includes("usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext(context"),
                    "passes argument");
                return report;
            })
            .then(report => {
                const modified = mutableProject.findFileSync("src/CodeThatUsesIt.ts").getContentSync();
                const expected = resultProject.findFileSync("src/CodeThatUsesIt.ts").getContentSync();

                logger.info(modified);
                // When AddMigration is implemented, set this 3 to 0
                assert.equal(report.addParameterReport.unimplemented.length, 3,
                    stringify(report.addParameterReport.unimplemented, null, 2));
                assert.equal(report.addParameterReport.implemented.length, 12,
                    stringify(report, null, 2));
                assert.equal(modified, expected, modified);
            }).then(() => done(), done);
    });

});


function getAllMatches(r: RegExp, s: string): string[] {
    if (r.flags.indexOf("g") < 0) {
        throw new Error("This is useless without a global regexp");
    }
    const output = [];
    let m;
    while (m = r.exec(s)) {
        output.push(m[0]);
    }
    return output;
}


describe("actually run it", () => {

    // question: how can I turn off debug output?

    it.skip("just run it", done => {
        (logger as any).level = "info";

        const realProject = GitCommandGitProject.fromProject(new NodeFsLocalProject("automation-client",
            "/Users/jessitron/code/atomist/automation-client-ts"), { token: "poo" });

        function commitDangit(r1: Changeset, report: Report) {
            if (report.implemented.length === 0) {
                logger.info("Skipping commit for " + stringify(r1));
                return Promise.resolve();
            }
            return realProject.commit(describeChangeset(r1)).then(() => Promise.resolve());
        }

        // printStructureOfFile(realProject, "src/project/git/GitCommandGitProject.ts")
        //     .then(() =>   {
        //
        //     return findMatches(realProject, TypeScriptES6FileParser, "src/project/git/GitCommandGitProject.ts",
        //         "//ClassDeclaration[/Identifier[@value='GitCommandGitProject']]").then(m => {
        //             logger.info("matches: " + m.length)
        //     })
        //         })
        //     .then(() =>
        passContextToFunction({
            enclosingScope: { kind: "class around method", name: "GitCommandGitProject", exported: true },
            name: "cloned",
            filePath: "src/project/git/GitCommandGitProject.ts",
            access: { kind: "PublicFunctionAccess" },
        }, commitDangit)(realProject)
            .then(report => {
                logger.info("implemented: " + stringify(report.addParameterReport.implemented, null, 1));
                logger.info("UNimplementED: " + stringify(report.addParameterReport.unimplemented, null, 2));
            })
            .then(() => done(), done);
    })//.timeout(1000000);
});