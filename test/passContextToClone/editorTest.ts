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
import { sendDummyContextInTests } from "../../src/passContextToClone/editor";
import * as stringify from "json-stringify-safe";

import * as appRoot from "app-root-path";
import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { findMatches } from "@atomist/automation-client/tree/ast/astUtils";
import { TypeScriptES6FileParser } from "@atomist/automation-client/tree/ast/typescript/TypeScriptFileParser";

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
        const input = InMemoryProject.of({ path: "test/something.ts", content: OldTestCode });
        sendDummyContextInTests(input).then(output => output.findFile("test/something.ts"))
            .then(f => f.getContent())
            .then(newTestCode => {
                const wanted = /cloned\({} as HandlerContext,/g;
                const m = getAllMatches(wanted, newTestCode);
                assert(m.length === 2, stringify(m));
            }).then(() => done(), done);
    });

    it("adds context as the first argument to GitCommandGitProject.cloned");

    it("tries to get the variable name right");
});


describe("please add context to the call", () => {

    it("detects context in the calling function", done => {
        const thisProject = new NodeFsLocalProject("automation-client",
            appRoot.path + "/test/passContextToClone/resources/before");
        const mutableProject = InMemoryProject.of(thisProject.findFileSync("CodeThatUsesIt.ts"));

        findMatches(mutableProject, TypeScriptES6FileParser, "CodeThatUsesIt.ts",
            "//CallExpression[/PropertyAccessExpression[@value='InHere.giveMeYourContext']]")
            .then(matches => {
                console.log("FOUND nodes: " + matches.length);
                matches
                    .forEach(v => {
                        console.log(v.$name + ": " + v.$value);
                        const newValue = v.$value.replace(/\(/, "(context, ");
                        v.$value = newValue;
                    });
            })
            .then(() => mutableProject.flush())
            .then(() => {
                const modified = mutableProject.findFileSync("CodeThatUsesIt.ts");
                console.log(modified.getContentSync());
                return true;
            }).then(() => done(), done);
    })
});
