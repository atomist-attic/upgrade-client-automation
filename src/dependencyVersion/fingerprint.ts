import axios from "axios";
import * as _ from "lodash";
import { atomistWebhookUrl, teamId } from "../credentials";

export interface FingerprintedCommit {
    provider: string,
    owner: string,
    repo: string,
    sha: string,
}

export interface Fingerprint {
    name: string,
    sha: string
}

export const PushFingerprintWorld = {
    pushFingerprint: pushFingerprintImpl
}
//export let pushFingerprint: (commit: FingerprintedCommit, ...fingerprints: Fingerprint[]) => Promise<void> =
  //  pushFingerprintImpl;

function pushFingerprintImpl(commit: FingerprintedCommit,
                             ...fingerprints: Fingerprint[]): Promise<void> {
    const url = atomistWebhookUrl + "/fingerprints/teams/" + teamId;
    const data = {
        commit,
        fingerprints,
    };
    console.log("Sending fingerprint: " + JSON.stringify(data) + " to " + url);
    return axios.post(url, data)
        .then(yay => {
            },
            z => Promise.reject(new Error(
                `Failure posting fingerprint.
Error: ${z.message},
Response body: ${JSON.stringify(_.get(z, "result.body", "(none)"))}
URL: ${url}
Data: ${JSON.stringify(data)}`)));
}
