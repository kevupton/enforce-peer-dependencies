import fs from 'fs';
import path from 'path';
import {fetchPackageJson, fetchPackageJsonPath, PackageJson} from "./package-json";

function fetchMainFile(directory: string) {
    return (fetchPackageJson(path.join(directory, 'package.json')) || {}).main || 'index.js';
}

function fetchPeerDependencies(packageJsonPath: string): string[] {
    try {
        // Read the package json into a object. Or at least try to.
        const packageJson: PackageJson | undefined = fetchPackageJson(packageJsonPath);
        // return a list of all the keys. Or modules which should be peer dependencies.
        return Object.keys(packageJson?.peerDependencies || {});
    } catch (e) {
        console.error(e);
        return [];
    }
}


function resolveFilename(
    request: string,
    pathsGenerator: Generator<string[], void, any>,
    originalValues: string,
    resolveExtensions = ['js', 'json'],
    DEBUG_MODE = false,
) {
    if (!originalValues.startsWith('/')) {
        return originalValues;
    }


    if (DEBUG_MODE) {
        console.log('resolving ', request);
    }

    let paths: string[] | false | undefined;
    let iterations = 0;

    for (paths of pathsGenerator) {

        // we need to find a package json, to get the peer dependencies.
        const packageJsonPath = fetchPackageJsonPath(paths);

        // if we cannot find any package json then just continue without doing anything.
        if (!packageJsonPath) {
            if (DEBUG_MODE) {
                console.warn('Cannot find package json path from paths', paths);
            }
            return originalValues;
        }

        const peerDependencies = fetchPeerDependencies(packageJsonPath);

        // if this current module is non existent in the peer dependencies then resolve it like normal.
        if (!peerDependencies.includes(request)) {
            // if it does not have it in the peer dependencies for the very first iteration then continue like normal
            // if (iterations === 0) {
            //     return original;
            // }
            break;
        }
        else {
            paths = undefined;
        }

        iterations++;
    }

    // if it gets into here it means that all parent modules had this package as a peer dependency.
    if (!paths) {
        if (DEBUG_MODE) {
            console.warn('All paths apparently have peer dependencies', paths);
        }

        return originalValues;
    }

    /*
        if it makes it to here then we are dealing with a child package that is a peer dependency of this package.
        So what we want to do now is check if the parent module has this module as a symbolic link or not.
        If it is a symbolic link then we want to recursively check if the parent also has that package as a peer dependency.
        And use the module from the parent module which does not have it as a peer dependency.
     */

    const pieces = request.split('/');

    let finalPiece: fs.Stats | undefined;
    let finalPath: string | undefined;

    const result = paths.find(basicPath => {
        const modulesPath = /node_modules\/?$/.test(basicPath) ? basicPath : path.join(basicPath, 'node_modules');

        for (let i = 1; i <= pieces.length; i++) {
            finalPath = path.join(modulesPath, ...pieces.slice(0, i));
            if (DEBUG_MODE) {
                console.log('looking at ', finalPath);
            }
            try {
                // check if this file exists. Not looking navigating to a linked directory.
                finalPiece = fs.lstatSync(finalPath);
            } catch (e) {
                // only check the file extensions if its on the last piece
                if (i === pieces.length) {
                    // check all file extensions with the final path
                    for (const ext of resolveExtensions) {
                        // check all filepaths that potentially have a .js extension
                        finalPath = path.join(modulesPath, ...pieces.slice(0, i - 1), `${pieces[i - 1]}${ext.startsWith('.') ? ext : `.${ext}`}`);
                        if (DEBUG_MODE) {
                            console.log('looking at ', finalPath);
                        }
                        try {
                            finalPiece = fs.lstatSync(finalPath);
                        } catch (e) {
                            // let the return false take place
                        }
                    }
                }
                return false;
            }
        }
        return finalPiece;
    });

    if (!result) {
        if (DEBUG_MODE) {
            console.warn('Could not resolve package', { request, paths });
        }
        return originalValues;
    }

    if (finalPiece && finalPath) {
        // if the final piece is a directory get the main file from package json
        if (finalPiece.isDirectory() || finalPiece.isSymbolicLink()) {
            const modulePath = finalPath;
            const mainFile = fetchMainFile(finalPath);
            finalPath = path.join(finalPath, mainFile);
            try {
                // check to see what type of piece the final piece is now
                finalPiece = fs.lstatSync(finalPath);

                // if it is still a directory then add index.js onto the end.
                if (finalPiece.isDirectory()) {
                    finalPath = path.join(finalPath, 'index.js');
                    finalPiece = fs.lstatSync(finalPath);
                }
            } catch (e) {
                const result = resolveExtensions.find(ext => {
                    try {
                        finalPath = path.join(modulePath, mainFile + (ext.startsWith('.') ? ext : `.${ext}`));
                        finalPiece = fs.lstatSync(finalPath);
                        return true;
                    }
                    catch(e) {
                        return false;
                    }
                });

                if (!result) {
                    if (DEBUG_MODE) {
                        console.warn('Failed to resolve module.', {
                            paths, error: e, mainFile, modulePath, request
                        });
                    }
                    return originalValues;
                }
            }
        }

        return finalPath;
    }

    if (DEBUG_MODE) {
        console.warn('No final piece of final path', {
            paths, finalPiece, finalPath,
        });
    }

    return originalValues;
}

export default resolveFilename;
