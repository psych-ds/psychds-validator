// ColumnsMap stores parsed CSV/TSV columns keyed by their header name.
//
// It is backed by a null-prototype object rather than a Map so that header
// names which collide with built-in prototype members — most importantly
// "size" (a getter-only accessor on Map.prototype), but also "constructor",
// "hasOwnProperty", and similar — can be assigned as ordinary properties
// without throwing a TypeError under strict mode. Downstream code reads
// columns purely via property access (`columns[header]`,
// `Object.keys(columns)`, `header in columns`), so a plain null-prototype
// object is both sufficient and safer than a Map. See issue #108.
export class ColumnsMap {
  [key: string]: string[];
  constructor() {
    return Object.create(null);
  }
}
