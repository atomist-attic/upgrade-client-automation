
import { Requirement } from "./TypescriptEditing";
import { Project } from "@atomist/automation-client/project/Project";
import { Report, reportImplemented } from "./Report";

export class AddMigrationRequirement extends Requirement {
    public kind: "Add Migration Requirement" = "Add Migration Requirement";

    constructor(public downstreamRequirement: Requirement, why?: any) {
        super(why);
    }

    public implement(project: Project) {
        return applyAddMigration(project, this);
    }
}

export function isAddMigrationRequirement(r: Requirement): r is AddMigrationRequirement {
    return r.kind === "Add Migration Requirement";
}

function applyAddMigration(project: Project, requirement: AddMigrationRequirement): Promise<Report> {
    const name = requirement.describe().replace(/[^A-Za-z0-9]/g, "-");

    return getCurrentVersion(project)
        .then(v => project.addFile(`migration/${v}/${name}.json`, JSON.stringify(requirement.downstreamRequirement)))
        .then(() => reportImplemented(requirement));
}

function getCurrentVersion(project: Project): Promise<string> {
    return project.findFile("package.json")
        .then(f => f.getContent())
        .then(content =>
            JSON.parse(content).version)
}