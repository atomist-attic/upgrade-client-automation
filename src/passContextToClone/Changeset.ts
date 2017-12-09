
import { AddParameter } from "./AddParameter";
import Requirement = AddParameter.Requirement;

export interface Changeset {
    titleRequirement: Requirement,
    requirements: Requirement[],
    prerequisites: Changeset[],
}

export function describeChangeset(cs: Changeset): string {
    const listOfReqs = cs.requirements.map(AddParameter.describeRequirement).map(s => "-   " + s).join("\n");
    return AddParameter.describeRequirement(cs.titleRequirement) + "\n\n" + listOfReqs;
}