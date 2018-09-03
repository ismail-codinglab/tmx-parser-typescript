export interface Callback<T> {
    (err: any, data?: T): void;
}