import { Image } from './Image';

export interface Animation {
    tileId: number;
}

export class Tile {
    id = 0;
    gid: number = void 0 as any;
    terrain: any[] = [];
    probability: number | null = null;
    properties = {};
    animations: Animation[] = [];
    objectGroups = [];
    image: Image | null = null;
}
