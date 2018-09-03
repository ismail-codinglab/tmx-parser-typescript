export function noop() {
}

export function int(value: any, defaultValue?: any): number {
    defaultValue = defaultValue == null ? null : defaultValue;
    return value == null ? defaultValue : parseInt(value, 10);
}

export function bool(value: any, defaultValue?: any): boolean {
    defaultValue = defaultValue == null ? null : defaultValue;
    return value == null ? defaultValue : !!parseInt(value, 10);
}

export function float(value: any, defaultValue?: any): number {
    defaultValue = defaultValue == null ? null : defaultValue;
    return value == null ? defaultValue : parseFloat(value);
}

export function parseProperty(value: any, type: string) {
    switch (type) {
        case 'int':
            return parseInt(value, 10);
        case 'float':
            return parseFloat(value);
        case 'bool':
            return value === 'true';
        default:
            return value;
    }
}

export function parsePoints(str: string) {
    const points = str.split(" ");
    return points.map(function(pt) {
        const xy = pt.split(",");
        return {
            x: xy[0],
            y: xy[1],
        };
    });
}
