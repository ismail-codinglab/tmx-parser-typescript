import { NodeLoader } from './NodeLoader';
import { Loader } from './Loader';
import { ImageLayer, ObjectLayer, TileLayer } from './Layers';
import { TileSet } from './TileSet';
import { Image } from './Image';
import { Tile } from './Tile';
import { TmxObject } from './TmxObject';
import { Terrain } from './Terrain';
import { Map } from './Map';

export = Object.assign(new NodeLoader(), {
    Map,
    TileSet,
    Image,
    Tile,
    ImageLayer,
    TmxObject,
    Terrain,
    TileLayer,
    ObjectLayer,
    NodeLoader,
    Loader
});