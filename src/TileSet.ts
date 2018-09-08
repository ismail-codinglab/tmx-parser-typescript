import { Image } from './Image';
import { Tile } from './Tile';
import { Terrain } from './Terrain';

export class TileSet {
    firstGid = 0;
    source = "";
    name = "";
    tileWidth = 0;
    tileHeight = 0;
    spacing = 0;
    margin = 0;
    tileOffset = { x: 0, y: 0 };
    properties = {};
    image: Image = null as any;
    tiles: (Tile | undefined)[] = [];
    terrainTypes: Terrain[] = [];

    mergeTo(other: TileSet) {
        other.firstGid = this.firstGid == null ? other.firstGid : this.firstGid;
        other.source = this.source == null ? other.source : this.source;
        other.name = this.name == null ? other.name : this.name;
        other.tileWidth = this.tileWidth == null ? other.tileWidth : this.tileWidth;
        other.tileHeight = this.tileHeight == null ? other.tileHeight : this.tileHeight;
        other.spacing = this.spacing == null ? other.spacing : this.spacing;
        other.margin = this.margin == null ? other.margin : this.margin;
        other.tileOffset = this.tileOffset == null ? other.tileOffset : this.tileOffset;
        other.properties = this.properties == null ? other.properties : this.properties;
        other.image = this.image == null ? other.image : this.image;
        other.tiles = this.tiles == null ? other.tiles : this.tiles;
        other.terrainTypes = this.terrainTypes == null ? other.terrainTypes : this.terrainTypes;
    }
}