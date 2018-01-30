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

import { Configuration } from "@atomist/automation-client/configuration";
import * as appRoot from "app-root-path";
import { BeginReleaseHandler } from "./prepareRelease/command";
import { UpgradeTo0_5 } from "./typescriptEditing/command";
import { updateNpmScripts } from "./npmScripts/command";
import { findAutomationClientsCommand } from "./findAutomations/command";
import { teamId } from "./credentials";
import { FingerprintAutomationClientVersion } from "./dependencyVersion/FingerprintAutomationClientVersion";
import { HelloWorld } from "./Hello";
import { listAutomationClientsCommand } from "./dependencyVersion/ListAutomationClients";
import { UpgradeAutomationClientLibraryEditor } from "./dependencyVersion/UpdateVersionEditor";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot.path}/package.json`);

const token = process.env.GITHUB_TOKEN;

export const configuration: Configuration = {
    name: pj.name,
    version: pj.version,
    teamIds: [teamId], // atomist-community

    commands: [
        BeginReleaseHandler,
        () => new UpgradeTo0_5(),
        updateNpmScripts,
        () => findAutomationClientsCommand,
        listAutomationClientsCommand,
        HelloWorld,
        UpgradeAutomationClientLibraryEditor
    ],
    events: [
        () => new FingerprintAutomationClientVersion()
    ],
    token,
    http: {
        enabled: true,
        auth: {
            basic: {
                enabled: false,
            },
            bearer: {
                enabled: false,
            },
        },
    },
    applicationEvents: {
        enabled: true,
        teamId
    }
};
