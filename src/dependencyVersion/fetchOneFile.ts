// fetch a file from GitHub
import * as URL from "url";
import { stringify } from "querystring";
import * as GitHubApi from "github";
import { logger } from "@atomist/automation-client";
import * as _ from "lodash";

/*  {
    baseUrl: "https://www.github.com",
    apiUrl: "https://api.github.com",
    owner: "atomisthq",
    name: "neo4j-ingester",
    path: "resources/schema.idl",
} */
export interface RemoteFileLocation {
    baseUrl?: string,
    apiUrl: string,
    owner: string,
    name: string,
    path: string,
}

export type FileNotFound = 404;

export const GitHubFileWorld = {
    fetchFileContents: fetchFileContentsImpl,
};

function fetchFileContentsImpl(token: string,
                               location: RemoteFileLocation,
                               ref: string): Promise<string | FileNotFound> {
    return api(token, location.apiUrl).repos.getContent({
        owner: location.owner,
        repo: location.name,
        path: location.path,
        ref,
    }).then(response => {
        if (response.data === undefined) {
            return Promise.reject(new Error("No data in result: " + response));
        }
        if (response.data.content === undefined) {
            return Promise.reject(new Error("No content in result data: " + stringify(response.data)));
        }

        const encodedContent = response.data.content;
        const unencoded = new Buffer(encodedContent, "base64").toString("ascii");

        return Promise.resolve(unencoded);
    }, err => {
        if (err.code === 404) {
            /* this could also be a lack of auth. but I don't want to do another check. */
            return Promise.resolve(404 as FileNotFound);
        }
        logger.warn(
            `failed to fetch file at ${
                location.apiUrl}/repos/${
                location.owner}/${location.name}/contents/${location.path}?ref=${ref}
                code: ${err.code}
                status: ${err.status}`);
        return Promise.reject(err);
    });
}

// I totally copied this from cdupuis code somewhere
function api(token: string, apiUrl: string = "https://api.github.com/"): GitHubApi {
    // separate the url
    const url = URL.parse(apiUrl);

    const ghapi = new GitHubApi({
        debug: false,
        host: url.hostname,
        protocol: url.protocol.slice(0, -1),
        port: +url.port,
        followRedirects: false,
    });

    ghapi.authenticate({ type: "token", token });
    return ghapi;
}
