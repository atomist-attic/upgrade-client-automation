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
import { SimpleProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import { doWithFiles } from "@atomist/automation-client/project/util/projectUtils";
import { editorHandler } from "@atomist/automation-client/operations/edit/editorToCommand";
import { BaseEditorParameters } from "@atomist/automation-client/operations/edit/BaseEditorParameters";
import { BranchCommit, PullRequest } from "@atomist/automation-client/operations/edit/editModes";
import { HandleCommand } from "@atomist/automation-client";

const saveUpgradeToGitHub: BranchCommit = {
    branch: "pass-context-to-clone-atomist",
    message: "in tests, pass a dummy context.",
};

export const upgradeTo0_5 = (): HandleCommand =>
    editorHandler(() => sendDummyContextInTests,
        BaseEditorParameters,
        "upgrade code using automation-client to 0.5", {
            editMode: saveUpgradeToGitHub,
            intent: "upgrade code for automation-client 0.5",
        });

export const sendDummyContextInTests: SimpleProjectEditor = (p: Project) => {
    return doWithFileContent(p, "test/**/*.ts", content => {
        return content.replace(/GitCommandGitProject.cloned\(/g,
            "GitCommandGitProject.cloned({} as HandlerContext, ")
    });
};

function doWithFileContent(p: Project, glob: string, manipulation: (content: string) => string) {
    return doWithFiles(p, "test/**/*.ts", f => {
        return f.getContent()
            .then(content =>
                f.setContent(manipulation(content)),
            )
    });
}
