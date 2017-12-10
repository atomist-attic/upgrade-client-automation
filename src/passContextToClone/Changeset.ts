
import { AddParameter } from "./AddParameter";


export interface Changeset {
    titleRequirement: AddParameter.Requirement,
    requirements: AddParameter.Requirement[],
    prerequisites: Changeset[],
}

export function describeChangeset(cs: Changeset): string {
    const listOfReqs = cs.requirements.map(AddParameter.describeRequirement).map(s => "-   " + s).join("\n");
    return AddParameter.describeRequirement(cs.titleRequirement) + "\n\n" + listOfReqs;
}