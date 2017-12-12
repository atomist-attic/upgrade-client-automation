import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import "mocha";
import * as assert from "power-assert";
import { addImport } from "../../src/passContextToClone/addImport";

describe("add import", () => {
    it("Adds a name to an existing import", done => {
        const input = InMemoryProject.of({
            path: "src/Whatever.ts", content: `import * from "foo";
import { Stuff } from "@atomist/automation-client";

const blah = "blah"
`,
        });
        addImport(input, "src/Whatever.ts",
            { kind: "library", name: "HandlerContext", location: "@atomist/automation-client" })
            .then(changed => input.flush().then(() => changed))
            .then(changed => {

                const after = input.findFileSync("src/Whatever.ts").getContentSync();
                assert(after.includes(`import { HandlerContext, Stuff } from "@atomist/automation-client"`), after);
                assert(changed);
            }).then(() => done(), done);
    });

    describe("relative import", () => {
        it("uses a relative import", done => {
            const fileOfInterest = "src/OtherFileInSameDir.ts";
            const input = InMemoryProject.of(
                { path: fileOfInterest, content: "const blah;"});

            addImport(input, fileOfInterest,
                {kind: "local", name: "HandlerContext", localPath: "src/HandlerContext"})
                .then(() => input.flush())
                .then(() => {
                   const after = input.findFileSync(fileOfInterest).getContentSync();

                   assert(after.includes(`import { HandlerContext } from "./HandlerContext";\n`), after);
                })
                .then(() => done(), done);

        });

        it("finds src from test", done => {
            const fileOfInterest = "test/blah/OtherFileInSameDir.ts";
            const input = InMemoryProject.of(
                { path: fileOfInterest, content: "const blah;"});

            addImport(input, fileOfInterest,
                {kind: "local", name: "HandlerContext", localPath: "src/HandlerContext"})
                .then(() => input.flush())
                .then(() => {
                    const after = input.findFileSync(fileOfInterest).getContentSync();

                    assert(after.includes(`import { HandlerContext } from "../../src/HandlerContext";\n`), after);
                })
                .then(() => done(), done);

        });
    });
});
