import { logger } from "@atomist/automation-client";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import * as appRoot from "app-root-path";
import * as stringify from "json-stringify-safe";
import "mocha";
import * as assert from "power-assert";
import { passContextToFunction } from "../../src/passContextToClone/editor";
import { Changeset, describeChangeset } from "../../src/typescriptEditing/Changeset";
import { Report } from "../../src/typescriptEditing/Report";
import { ImportIdentifier } from "../../src/typescriptEditing/addImport";
import { applyRequirement } from "../../src/typescriptEditing/editor";
import { AddParameterRequirement } from "../../src/typescriptEditing/AddParameterRequirement";

const packageJson = { path: "package.json",
    content: `{ "name": "@atomist/automation-client", "version": "0.5.0" }`};

describe("editor to pass the context into the cloned method", () => {
    it("detects context in the calling function", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/typescriptEditing/resources/before");
        const mutableProject = InMemoryProject.of(packageJson,
            thisProject.findFileSync("src/CodeThatUsesIt.ts"),
            thisProject.findFileSync("src/AdditionalFileThatUsesStuff.ts"));

        const resultProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/typescriptEditing/resources/after");

        const functionWeWant = "giveMeYourContext";

        const handlerContextType: ImportIdentifier = {
            kind: "local",
            name: "HandlerContext",
            localPath: "src/HandlerContext",
        };
        const originalRequirement = new AddParameterRequirement({
            functionWithAdditionalParameter: {
                enclosingScope: { kind: "enclosing namespace", name: "InHere", exported: true },
                name: functionWeWant,
                filePath: "src/CodeThatUsesIt.ts",
                access: { kind: "PublicFunctionAccess" }},
            parameterType: handlerContextType,
            parameterName: "context",
            populateInTests: {
                dummyValue: "{} as HandlerContext",
                additionalImport: handlerContextType,
            },
            why: "I want to use the context in here",
        });

        applyRequirement(originalRequirement)(mutableProject)
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
                assert.equal(report.unimplemented.length, 0,
                    stringify(report.unimplemented, null, 2));
                assert.equal(report.implemented.length, 15,
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

    it("just run it", done => {
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


        passContextToFunction(commitDangit)(realProject)
            .then(report => {
                logger.info("implemented: " + stringify(report.addParameterReport.implemented, null, 1));
                logger.info("UNimplementED: " + stringify(report.addParameterReport.unimplemented, null, 2));
            })
            .then(() => done(), done);
    }).timeout(1000000);
});
