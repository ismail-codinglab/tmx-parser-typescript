import { Loader } from './Loader';
import { Callback } from './Callback';

let req: any;

function cachedNodeRequire(module: string) {
    if (!req) {
        req = eval('require'); // webpack will not try to resolve this
    }
    return req(module);
}


function readFile(file: string, cb: Callback<string>) {
    return cachedNodeRequire('fs').readFile(file, 'utf-8', cb);
}

export class NodeLoader extends Loader {
    constructor() {
        super(readFile);
    }
}