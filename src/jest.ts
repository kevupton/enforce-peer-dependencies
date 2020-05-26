import resolveFilename from './resolve-filename';
import {splitPath} from "./split-path";
import {fetchPackageJson, fetchPackageJsonPath} from "./package-json";
import path from "path";

const list: {name: string; options: ResolverOptions}[] = [];

let debug = false;

interface ResolverOptions {
    basedir: string,
    defaultResolver: (name: string, options: any) => string,
    extensions?: [],
    moduleDirectory?: string[] | string,
    paths?: string[] | string,
    rootDir?: string[] | string
}

function isSymLinked (options: ResolverOptions) {
    if (!options.paths || !options.paths.length || !options.rootDir) {
        return false;
    }

    return Array.isArray(options.rootDir) && !options.rootDir.some(rootDir => options.basedir.startsWith(rootDir)) ||
        !Array.isArray(options.rootDir) && options.basedir.startsWith(options.rootDir) ||
        Array.isArray(options.paths) && !options.paths.some(path => options.basedir.startsWith(path)) ||
        !Array.isArray(options.paths) && options.basedir.startsWith(options.paths);
}

function fetchParentPackageName(paths: string[]) : string | undefined {
    const packageJsonPath = fetchPackageJsonPath(paths);

    if (!packageJsonPath) {
        return;
    }

    const packageJson = fetchPackageJson(packageJsonPath);

    if (!packageJson) {
        return;
    }

    return packageJson.name;
}

function fetchPreviousListing(name: string) {
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].name === name) {
            return list[i];
        }
    }
}

function* createIterator(options: ResolverOptions) {
    const { paths = [], rootDir , basedir} = options;

    if (Array.isArray(rootDir) || !rootDir) {
        throw new Error('unable to process array');
    }

    if (!Array.isArray(paths)) {
        throw new Error('Unable to support string paths');
    }


    let activeDir = basedir;
    const root = path.parse(rootDir).root;

    do {
        const paths = splitPath(activeDir);
        if (debug) {
            console.log('possible paths', paths);
        }
        yield paths;

        if (isSymLinked(options) || paths.some(pathName => path.join(pathName, '/') === path.join(activeDir, '/'))) {
            const name = fetchParentPackageName(paths);
            if (!name) {
                return;
            }
            const previousListing = fetchPreviousListing(name);
            if (!previousListing) {
                return;
            }
            activeDir = previousListing.options.basedir;
        }
        else {
            activeDir = path.join(activeDir, '../');
        }


    } while (activeDir !== root);
}


function jestResolver(name: string, options: ResolverOptions) {
    const originalValue = options.defaultResolver(name, options);

    debug = process.env.DEBUG_ENFORCE_PEER_DEPENDENCIES !== undefined;

    if (name.startsWith('.') || !options.moduleDirectory || !originalValue.startsWith('/')) {
        return originalValue;
    }

    list.push({ name, options });

    if (debug) {
        console.log(debug, name, list.length);
        console.log(options);
    }

    const output = resolveFilename(name, createIterator(options), originalValue, options.extensions, debug);

    if (debug) {
        console.log({ to: output, from: originalValue });
    }

    return output;
}

jestResolver.list = list;

export = jestResolver;
