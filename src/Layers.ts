import { Map } from './Map';
import { Tile } from './Tile';
import { TmxObject } from './TmxObject';

interface BaseLayer {
    type: string;
}

export class TileLayer implements BaseLayer {
    type: 'tile' = 'tile';
    name: string | null;
    opacity: number;
    visible: boolean;
    properties: {};
    tiles: Tile[];
    horizontalFlips: boolean[];
    verticalFlips: boolean[];
    diagonalFlips: boolean[];

    constructor(readonly map: Map) {
        const tileCount = map.width * map.height;
        this.name = null;
        this.opacity = 1;
        this.visible = true;
        this.properties = {};
        this.tiles = new Array(tileCount);
        this.horizontalFlips = new Array(tileCount);
        this.verticalFlips = new Array(tileCount);
        this.diagonalFlips = new Array(tileCount);
    }


    tileAt(x: number, y: number) {
        return this.tiles[y * this.map.width + x];
    }

    setTileAt(x: number, y: number, tile: Tile) {
        this.tiles[y * this.map.width + x] = tile;
    };
}

export class ObjectLayer {
    type: 'object' = 'object';
    name = null;
    color = null;
    opacity = 1;
    visible = true;
    properties = {};
    objects: TmxObject[] = [];
}


export class ImageLayer {
    type: 'image' = "image";
    name = null;
    x = 0;
    y = 0;
    opacity = 1;
    visible = true;
    properties = {};
    image = null;
}

export type Layer = TileLayer | ObjectLayer | ImageLayer;