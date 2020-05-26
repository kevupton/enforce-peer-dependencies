import resolveFilename from "./resolve-filename";

import Module = NodeJS.Module;
import BuiltinModule from "module";

let debug = process.env.DEBUG_ENFORCE_PEER_DEPENDENCIES !== undefined;

// Guard against poorly mocked module constructors
const nodeModule : any = module.constructor.length > 1
    ? module.constructor
    : BuiltinModule;

const previousMethod = nodeModule._resolveFilename;

function *createIterator (startModule: Module) {
    let activeModule : Module | null = startModule;

    while (activeModule) {
        yield activeModule.paths || [];
        activeModule = activeModule.parent;
    }
}

nodeModule._resolveFilename = function (...args: any[]) {
    const request : string = args[0];
    const packageModule : Module = args[1];
    const isMain : boolean = args[2];
    const options : any = args[3];

    debug = process.env.DEBUG_ENFORCE_PEER_DEPENDENCIES !== undefined;

    const callPreviousMethod = () => previousMethod.apply(this, args);

    if (request.startsWith('.')) {
        return callPreviousMethod();
    }

    // we dont want to look at the root module. We want to look at any possible linked module.
    if (!packageModule.parent) {
        return callPreviousMethod();
    }

    const output = resolveFilename(request, createIterator(packageModule), callPreviousMethod, undefined,process.env.DEBUG_ENFORCE_PEER_DEPENDENCIES !== undefined);

    if (debug) {
        console.log({ to: output, from: callPreviousMethod() });
    }

    return output;
};
