import { Requirement } from "./TypescriptEditing";
import { Project } from "@atomist/automation-client/project/Project";
import { Report, reportImplemented, reportUnimplemented } from "./Report";
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

async function applyAddMigration(project: Project, requirement: AddMigrationRequirement): Promise<Report> {
    const name = requirement.describe().replace(/[^A-Za-z0-9]/g, "-");

    const v = await getCurrentVersion(project);
    const migrationFile = `migration/${v}/${name}.json`;
    await project.addFile(migrationFile,
        JSON.stringify(requirement.downstreamRequirement, null, 2));
    const changeLogUpdated: boolean = await addBreakingChangeToChangelog(project,
        requirement.downstreamRequirement.describe());
    if (!changeLogUpdated) {
        return reportUnimplemented(requirement, "it was already there")
    }
    return reportImplemented(requirement);
}

async function addBreakingChangeToChangelog(project: Project, description: string): Promise<boolean> {
    logger.info("Adding to changelog: " + description);
    try {
        const f = await project.findFile("CHANGELOG.md");
        const content = await f.getContent();
        if (content.includes(description)) {
            logger.info("Changelog already has change: " + description);
            return false;
        }
        await f.setContent(addBreakingChange(description, content));
        return true;
    }
    catch (noChangelog) {
        logger.warn("Error updating changelog: " + noChangelog);
        return false;
    }
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