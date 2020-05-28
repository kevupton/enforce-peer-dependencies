import resolveFilename from './resolve-filename';
import {splitPath} from "./split-path";
import {fetchPackageJson, fetchPackageJsonPath} from "./package-json";
import path from "path";

interface ListItem {
    name: string;
    options: ResolverOptions,
    index: number
}

const list: ListItem[] = [];

let debug = false;

interface ResolverOptions {
    basedir: string,
    defaultResolver: (name: string, options: any) => string,
    extensions?: [],
    moduleDirectory?: string[] | string,
    paths?: string[] | string,
    rootDir?: string[] | string
}

function isSymLinked(options: ResolverOptions) {
    return options.rootDir && (
        Array.isArray(options.rootDir) && !options.rootDir.some(rootDir => options.basedir.startsWith(rootDir)) ||
        !Array.isArray(options.rootDir) && !options.basedir.startsWith(options.rootDir)
    ) || options.paths && (
        Array.isArray(options.paths) && !options.paths.some(path => options.basedir.startsWith(path)) ||
        !Array.isArray(options.paths) && !options.basedir.startsWith(options.paths)
    );
}

function fetchPreviousListing(name: string, previousIndex?: number) {
    for (let i = (previousIndex || list.length) - 1; i >= 0; i--) {
        if (list[i].name === name || list[i].name.startsWith(name + '/')) {
            return list[i];
        }
    }
}

function pathIsEqual(pathA: string, pathB: string) {
    return path.join(pathA, '/') === path.join(pathB, '/');
}

function constructSymlinkPath(packages: string[], currentDirectory: string) {
    const packageJsonPath = fetchPackageJsonPath(splitPath(currentDirectory));

    if (!packageJsonPath) {
        return;
    }

    return path.join(
        packageJsonPath.replace(/package.json$/, ''),
        'node_modules',
        packages.join('/node_modules/'),
        'node_modules',
    )
}

function getNextValidDirectory(directory: string, listItem: ListItem) {
    const {paths: mainPaths = []} = listItem.options;

    if (!Array.isArray(mainPaths)) {
        throw new Error('Unable to support string paths');
    }

    let currentListItem = listItem;
    let currentDir: string | undefined = directory;
    let packages: string[] = [];

    if (debug) {
        console.log('checking symlink for', listItem.name, isSymLinked(listItem.options));
    }

    //  || mainPaths.some(pathName => pathIsEqual(pathName, currentDir))
    while (isSymLinked(currentListItem.options)) {

        if (debug) {
            console.log('is SymLinked or special path', currentListItem, currentDir);
        }

        const paths = splitPath(currentListItem.options.basedir);
        const packageJsonPath = fetchPackageJsonPath(paths);

        if (!packageJsonPath) {
            if (debug) {
                console.warn('Could not find a package.json in any of the paths', paths);
            }
            return;
        }

        const packageJson = fetchPackageJson(packageJsonPath);

        if (!packageJson) {
            if (debug) {
                console.warn('Could not fetch the package json from path', packageJsonPath);
            }
            return;
        }

        const name = packageJson.name;

        if (!name) {
            if (debug) {
                console.warn('This package json has no name', packageJson);
            }
            return;
        }

        packages.unshift(name);

        const nextItem = fetchPreviousListing(name, currentListItem?.index);

        if (!nextItem) {
            if (debug) {
                console.warn('Could not find a previous listing', { name, currentListItem }, '\n', JSON.stringify(list.map(item => item.name), undefined, 4));
            }
            return;
        }

        currentListItem = nextItem;
        currentDir = constructSymlinkPath(packages, nextItem.options.basedir);

        if (debug) {
            console.log('CONSTRUCTING SYMLINK PATH', currentDir);
        }
    }

    if (debug) {
        console.log('finished on', currentListItem.name, currentDir);
    }

    return currentDir;
}

function navigateOut(directory: string) {
    let activeDirectory = directory.replace(/node_modules$/, '');
    do {
        if (debug) {
            console.log('navigating out \n', activeDirectory, '->\n', path.join(activeDirectory, '../'))
        }
        activeDirectory = path.join(activeDirectory, '../');
    } while (activeDirectory !== '/' && /node_modules\/?$|\/@[a-zA-Z-_0-9]+\/?$/.test(activeDirectory));
    return activeDirectory;
}

function* createIterator(listItem: ListItem) {
    const {rootDir, basedir} = listItem.options;

    if (Array.isArray(rootDir) || !rootDir) {
        throw new Error('unable to process array');
    }

    let currentDir: string | undefined = getNextValidDirectory(basedir, listItem);
    const root = path.parse(rootDir).root;
    let paths : string[];

    do {
        if (!currentDir) {
            return;
        }

        paths = splitPath(currentDir);

        if (debug) {
            console.log('possible paths for ' + listItem.name + ':', paths);
        }

        yield paths;

        currentDir = navigateOut(currentDir);

        if (debug) {
            console.log('next dir', currentDir);
        }
    } while (currentDir && currentDir !== root);
}


function jestResolver(name: string, options: ResolverOptions) {
    const originalValue = options.defaultResolver(name, options);

    debug = process.env.DEBUG_ENFORCE_PEER_DEPENDENCIES !== undefined;

    if (name.startsWith('.') || !options.moduleDirectory || !originalValue.startsWith('/')) {
        return originalValue;
    }

    if (debug) {
        console.log('PACKAGE', name, options);
    }

    const listItem: ListItem = {name, options, index: list.length};

    list.push(listItem);

    const output = resolveFilename(name, createIterator(listItem), originalValue, options.extensions, debug);

    if (debug) {
        console.log({to: output, from: originalValue});
    }

    return output;
}

jestResolver.list = list;

export = jestResolver;
