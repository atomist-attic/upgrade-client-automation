
import { Requirement } from "./TypescriptEditing";
import { Project } from "@atomist/automation-client/project/Project";
import { Report, reportImplemented } from "./Report";
import { logger } from "@atomist/automation-client";

export class AddMigrationRequirement extends Requirement {
    public kind: "Add Migration Requirement" = "Add Migration Requirement";

    constructor(public downstreamRequirement: Requirement, why?: any) {
        super(why);
    }

    public implement(project: Project) {
        return applyAddMigration(project, this);
    }

    public describe() {
        return "migration for " + this.downstreamRequirement.describe();
    }
}

export function isAddMigrationRequirement(r: Requirement): r is AddMigrationRequirement {
    return r.kind === "Add Migration Requirement";
}

function applyAddMigration(project: Project, requirement: AddMigrationRequirement): Promise<Report> {
    const name = requirement.describe().replace(/[^A-Za-z0-9]/g, "-");

    return getCurrentVersion(project)
        .then(v => project.addFile(`migration/${v}/${name}.json`,
            JSON.stringify(requirement.downstreamRequirement, null, 2)))
        .then(() => addBreakingChangeToChangelog(project, requirement.downstreamRequirement.describe()))
        .then(() => reportImplemented(requirement))
}

function addBreakingChangeToChangelog(project: Project, description: string) {
    logger.info("Adding to changelog: " + description);
    return project.findFile("CHANGELOG.md").then(f => f.getContent()
        .then(content => f.setContent(addBreakingChange(description, content))))
        .catch( noChangelog => logger.warn("Error updating changelog: " + noChangelog))
}

function addBreakingChange(description: string, content: string): string {
    const putThemHere = /^### Changed/m;
    return content.replace(putThemHere, "### Changed\n**Breaking** " + description)
}

function getCurrentVersion(project: Project): Promise<string> {
    return project.findFile("package.json")
        .then(f => f.getContent())
        .then(content =>
            JSON.parse(content).version)
}