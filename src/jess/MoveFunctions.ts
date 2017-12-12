import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";

const inputProject = new NodeFsLocalProject(null,
    "/Users/jessitron/code/atomist/upgrade-client-automation/");

function moveFunction(from: {}, to: {}): Promise<void> {
    return Promise.resolve();
}

function moveStuffAround() {

}
