/*
 * Copyright © 2017 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import "mocha";
import * as assert from "power-assert";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { AddParameter, passContextToFunction } from "../../src/passContextToClone/editor";
import * as stringify from "json-stringify-safe";

import * as appRoot from "app-root-path";
import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import findConsequences = AddParameter.findConsequences;
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";
import { TreeNode } from "@atomist/tree-path/TreeNode";
import * as _ from "lodash";
import implement = AddParameter.implement;
import Requirement = AddParameter.Requirement;
import isPassArgumentRequirement = AddParameter.isPassArgumentRequirement;
import isAddParameterRequirement = AddParameter.isAddParameterRequirement;

const OldTestCode = `
    const getAClone = (repoName: string = RepoName) => {
        const repositoryThatExists = new GitHubRepoRef(Owner, repoName);
        return GitCommandGitProject.cloned(Creds, repositoryThatExists);
    };

    it("does another thing", () => {
       GitCommandGitProject.cloned({ token: "yeah" }, whatever, more, things)
    });
`;

function getAllMatches(r: RegExp, s: string): string[] {
    if (r.flags.indexOf("g") < 0) {
        throw new Error("This is useless without a global regexp")
    }
    const output = [];
    let m;
    while (m = r.exec(s)) {
        output.push(m[0])
    }
    return output;
}

describe("editor to pass the context into the cloned method", () => {
    it("sends a dummy context into tests, with just enough populated", done => {
        const functionWeWant = "GitCommandGitProject.cloned";

        const input = InMemoryProject.of({ path: "test/something.ts", content: OldTestCode });
        passContextToFunction({ name: functionWeWant, filePath: "src/project/git/GitCommandGitProject.ts" })(input)
            .then(report => input.findFile("test/something.ts"))
            .then(f => f.getContent())
            .then(newTestCode => {
                const wanted = /cloned\({} as HandlerContext,/g;
                const m = getAllMatches(wanted, newTestCode);
                assert.equal(m.length, 2, newTestCode);
            }).then(() => done(), done);
    });
});


describe("please add context to the call", () => {

    it("detects context in the calling function", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");
        const mutableProject = InMemoryProject.of(
            thisProject.findFileSync("src/CodeThatUsesIt.ts"),
            thisProject.findFileSync("src/AdditionalFileThatUsesStuff.ts"));

        const resultProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/after");

        const functionWeWant = "InHere.giveMeYourContext";

        passContextToFunction({ name: functionWeWant, filePath: "src/CodeThatUsesIt.ts" })(mutableProject)
            .then(report => {
                const modified = mutableProject.findFileSync("src/AdditionalFileThatUsesStuff.ts").getContentSync();
                const expected = resultProject.findFileSync("src/AdditionalFileThatUsesStuff.ts").getContentSync();

                console.log(modified);
                assert.equal(modified, expected, modified); //  there is one difference we don't cover
                return report;
            })
            .then(report => {
                const modified = mutableProject.findFileSync("src/CodeThatUsesIt.ts").getContentSync();
                const expected = resultProject.findFileSync("src/CodeThatUsesIt.ts").getContentSync();

                console.log(modified);
                assert.equal(report.addParameterReport.unimplemented.length, 1, stringify(report, null, 2));
                assert.equal(report.addParameterReport.implemented.length, 9, stringify(report, null, 2));
                assert.equal(modified, expected, modified); //  there is one difference we don't cover
            }).then(() => done(), done);
    });

    it("detects changes across files")

});

describe("more files, more levels", () => {
    it("finds a reasonable number of consequences", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");

        findConsequences(thisProject,
            [{
                "kind": "Add Parameter",
                "functionWithAdditionalParameter": {
                    name: "InHere.giveMeYourContext",
                    filePath: "src/CodeThatUsesIt.ts",
                },
                "parameterType": "HandlerContext",
                "parameterName": "context",
                "dummyValue": "{},",
            }]).then(consequences => {

            const addParameterAtHigherLevel = consequences.find(c =>
                isAddParameterRequirement(c) &&
                c.functionWithAdditionalParameter.name === "usesAFunctionThatDoesNotHaveContextAndDoesNotHaveContext");

            assert(addParameterAtHigherLevel, stringify(consequences.filter(isAddParameterRequirement), null, 2));

            const addParameterAtEvenHigherLevel = consequences.find(c =>
                isAddParameterRequirement(c) &&
                c.functionWithAdditionalParameter.name === "andEvenMoreStuff");

            assert(addParameterAtEvenHigherLevel);

            assert.equal(consequences.length,
                17, // plausible
                stringify(consequences, null, 2))
        })
            .then(() => done(), done);
    }).timeout(20000)


});

describe("detection of consequences", () => {
    it("can find calls to functions that aren't qualified names", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");

        findConsequences(thisProject,
            [{
                "kind": "Add Parameter",
                "functionWithAdditionalParameter": {
                    name: "exportedDoesNotYetHaveContext",
                    filePath: "src/CodeThatUsesIt.ts",
                },
                "parameterType": "HandlerContext",
                "parameterName": "context",
                "dummyValue": "{},",
            }]).then(consequences => {
            assert.equal(consequences.length, 8, stringify(consequences))
        })
            .then(() => done(), done);
    });

    it("helps me out", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");

        const innerExpression = `/Identifier[@value='usesAFunctionThatDoesNotHaveContext']`;

        findMatches(thisProject, TypeScriptES6FileParser, "src/CodeThatUsesIt.ts",
            `//FunctionDeclaration[${innerExpression}]`)
            .then(matches => {
                    matches.forEach(m =>
                        console.log(printMatch(m).join("\n")),
                    )
                },
            ).then(() => done(), done);

    })
});

function printMatch(m: TreeNode): string[] {
    let me = m.$name + "/";
    if (!m.$children) {
        me = m.$name + " = " + m.$value;
    }
    const myBabies = _.flatMap(m.$children, ch => printMatch(ch).map(o => " " + o));
    return [me].concat(myBabies);
}

// wishlist: a replacer that would let me print the matches, without printing sourceFile every time
