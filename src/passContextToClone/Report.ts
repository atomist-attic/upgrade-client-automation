
/*
 * Report is the output of attempting to implement requirements.
 */
import { AddParameter } from "./AddParameter";


export interface Unimplemented {
    requirement: AddParameter.Requirement,
    message: string,
}

export interface Report {
    unimplemented: Unimplemented[]

    implemented: AddParameter.Requirement[]
}

export const emptyReport: Report = {
    unimplemented: [],
    implemented: [],
};

export function reportUnimplemented(requirement: AddParameter.Requirement, message: string): Report {
    return {
        unimplemented: [{ requirement, message }],
        implemented: [],
    }
}

export function reportImplemented(requirement: AddParameter.Requirement): Report {
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