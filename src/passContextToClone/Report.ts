
/*
 * Report is the output of attempting to implement requirements.
 */
import { AddParameter } from "./AddParameter";
import Requirement = AddParameter.Requirement;

export interface Unimplemented {
    requirement: Requirement,
    message: string,
}

export interface Report {
    unimplemented: Unimplemented[]

    implemented: Requirement[]
}

export const emptyReport: Report = {
    unimplemented: [],
    implemented: [],
};

export function reportUnimplemented(requirement: Requirement, message: string): Report {
    return {
        unimplemented: [{ requirement, message }],
        implemented: [],
    }
}

export function reportImplemented(requirement: Requirement): Report {
    return {
        unimplemented: [],
        implemented: [requirement],
    }
}

export function combine(report1: Report, report2: Report): Report {
    return {
        unimplemented: report1.unimplemented.concat(report2.unimplemented),
        implemented: report1.implemented.concat(report2.implemented),
    }
}