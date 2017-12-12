import * as TypescriptEditing from "./TypescriptEditing";

export interface Changeset {
    titleRequirement: TypescriptEditing.Requirement;
    requirements: TypescriptEditing.Requirement[];
    prerequisites: Changeset[];
}

export function describeChangeset(cs: Changeset): string {
    const listOfReqs = cs.requirements.map(TypescriptEditing.describeRequirement).map(s => "-   " + s).join("\n");
    return TypescriptEditing.describeRequirement(cs.titleRequirement) + "\n\n" + listOfReqs;
}
