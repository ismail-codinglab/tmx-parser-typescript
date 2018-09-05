import { Callback } from './Callback';
import { TileSet } from './TileSet';
import { Image } from './Image';
import { Terrain } from './Terrain';
import { Tile } from './Tile';
import { TmxObject } from './TmxObject';
import { Map } from './Map';
import * as path from 'path';
import * as sax from 'sax';
import * as Pend from 'pend';
import { bool, float, int, noop, parsePoints, parseProperty } from './utils';
import { ImageLayer, ObjectLayer, TileLayer } from './Layers';
import * as zlib from 'zlib';

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;

let STATE_COUNT = 0;
const STATE_START = STATE_COUNT++;
const STATE_MAP = STATE_COUNT++;
const STATE_COLLECT_PROPS = STATE_COUNT++;
const STATE_COLLECT_ANIMATIONS = STATE_COUNT++;
const STATE_COLLECT_OBJECT_GROUPS = STATE_COUNT++;
const STATE_WAIT_FOR_CLOSE = STATE_COUNT++;
const STATE_TILESET = STATE_COUNT++;
const STATE_TILE = STATE_COUNT++;
const STATE_TILE_LAYER = STATE_COUNT++;
const STATE_OBJECT_LAYER = STATE_COUNT++;
const STATE_OBJECT = STATE_COUNT++;
const STATE_TILE_OBJECT = STATE_COUNT++;
const STATE_IMAGE_LAYER = STATE_COUNT++;
const STATE_TILE_DATA_XML = STATE_COUNT++;
const STATE_TILE_DATA_CSV = STATE_COUNT++;
const STATE_TILE_DATA_B64_RAW = STATE_COUNT++;
const STATE_TILE_DATA_B64_GZIP = STATE_COUNT++;
const STATE_TILE_DATA_B64_ZLIB = STATE_COUNT++;
const STATE_TERRAIN_TYPES = STATE_COUNT++;
const STATE_TERRAIN = STATE_COUNT++;


export class Loader {
    constructor(private readFile: (file: string, callback: Callback<string>) => void) {
    }

    parseFile(name: string, callback: Callback<Map | TileSet>) {
        this.readFile(name, (err, content) => {
            if (err) {
                callback(err);
            } else {
                this.parse(content!, name, callback);
            }
        });
    }

    parse(content: string, pathToFile: string, cb: Callback<Map | TileSet>) {
        const loader = this;

        let pathToDir = path.dirname(pathToFile);
        let parser = sax.parser(false, {});
        let map: Map;
        let topLevelObject: Map | TileSet | null = null;
        let state = STATE_START;
        let states = new Array(STATE_COUNT);
        let waitForCloseNextState = 0;
        let waitForCloseOpenCount = 0;
        let propertiesObject: any = null;
        let propertiesNextState = 0;
        let animationsObject: any = null;
        let animationsNextState = 0;
        let objectGroupsObject: any = null;
        let objectGroupsNextState = 0;
        let tileIndex = 0;
        let tileSet: TileSet = null as any;
        let tileSetNextState = 0;
        let tile: Tile;
        let layer: any;
        let object: any;
        let terrain: any;
        let pend = new Pend();
        // this holds the numerical tile ids
        // later we use it to resolve the real tiles
        let unresolvedLayers: any[] = [];
        let unresolvedLayer: any;
        states[STATE_START] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'MAP') {
                    map = new Map();
                    topLevelObject = map;
                    map.version = tag.attributes.VERSION;
                    map.orientation = tag.attributes.ORIENTATION;
                    map.width = int(tag.attributes.WIDTH);
                    map.height = int(tag.attributes.HEIGHT);
                    map.tileWidth = int(tag.attributes.TILEWIDTH);
                    map.tileHeight = int(tag.attributes.TILEHEIGHT);
                    map.backgroundColor = tag.attributes.BACKGROUNDCOLOR;

                    state = STATE_MAP;
                } else if (tag.name === 'TILESET') {
                    collectTileSet(tag, STATE_START);
                    topLevelObject = tileSet;
                } else {
                    waitForClose();
                }
            },
            closetag: noop,
            text: noop,
        };
        states[STATE_MAP] = {
            opentag: function (tag: sax.Tag) {
                switch (tag.name) {
                    case 'PROPERTIES':
                        collectProperties(map.properties);
                        break;
                    case 'TILESET':
                        collectTileSet(tag, STATE_MAP);
                        map.tileSets.push(tileSet);
                        break;
                    case 'LAYER':
                        layer = new TileLayer(map);
                        tileIndex = 0;
                        layer.name = tag.attributes.NAME;
                        layer.opacity = float(tag.attributes.OPACITY, 1);
                        layer.visible = bool(tag.attributes.VISIBLE, true);
                        map.layers.push(layer);
                        unresolvedLayer = {
                            layer: layer,
                            tiles: new Array(map.width * map.height),
                        };
                        unresolvedLayers.push(unresolvedLayer);
                        state = STATE_TILE_LAYER;
                        break;
                    case 'OBJECTGROUP':
                        layer = new ObjectLayer();
                        layer.name = tag.attributes.NAME;
                        layer.color = tag.attributes.COLOR;
                        layer.opacity = float(tag.attributes.OPACITY, 1);
                        layer.visible = bool(tag.attributes.VISIBLE, true);
                        map.layers.push(layer);
                        state = STATE_OBJECT_LAYER;
                        break;
                    case 'IMAGELAYER':
                        layer = new ImageLayer();
                        layer.name = tag.attributes.NAME;
                        layer.x = int(tag.attributes.X);
                        layer.y = int(tag.attributes.Y);
                        layer.opacity = float(tag.attributes.OPACITY, 1);
                        layer.visible = bool(tag.attributes.VISIBLE, true);
                        map.layers.push(layer);
                        state = STATE_IMAGE_LAYER;
                        break;
                    default:
                        waitForClose();
                }
            },
            closetag: noop,
            text: noop,
        };
        states[STATE_TILESET] = {
            opentag: function (tag: sax.Tag) {
                switch (tag.name) {
                    case 'TILEOFFSET':
                        tileSet.tileOffset.x = int(tag.attributes.X);
                        tileSet.tileOffset.y = int(tag.attributes.Y);
                        waitForClose();
                        break;
                    case 'PROPERTIES':
                        collectProperties(tileSet.properties);
                        break;
                    case 'IMAGE':
                        tileSet.image = collectImage(tag);
                        break;
                    case 'TERRAINTYPES':
                        state = STATE_TERRAIN_TYPES;
                        break;
                    case 'TILE':
                        tile = new Tile();
                        tile.id = int(tag.attributes.ID);
                        if (tag.attributes.TERRAIN) {
                            let indexes = tag.attributes.TERRAIN.split(",");
                            tile.terrain = indexes.map(resolveTerrain);
                        }
                        tile.probability = float(tag.attributes.PROBABILITY);
                        tileSet.tiles[tile.id] = tile;
                        state = STATE_TILE;
                        break;
                    default:
                        waitForClose();
                }
            },
            closetag: function () {
                state = tileSetNextState;
            },
            text: noop,
        };
        states[STATE_COLLECT_PROPS] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'PROPERTY') {
                    propertiesObject[tag.attributes.NAME] = parseProperty(
                        tag.attributes.VALUE,
                        tag.attributes.TYPE,
                    );
                }
                waitForClose();
            },
            closetag: function () {
                state = propertiesNextState;
            },
            text: noop,
        };
        states[STATE_COLLECT_ANIMATIONS] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'FRAME') {
                    animationsObject.push({
                        'tileId': tag.attributes.TILEID,
                        'duration': tag.attributes.DURATION,
                    });
                }
                waitForClose();
            },
            closetag: function () {
                state = animationsNextState;
            },
            text: noop,
        };
        states[STATE_COLLECT_OBJECT_GROUPS] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'OBJECT') {
                    object = new TmxObject();
                    object.name = tag.attributes.NAME;
                    object.type = tag.attributes.TYPE;
                    object.x = int(tag.attributes.X);
                    object.y = int(tag.attributes.Y);
                    object.width = int(tag.attributes.WIDTH, 0);
                    object.height = int(tag.attributes.HEIGHT, 0);
                    object.rotation = float(tag.attributes.ROTATION, 0);
                    object.gid = int(tag.attributes.GID);
                    object.visible = bool(tag.attributes.VISIBLE, true);
                    objectGroupsObject.push(object);
                    state = STATE_TILE_OBJECT;
                } else {
                    waitForClose();
                }
            },
            closetag: function () {
                state = objectGroupsNextState;
            },
            text: noop,
        };
        states[STATE_WAIT_FOR_CLOSE] = {
            opentag: function () {
                waitForCloseOpenCount += 1;
            },
            closetag: function () {
                waitForCloseOpenCount -= 1;
                if (waitForCloseOpenCount === 0) state = waitForCloseNextState;
            },
            text: noop,
        };
        states[STATE_TILE] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'PROPERTIES') {
                    collectProperties(tile.properties);
                } else if (tag.name === 'IMAGE') {
                    tile.image = collectImage(tag);
                } else if (tag.name === 'ANIMATION') {
                    collectAnimations(tile.animations);
                } else if (tag.name === 'OBJECTGROUP') {
                    collectObjectGroups(tile.objectGroups);
                } else {
                    waitForClose();
                }
            },
            closetag: function () {
                state = STATE_TILESET
            },
            text: noop,
        };
        states[STATE_TILE_LAYER] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'PROPERTIES') {
                    collectProperties(layer.properties);
                } else if (tag.name === 'DATA') {
                    let dataEncoding = tag.attributes.ENCODING;
                    let dataCompression = tag.attributes.COMPRESSION;
                    switch (dataEncoding) {
                        case undefined:
                        case null:
                            state = STATE_TILE_DATA_XML;
                            break;
                        case 'csv':
                            state = STATE_TILE_DATA_CSV;
                            break;
                        case 'base64':
                            switch (dataCompression) {
                                case undefined:
                                case null:
                                    state = STATE_TILE_DATA_B64_RAW;
                                    break;
                                case 'gzip':
                                    state = STATE_TILE_DATA_B64_GZIP;
                                    break;
                                case 'zlib':
                                    state = STATE_TILE_DATA_B64_ZLIB;
                                    break;
                                default:
                                    error(new Error("unsupported data compression: " + dataCompression));
                                    return;
                            }
                            break;
                        default:
                            error(new Error("unsupported data encoding: " + dataEncoding));
                            return;
                    }
                } else {
                    waitForClose();
                }
            },
            closetag: function () {
                state = STATE_MAP;
            },
            text: noop,
        };
        states[STATE_OBJECT_LAYER] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'PROPERTIES') {
                    collectProperties(layer.properties);
                } else if (tag.name === 'OBJECT') {
                    object = new TmxObject();
                    object.name = tag.attributes.NAME;
                    object.type = tag.attributes.TYPE;
                    object.x = int(tag.attributes.X);
                    object.y = int(tag.attributes.Y);
                    object.width = int(tag.attributes.WIDTH, 0);
                    object.height = int(tag.attributes.HEIGHT, 0);
                    object.rotation = float(tag.attributes.ROTATION, 0);
                    object.gid = int(tag.attributes.GID);
                    object.visible = bool(tag.attributes.VISIBLE, true);
                    layer.objects.push(object);
                    state = STATE_OBJECT;
                } else {
                    waitForClose();
                }
            },
            closetag: function () {
                state = STATE_MAP;
            },
            text: noop,
        };
        states[STATE_IMAGE_LAYER] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'PROPERTIES') {
                    collectProperties(layer.properties);
                } else if (tag.name === 'IMAGE') {
                    layer.image = collectImage(tag);
                } else {
                    waitForClose();
                }
            },
            closetag: function () {
                state = STATE_MAP;
            },
            text: noop,
        };
        states[STATE_OBJECT] = {
            opentag: function (tag: sax.Tag) {
                switch (tag.name) {
                    case 'PROPERTIES':
                        collectProperties(object.properties);
                        break;
                    case 'ELLIPSE':
                        object.ellipse = true;
                        waitForClose();
                        break;
                    case 'POLYGON':
                        object.polygon = parsePoints(tag.attributes.POINTS);
                        waitForClose();
                        break;
                    case 'POLYLINE':
                        object.polyline = parsePoints(tag.attributes.POINTS);
                        waitForClose();
                        break;
                    case 'IMAGE':
                        object.image = collectImage(tag);
                        break;
                    default:
                        waitForClose();
                }
            },
            closetag: function () {
                state = STATE_OBJECT_LAYER;
            },
            text: noop,
        };
        states[STATE_TILE_OBJECT] = {
            opentag: function (tag: sax.Tag) {
                switch (tag.name) {
                    case 'PROPERTIES':
                        collectProperties(object.properties);
                        break;
                    case 'ELLIPSE':
                        object.ellipse = true;
                        waitForClose();
                        break;
                    case 'POLYGON':
                        object.polygon = parsePoints(tag.attributes.POINTS);
                        waitForClose();
                        break;
                    case 'POLYLINE':
                        object.polyline = parsePoints(tag.attributes.POINTS);
                        waitForClose();
                        break;
                    case 'IMAGE':
                        object.image = collectImage(tag);
                        break;
                    default:
                        waitForClose();
                }
            },
            closetag: function () {
                state = STATE_COLLECT_OBJECT_GROUPS;
            },
            text: noop,
        };
        states[STATE_TILE_DATA_XML] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'TILE') {
                    saveTile(int(tag.attributes.GID, 0));
                }
                waitForClose();
            },
            closetag: function () {
                state = STATE_TILE_LAYER;
            },
            text: noop,
        };
        states[STATE_TILE_DATA_CSV] = {
            opentag: function () {
                waitForClose();
            },
            closetag: function () {
                state = STATE_TILE_LAYER;
            },
            text: function (text: string) {
                text.split(",").forEach(function (c) {
                    saveTile(parseInt(c, 10));
                });
            },
        };
        states[STATE_TILE_DATA_B64_RAW] = {
            opentag: function () {
                waitForClose();
            },
            closetag: function () {
                state = STATE_TILE_LAYER;
            },
            text: function (text: string) {
                unpackTileBytes(new Buffer(text.trim(), 'base64'));
            },
        };
        states[STATE_TILE_DATA_B64_GZIP] = {
            opentag: function () {
                waitForClose();
            },
            closetag: function () {
                state = STATE_TILE_LAYER;
            },
            text: function (text: string) {
                let zipped = new Buffer(text.trim(), 'base64');
                let oldUnresolvedLayer = unresolvedLayer;
                let oldLayer = layer;
                pend.go(function (cb: (err?: any) => void) {
                    zlib.gunzip(zipped, function (err, buf) {
                        if (err) {
                            cb(err);
                            return;
                        }
                        unresolvedLayer = oldUnresolvedLayer;
                        layer = oldLayer;
                        unpackTileBytes(buf);
                        cb();
                    });
                });
            },
        };
        states[STATE_TILE_DATA_B64_ZLIB] = {
            opentag: function () {
                waitForClose();
            },
            closetag: function () {
                state = STATE_TILE_LAYER;
            },
            text: function (text: string) {
                let zipped = new Buffer(text.trim(), 'base64');
                let oldUnresolvedLayer = unresolvedLayer;
                let oldLayer = layer;
                pend.go(function (cb: (err?: any) => void) {
                    zlib.inflate(zipped, function (err, buf) {
                        if (err) {
                            cb(err);
                            return;
                        }
                        layer = oldLayer;
                        unresolvedLayer = oldUnresolvedLayer;
                        unpackTileBytes(buf);
                        cb();
                    });
                });
            },
        };
        states[STATE_TERRAIN_TYPES] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'TERRAIN') {
                    terrain = new Terrain();
                    terrain.name = tag.attributes.NAME;
                    terrain.tile = int(tag.attributes.TILE);
                    tileSet.terrainTypes.push(terrain);
                    state = STATE_TERRAIN;
                } else {
                    waitForClose();
                }
            },
            closetag: function () {
                state = STATE_TILESET;
            },
            text: noop,
        };
        states[STATE_TERRAIN] = {
            opentag: function (tag: sax.Tag) {
                if (tag.name === 'PROPERTIES') {
                    collectProperties(terrain.properties);
                } else {
                    waitForClose();
                }
            },
            closetag: function () {
                state = STATE_TERRAIN_TYPES;
            },
            text: noop,
        };

        parser.onerror = cb;
        parser.onopentag = function (tag) {
            states[state].opentag(tag);
        };
        parser.onclosetag = function (name) {
            states[state].closetag(name);
        };
        parser.ontext = function (text) {
            states[state].text(text);
        };
        parser.onend = function () {
            // wait until async stuff has finished
            pend.wait(function (err: any) {
                if (err) {
                    cb(err);
                    return;
                }
                // now all tilesets are resolved and all data is decoded
                unresolvedLayers.forEach(resolveLayer);
                cb(null, topLevelObject!);
            });
        };
        parser.write(content).close();

        function resolveTerrain(terrainIndexStr: string) {
            return tileSet.terrainTypes[parseInt(terrainIndexStr, 10)];
        }

        function saveTile(gid: number) {
            layer.horizontalFlips[tileIndex] = !!(gid & FLIPPED_HORIZONTALLY_FLAG);
            layer.verticalFlips[tileIndex] = !!(gid & FLIPPED_VERTICALLY_FLAG);
            layer.diagonalFlips[tileIndex] = !!(gid & FLIPPED_DIAGONALLY_FLAG);

            gid &= ~(FLIPPED_HORIZONTALLY_FLAG |
                FLIPPED_VERTICALLY_FLAG |
                FLIPPED_DIAGONALLY_FLAG);

            unresolvedLayer.tiles[tileIndex] = gid;

            tileIndex += 1;
        }

        function collectImage(tag: sax.Tag) {
            const img = new Image();
            img.format = tag.attributes.FORMAT;
            img.source = tag.attributes.SOURCE;
            img.trans = tag.attributes.TRANS;
            img.width = int(tag.attributes.WIDTH);
            img.height = int(tag.attributes.HEIGHT);

            // TODO: read possible <data>
            waitForClose();
            return img;
        }

        function collectTileSet(tag: sax.Tag, nextState: number) {
            tileSet = new TileSet();
            tileSet.firstGid = int(tag.attributes.FIRSTGID);
            tileSet.source = tag.attributes.SOURCE;
            tileSet.name = tag.attributes.NAME;
            tileSet.tileWidth = int(tag.attributes.TILEWIDTH);
            tileSet.tileHeight = int(tag.attributes.TILEHEIGHT);
            tileSet.spacing = int(tag.attributes.SPACING);
            tileSet.margin = int(tag.attributes.MARGIN);

            if (tileSet.source) {
                pend.go(function (cb: any) {
                    resolveTileSet(tileSet, cb);
                });
            }

            state = STATE_TILESET;
            tileSetNextState = nextState;
        }

        function collectProperties(obj: any) {
            propertiesObject = obj;
            propertiesNextState = state;
            state = STATE_COLLECT_PROPS;
        }

        function collectAnimations(obj: any) {
            animationsObject = obj;
            animationsNextState = state;
            state = STATE_COLLECT_ANIMATIONS;
        }

        function collectObjectGroups(obj: any) {
            objectGroupsObject = obj;
            objectGroupsNextState = state;
            state = STATE_COLLECT_OBJECT_GROUPS;
        }

        function waitForClose() {
            waitForCloseNextState = state;
            state = STATE_WAIT_FOR_CLOSE;
            waitForCloseOpenCount = 1;
        }

        function error(err: any) {
            parser.onerror = null as any;
            parser.onopentag = null as any;
            parser.onclosetag = null as any;
            parser.ontext = null as any;
            parser.onend = null as any;
            cb(err);
        }

        function resolveTileSet(unresolvedTileSet: TileSet, cb: (err?: any) => void) {
            let target = path.join(pathToDir, unresolvedTileSet.source);
            loader.parseFile(target, function (err, resolvedTileSet) {
                if (err) {
                    cb(err);
                    return;
                }
                (resolvedTileSet as TileSet).mergeTo(unresolvedTileSet);
                cb();
            });
        }

        function resolveLayer(unresolvedLayer: any) {
            for (let i = 0; i < unresolvedLayer.tiles.length; i += 1) {
                let globalTileId = unresolvedLayer.tiles[i] as number;
                for (let tileSetIndex = map.tileSets.length - 1;
                     tileSetIndex >= 0; tileSetIndex -= 1) {
                    let tileSet: TileSet = map.tileSets[tileSetIndex];
                    if (tileSet.firstGid <= globalTileId) {
                        let tileId = globalTileId - tileSet.firstGid;
                        let tile: Tile = tileSet.tiles[tileId];
                        if (!tile) {
                            // implicit tile
                            tile = new Tile();
                            tile.id = tileId;
                            tileSet.tiles[tileId] = tile;
                        }
                        tile.gid = globalTileId;
                        unresolvedLayer.layer.tiles[i] = tile;
                        break;
                    }
                }
            }
        }

        function unpackTileBytes(buf: Buffer) {
            let expectedCount = map.width * map.height * 4;
            if (buf.length !== expectedCount) {
                error(new Error("Expected " + expectedCount +
                    " bytes of tile data; received " + buf.length));
                return;
            }
            tileIndex = 0;
            for (let i = 0; i < expectedCount; i += 4) {
                saveTile(buf.readUInt32LE(i));
            }
        }
    }
}