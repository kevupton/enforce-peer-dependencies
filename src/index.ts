import resolveFilename from "./resolve-filename";
import BuiltinModule from "module";
import {fetchPackageJsonPath} from "./package-json";
import path from "path";
import Module = NodeJS.Module;

let debug = process.env.DEBUG_ENFORCE_PEER_DEPENDENCIES !== undefined;

// Guard against poorly mocked module constructors
const nodeModule: any = module.constructor.length > 1
    ? module.constructor
    : BuiltinModule;

const previousMethod = nodeModule._resolveFilename;

function* createIterator(startModule: Module) {
    let activeModule: Module | null = startModule;

    while (activeModule) {
        yield activeModule.paths || [];
        activeModule = activeModule.parent;
    }
}

nodeModule._resolveFilename = function (...args: any[]) {
    const request: string = args[0];
    const packageModule: Module = args[1];
    const isMain: boolean = args[2];
    const options: any = args[3];

    debug = process.env.DEBUG_ENFORCE_PEER_DEPENDENCIES !== undefined;

    const originalValue = previousMethod.apply(this, args);

    if (request.startsWith('.') || request.startsWith('/') || !originalValue.startsWith('/')) {
        if (debug) {
            console.log('RETURNING ORIGINAL', request, originalValue);
        }
        return originalValue;
    }

    let rootModule = packageModule;
    while (rootModule.parent) {
        rootModule = rootModule.parent;
    }

    const packageJsonPath = fetchPackageJsonPath(rootModule.paths);

    if (!packageJsonPath) {
        console.warn('Could not find package json for root module.', rootModule);
        return originalValue;
    }

    const rootPath = path.join(packageJsonPath, '../');

    if (debug) {
        console.log('PACKAGE', request);
    }

    const output = resolveFilename(
        request,
        createIterator(packageModule),
        originalValue,
        rootPath,
        undefined,
        debug
    );

    if (debug) {
        console.log('RESULTS', {to: output, from: originalValue});
    }

    return output;
};
