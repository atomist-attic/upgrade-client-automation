import "mocha";
import * as assert from "power-assert";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { updateScript } from "../../src/npmScripts/editor";
import { HandlerContext } from "@atomist/automation-client";

describe("the editor updates the npm script", () => {

    it("updates to the new version", done => {
        const oldValue = "mocha --require espower-typescript/guess 'test/**/*.ts'";
        const newValue = "mocha --require espower-typescript/guess \"test/**/*.ts\"";

        const input = InMemoryProject.of({
            path: "package.json",
            content: JSON.stringify({
                scripts: { "test": oldValue},
            }),
        });

        updateScript("test", oldValue, newValue)(input, {} as HandlerContext)
            .then(editResult => {
                assert(editResult.edited);
                const content = editResult.target.findFileSync("package.json").getContentSync();
                assert(JSON.parse(content).scripts.test === newValue)
            })
            .then(() => done(), done);
    })

    it("does not update if you have changed it", done => {
        const oldValue = "mocha --require espower-typescript/guess 'test/**/*.ts'";
        const currentValue = "mocha --my-custom-stuff 'test/**/*.ts'";
        const newValue = "mocha --require espower-typescript/guess \"test/**/*.ts\"";

        const input = InMemoryProject.of({
            path: "package.json",
            content: JSON.stringify({
                scripts: { "test": currentValue},
            }),
        });

        updateScript("test", oldValue, newValue)(input, {} as HandlerContext)
            .then(editResult => {
                assert(!editResult.edited);
                const content = editResult.target.findFileSync("package.json").getContentSync();
                assert(JSON.parse(content).scripts.test === currentValue)
            })
            .then(() => done(), done);
    })
});
