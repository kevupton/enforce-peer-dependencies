import fs from 'fs';
import path from 'path';
import {fetchPackageJson, PackageJson, toPackageJsonPath} from "./package-json";

function fetchMainFile(directory: string) {
    return (fetchPackageJson(path.join(directory, 'package.json')) || {}).main || 'index.js';
}

function fetchPeerDependencies(packageJsonPath: string): string[] | undefined {
    try {
        // Read the package json into a object. Or at least try to.
        const packageJson: PackageJson | undefined = fetchPackageJson(packageJsonPath);

        if (!packageJson) {
            return undefined;
        }

        // return a list of all the keys. Or modules which should be peer dependencies.
        return [
            ...Object.keys(packageJson?.peerDependencies || {}),
            ...Object.keys(packageJson?.devDependencies || {}),
        ];
    } catch (e) {
        console.error(e);
        return [];
    }
}

function getDependencyFilename(packageName: string, basicPath: string, resolveExtensions: string[], DEBUG_MODE = false) {

    let finalPiece: fs.Stats | undefined;
    let finalPath: string | undefined;

    const requestPieces = packageName.split('/');

    const modulesPath = /node_modules\/?$/.test(basicPath) ? basicPath : path.join(basicPath, 'node_modules');

    for (let i = 1; i <= requestPieces.length; i++) {
        finalPath = path.join(modulesPath, ...requestPieces.slice(0, i));
        if (DEBUG_MODE) {
            console.log('looking at ', finalPath);
        }

        // check if this file exists. Not looking navigating to a linked directory.
        if (i !== requestPieces.length) {
            if (!fs.existsSync(finalPath)) {
                return undefined;
            }
            // only check the file extensions if its on the last piece
            continue;
        }

        // if it exists then it must be a directory
        if (fs.existsSync(finalPath)) {
            finalPiece = fs.lstatSync(finalPath);
            if (DEBUG_MODE) {
                console.info('package path', finalPath);
            }
            break;
        }

        // check all file extensions with the final path
        for (const ext of resolveExtensions) {
            // check all filepaths that potentially have a .js extension
            finalPath = path.join(modulesPath, ...requestPieces.slice(0, i - 1), `${requestPieces[i - 1]}${ext.startsWith('.') ? ext : `.${ext}`}`);

            if (DEBUG_MODE) {
                console.log('looking at ', finalPath);
            }

            if (fs.existsSync(finalPath)) {
                if (DEBUG_MODE) {
                    console.info('found', finalPath);
                }

                return finalPath;
            }
        }
    }

    if (!finalPath || !finalPiece) {
        return undefined;
    }

    // if the final piece is a directory get the main file from package json
    if (!finalPiece.isDirectory() && !finalPiece.isSymbolicLink()) {
        return finalPath;
    }

    const modulePath = finalPath;
    const mainFile = fetchMainFile(finalPath);

    finalPath = path.join(modulePath, mainFile);

    if (DEBUG_MODE) {
        console.log('looking at ', finalPath);
    }
    if (!fs.existsSync(finalPath)) {
        return undefined;
    }

    // check to see what type of piece the final piece is now
    finalPiece = fs.lstatSync(finalPath);

    if (finalPiece.isDirectory()) {
        finalPath = path.join(finalPath, 'index.js');

        if (fs.existsSync(finalPath)) {
            if (DEBUG_MODE) {
                console.info('found', finalPath);
            }

            return finalPath;
        }
    }
    else {
        if (DEBUG_MODE) {
            console.info('found', finalPath);
        }
        return finalPath;
    }

    for (const ext of resolveExtensions) {
        finalPath = path.join(modulePath, mainFile + (ext.startsWith('.') ? ext : `.${ext}`));

        if (DEBUG_MODE) {
            console.log('looking at ', finalPath);
        }

        if (fs.existsSync(finalPath)) {
            return finalPath;
        }
    }

    if (DEBUG_MODE) {
        console.warn('Failed to resolve module.', {
            basicPath, packageName, mainFile, modulePath
        });
    }
}


function resolveFilename(
    request: string,
    pathsGenerator: Generator<string[], void, any>,
    originalValues: string,
    rootDir: string,
    resolveExtensions = ['js', 'json'],
    DEBUG_MODE = false,
) {
    if (!originalValues.startsWith('/')) {
        return originalValues;
    }

    if (DEBUG_MODE) {
        console.log('resolving ', request);
    }

    const pieces = request.split('/');
    const dependency = pieces[0].startsWith('@') ? pieces[0] + '/' + pieces[1] : pieces[0];

    for (const paths of pathsGenerator) {
        for (const modulePath of paths) {
            // we need to find a package json, to get the peer dependencies.
            const packageJsonPath = toPackageJsonPath(modulePath);
            const peerDependencies = fetchPeerDependencies(packageJsonPath);

            // if we cannot find any package json then just continue without doing anything.
            if (!peerDependencies) {
                if (DEBUG_MODE) {
                    console.debug('Cannot find package json at path', packageJsonPath);
                }
                continue;
            }

            if (DEBUG_MODE) {
                console.log('peer dependencies for', packageJsonPath, peerDependencies);
            }

            const isRootDir = new RegExp(rootDir + '(?:/?node_modules/?)?$').test(modulePath);
            if (DEBUG_MODE) {
                console.log('checking root dir for', rootDir, isRootDir);
            }

            if (DEBUG_MODE && isRootDir) {
                console.debug('we have reached the root package json dir', modulePath);
            }

            // if this current module is non existent in the peer dependencies then resolve it like normal.
            if (!peerDependencies.includes(dependency) || isRootDir) {
                const result = getDependencyFilename(request, modulePath, resolveExtensions, DEBUG_MODE);

                if (result) {
                    return result;
                }

                // if (DEBUG_MODE) {
                //     console.warn('Expected to find a dependency for ', modulePath, request, 'but nothing was found.');
                // }
                //
                // // return originalValues;
            }
        }
    }

    if (DEBUG_MODE) {
        console.warn('Could not resolve package', request);
    }

    return originalValues;
}

export default resolveFilename;
