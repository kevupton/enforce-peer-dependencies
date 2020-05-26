import path from "path";

export function splitPath(pathname: string) {
    let currentPath = pathname;

    const paths: string[] = [];
    const root = path.parse(pathname).root;

    while (currentPath !== root) {
        paths.push(currentPath);
        currentPath = path.join(currentPath, '../');
    }

    paths.push(root);

    return paths;
}
