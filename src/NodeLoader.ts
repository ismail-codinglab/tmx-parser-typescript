import { Loader } from './Loader';
import { Callback } from './Callback';

const req = eval('require'); // webpack will not try to resolve this

function readFile(file: string, cb: Callback<string>) {
    return req('fs').readFile(file, 'utf-8', cb);
}

export class NodeLoader extends Loader {
    constructor() {
        super(readFile);
    }
}