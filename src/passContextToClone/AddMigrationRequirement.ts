

import { Requirement } from "./TypescriptEditing";

export class AddMigrationRequirement extends Requirement {
    public kind: "Add Migration Requirement" = "Add Migration Requirement";

    constructor(public downstreamRequirement: Requirement, why?: any) {
        super(why);
    }
}

export function isAddMigrationRequirement(r: Requirement): r is AddMigrationRequirement {
    return r.kind === "Add Migration Requirement";
}