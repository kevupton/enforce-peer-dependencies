import fs from 'fs';
import path from 'path';
import BuiltinModule from 'module';

const DEBUG_MODE = process.env.DEBUG_ENFORCE_PEER_DPENDENCIES !== undefined;

import Module = NodeJS.Module;

interface PackageJson {
    [key : string] : any;
}

// Guard against poorly mocked module constructors
const nodeModule : any = module.constructor.length > 1
    ? module.constructor
    : BuiltinModule;

const previousResolveFilename = nodeModule._resolveFilename;
const resolveExtensions = ['js'];

function fetchParentModuleWithoutPeerDependency(module : Module | null, request : string) : Module | false {
    if (!module) {
        return false;
    }

    const packageJsonPath = fetchPackageJsonPath(module.paths);

    if (!packageJsonPath) {
        return false;
    }

    const peerDependencies = fetchPeerDependencies(packageJsonPath);

    if (peerDependencies.includes(request)) {
        return fetchParentModuleWithoutPeerDependency(module.parent, request);
    }

    return module;
}

function fetchPackageJsonPath(paths : string[]) {
    return paths
        // remove node_modules from the end of all directories, and add package.json
        .map(modulePath =>
            path.join(modulePath.replace(/node_modules$/, ''), 'package.json'),
        )
        // find the first directory that has a package.json
        .find(packageJsonPath => fs.existsSync(packageJsonPath));
}

function fetchPackageJson(packageJsonPath : string) : PackageJson | undefined {
    try {
        // Read the package json into a object. Or at least try to.
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (e) {
        return undefined;
    }
}

function splitPath(pathname : string) {
    let currentPath = pathname;

    const paths : string[] = [];
    const root = path.parse(pathname).root;

    while (currentPath !== root) {
        paths.push(currentPath);
        currentPath = path.join(currentPath, '../');
    }

    paths.push(root);

    return paths;
}

function fetchMainFile(directory : string) {
    return (fetchPackageJson(path.join(directory, 'package.json')) || {}).main || 'index.js';
}

function fetchPeerDependencies(packageJsonPath : string) : string[] {
    try {
        // Read the package json into a object. Or at least try to.
        const packageJson : PackageJson | undefined = fetchPackageJson(packageJsonPath);
        // return a list of all the keys. Or modules which should be peer dependencies.
        return Object.keys(packageJson?.peerDependencies || {});
    } catch (e) {
        console.error(e);
        return [];
    }
}

nodeModule._resolveFilename = function resolveFilename(...args : any[]) {
    const request : string = args[0];
    const packageModule : Module = args[1];
    const isMain : boolean = args[2];
    const options : any = args[3];

    const callPreviousMethod = () => previousResolveFilename.apply(this, args);

    // we dont want to look at the root module. We want to look at any possible linked module.
    if (!packageModule.parent) {
        return callPreviousMethod();
    }

    // we need to find a package json, to get the peer dependencies.
    const packageJsonPath = fetchPackageJsonPath(packageModule.paths);

    // if we cannot find any package json then just continue without doing anything.
    if (!packageJsonPath) {
        return callPreviousMethod();
    }

    const peerDependencies = fetchPeerDependencies(packageJsonPath);

    // if this current module is non existent in the peer dependencies then resolve it like normal.
    if (!peerDependencies.includes(request)) {
        return callPreviousMethod();
    }

    /*
        if it makes it to here then we are dealing with a child package that is a peer dependency of this package.
        So what we want to do now is check if the parent module has this module as a symbolic link or not.
        If it is a symbolic link then we want to recursively check if the parent also has that package as a peer dependency.
        And use the module from the parent module which does not have it as a peer dependency.
     */

    const useModule = fetchParentModuleWithoutPeerDependency(packageModule, request);

    // if it gets into here it means that all parent modules had this package as a peer dependency.
    if (!useModule) {
        return callPreviousMethod();
    }

    const pieces = request.split('/');

    let finalPiece : fs.Stats | undefined;
    let finalPath : string | undefined;

    useModule.paths.find(modulesPath => {
        for (let i = 1; i <= pieces.length; i++) {
            finalPath = path.join(modulesPath, ...pieces.slice(0, i));
            try {
                // check if this file exists. Not looking navigating to a linked directory.
                finalPiece = fs.lstatSync(finalPath);
            } catch (e) {
                // only check the file extensions if its on the last piece
                if (i === pieces.length) {
                    // check all file extensions with the final path
                    for (const extension of resolveExtensions) {
                        // check all filepaths that potentially have a .js extension
                        finalPath = path.join(modulesPath, ...pieces.slice(0, i - 1), `${pieces[i]}.${extension}`);
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

    if (finalPiece && finalPath) {
        // if the final piece is a directory get the main file from package json
        if (finalPiece.isDirectory() || finalPiece.isSymbolicLink()) {
            finalPath = path.join(finalPath, fetchMainFile(finalPath));
            try {
                // check to see what type of piece the final piece is now
                finalPiece = fs.lstatSync(finalPath);

                // if it is still a directory then add index.js onto the end.
                if (finalPiece.isDirectory()) {
                    finalPath = path.join(finalPath, 'index.js');
                }
            } catch (e) {
                // do nothing
            }
        }

        if (DEBUG_MODE) {
            console.log('resolving\nto: ' + finalPath + '\nfrom: ' + callPreviousMethod() + '\n');
        }

        return finalPath;
    }

    return callPreviousMethod();
};
