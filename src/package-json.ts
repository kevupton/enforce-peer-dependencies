import path from "path";
import fs from "fs";

export interface PackageJson {
    [key: string]: any;
}

export function toPackageJsonPath(modulePath: string) {
    return path.join(modulePath.replace(/node_modules$/, ''), 'package.json')
}

export function fetchPackageJsonPath(paths: string[]) {
    return paths
        // remove node_modules from the end of all directories, and add package.json
        .map(toPackageJsonPath)
        // find the first directory that has a package.json
        .find(packageJsonPath => fs.existsSync(packageJsonPath));
}

export function fetchPackageJson(packageJsonPath: string): PackageJson | undefined {
    try {
        // Read the package json into a object. Or at least try to.
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (e) {
        return undefined;
    }
}
