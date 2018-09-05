import { Layer } from './Layers';
import { TileSet } from './TileSet';

export class Map {
    version: string = null as any;
    orientation = "orthogonal";
    width = 0;
    height = 0;
    tileWidth = 0;
    tileHeight = 0;
    backgroundColor: string = null as any;
    layers: Layer[] = [];
    properties = {};
    tileSets: TileSet[] = [];
}