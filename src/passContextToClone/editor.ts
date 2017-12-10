/*
 * Copyright © 2017 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Project } from "@atomist/automation-client/project/Project";
import { HandlerContext, logger } from "@atomist/automation-client";
import * as _ from "lodash";
import { EditResult, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import { AddImport } from "./manipulateImports";
import stringify = require("json-stringify-safe");
import FunctionCallIdentifier = AddParameter.FunctionCallIdentifier;
import { AddParameter } from "./AddParameter";
import { combine, emptyReport, Report } from "./Report";
import { Changeset, describeChangeset } from "./Changeset";


export interface MySpecialEditReport extends EditResult {
    addParameterReport: Report
}


export type PerChangesetFunction = (changeset: Changeset, report: Report) => Promise<void>
const doNothing = () => Promise.resolve();

export function passContextToFunction(params: FunctionCallIdentifier, betweenChangesets: PerChangesetFunction = doNothing): (p: Project) => Promise<MySpecialEditReport> {
    return (p: Project) => {
        const handlerContextType: AddImport.ImportIdentifier = {
            kind: "local",
            name: "HandlerContext",
            localPath: "src/HandlerContext",
        };
        const originalRequirement: AddParameter.Requirement = new AddParameterRequirement({
                        functionWithAdditionalParameter: params,
            parameterType: handlerContextType,
            parameterName: "context",
            populateInTests: {
                dummyValue: "{} as HandlerContext",
                additionalImport: handlerContextType,
            },
            why: "I want to use the context in here",
        });

        return AddParameter.changesetForRequirement(p, originalRequirement)
            .then(changesetTree => {
                // man, I wish I could find my TreePrinter
                logger.info(describeChangeset(changesetTree));
                return changesetTree;
            })
            .then(linearizeChangesets)
            .then(changesets => {
                logger.info("implementing " + changesets.length + " changesets: ");
                changesets.map(describeChangeset).forEach(s => logger.info(s));
                return changesets
            })
            .then(changesets =>
                implementChangesets(p, changesets, betweenChangesets))
            .then(report => {
                logger.info("Report: " + stringify(report, null, 2));
                return {
                    ...successfulEdit(p, report.implemented.length > 0),
                    addParameterReport: report,
                }
            });
    }
}

/*
 * return an ordered list of changesets, such that each changeset
 * comes after all of its prerequisites.
 */
function linearizeChangesets(top: Changeset): Changeset[] {
    if (top.prerequisites.length === 0) {
        return [top];
    } else {
        const beforeMe = _.flatMap(top.prerequisites, linearizeChangesets);
        return beforeMe.concat([top])
    }
}


function implementInSequenceWithFlushes(project: Project, activities: AddParameter.Requirement[]) {
    return activities.reduce(
        (pp: Promise<Report>, r1: AddParameter.Requirement) => pp
            .then(allTheReportsFromBefore => AddParameter.implement(project, r1)
                .then((report1) => project.flush()
                    .then(() => combine(allTheReportsFromBefore, report1)))),
        Promise.resolve(emptyReport));
}

function implementChangesets(project: Project, activities: Changeset[],
                             betweenChangesets: PerChangesetFunction) {
    return activities.reduce(
        (pp: Promise<Report>, c1: Changeset) =>
            pp.then(allTheReportsFromBefore =>
                implementInSequenceWithFlushes(project, c1.requirements)
                    .then((report1) => betweenChangesets(c1, report1)
                        .then(() => combine(allTheReportsFromBefore, report1)))),
        Promise.resolve(emptyReport));
}

