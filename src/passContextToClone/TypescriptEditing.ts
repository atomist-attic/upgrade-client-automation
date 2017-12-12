import stringify = require("json-stringify-safe");
import { Project } from "@atomist/automation-client/project/Project";
import { logger } from "@atomist/automation-client";
import { Report, reportUnimplemented } from "./Report";
import { Consequences, emptyConsequences } from "./Consequences";
import { Changeset } from "./Changeset";

/*
 * Requirements describe what we need to do
 */
export abstract class Requirement {
    public kind: string;

    constructor(public why?: any) {
    }

    public sameRequirement(other: Requirement): boolean {
        return false;
    }

    public describe(): string {
        return stringify(this);
    }

    public findConsequences(project: Project): Promise<Consequences> {
        return Promise.resolve(emptyConsequences);
    }

    public implement(project: Project): Promise<Report> {
        return Promise.resolve(reportUnimplemented(this, "I don't know how to implement that yet"))
    }
}



export function sameRequirement(r1: Requirement, r2: Requirement): boolean {
    return r1.kind === r2.kind && r1.sameRequirement(r2)

}


export type PathExpression = string;


export function describeRequirement(r: Requirement): string {
        return r.describe()
}

/*
 * Requirements can have consequences, which are additional changes
 * that have to be implemented in order to implement this one.
 */
function findConsequencesOfOne(project: Project, requirement: Requirement): Promise<Consequences> {
    return requirement.findConsequences(project)
}

export function changesetForRequirement(project: Project, requirement: Requirement): Promise<Changeset> {
    return findConsequences(project, [requirement], [], [])
        .then(theseConsequences => Promise.all(
            theseConsequences.prerequisiteChanges
                .map(r => changesetForRequirement(project, r)))
            .then(prerequisiteChangesets =>
                ({
                    titleRequirement: requirement,
                    requirements: theseConsequences.concomitantChanges,
                    prerequisites: prerequisiteChangesets,
                })));
}

/**
 *  Find all concomitant changes and their prerequisite requirements
 *  unchecked: concomitant changes whose consequences we haven't calculated. grows as more are discovered
 *  checked: concomitant changes whose consequences are already calculated and in the lists; accumulate and dedup
 *  prerequisites: prerequisite changes from any of the checked concomitant changes; accumulate only
 */
function findConsequences(project: Project,
                          unchecked: Requirement[],
                          checked: Requirement[],
                          prerequisites: Requirement[]): Promise<Consequences> {
    if (unchecked.length === 0) {
        return Promise.resolve({ concomitantChanges: checked, prerequisiteChanges: prerequisites });
    }
    const thisOne = unchecked.pop(); // mutation
    if (checked.some(o => sameRequirement(o, thisOne))) {
        logger.info("Already checked " + stringify(thisOne));
        return findConsequences(project, unchecked, checked, prerequisites);
    }
    return findConsequencesOfOne(project, thisOne).then(consequences => {
        checked.push(thisOne);
        return findConsequences(project,
            unchecked.concat(consequences.concomitantChanges),
            checked,
            prerequisites.concat(consequences.prerequisiteChanges))
    });
}

export function implement(project: Project, requirement: Requirement): Promise<Report> {
    return requirement.implement(project)
}

