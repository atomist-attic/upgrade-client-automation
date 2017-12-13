import { Project } from "@atomist/automation-client/project/Project";
import { emptyReport, Report } from "./Report";

export function upgradeDownstream(library: Project, downstream: Project): Promise<Report> {

    // return getCurrentVersion(downstream)
    //     .then( downstreamVersion => gatherRequirements(downstreamVersion, library))
    //     .then(upgradeRequirements => )

    return Promise.resolve(emptyReport);
}